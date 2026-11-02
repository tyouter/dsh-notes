/**
 * The notebook's queryable database.
 *
 * `notes.json` stays the source of truth: it is human-readable, diffable, and
 * survives OneDrive sync. This module maintains a **SQLite projection** of it —
 * `index.db` — so the assistant can ask real questions instead of being handed a
 * truncated text dump:
 *
 *   notes      one row per live note, with its body
 *   note_tags  one row per (note, tag), so tag questions are a GROUP BY
 *   events     every AI call and interaction, as a row
 *   messages   the AI question/answer transcript
 *
 * The projection is disposable: delete `index.db` and it is rebuilt on the next
 * read. That is deliberate — a cache must never hold data the JSON files do not.
 */

import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** node:sqlite is present from Node 22.5 onward; the app ships Node 24. */
async function openSqlite() {
  try {
    const module = await import('node:sqlite')
    return module.DatabaseSync ?? null
  } catch {
    return null
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS notes (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '',
  source     TEXT NOT NULL DEFAULT 'panel',
  pinned     INTEGER NOT NULL DEFAULT 0,
  chars      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS note_tags (
  note_id TEXT NOT NULL,
  tag     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS note_tags_tag ON note_tags(tag);
CREATE TABLE IF NOT EXISTS events (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  at                TEXT NOT NULL,
  kind              TEXT NOT NULL,
  note_id           TEXT,
  chars             INTEGER,
  elapsed_ms        INTEGER,
  first_token_ms    INTEGER,
  ok                INTEGER,
  detail            TEXT,
  -- Token accounting: what each model call cost and how big its context was.
  model             TEXT,
  input_tokens      INTEGER,
  output_tokens     INTEGER,
  cache_read_tokens INTEGER,
  cache_write_tokens INTEGER,
  reasoning_tokens  INTEGER,
  context_messages  INTEGER,
  context_chars     INTEGER
);
CREATE INDEX IF NOT EXISTS events_at ON events(at);
CREATE INDEX IF NOT EXISTS events_kind ON events(kind);
CREATE TABLE IF NOT EXISTS messages (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      TEXT NOT NULL,
  role    TEXT NOT NULL,
  text    TEXT NOT NULL,
  action  TEXT
);
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

/** A read-only-ish handle over the projection, created on demand. */
export class NotesDatabase {
  constructor(store, { logger } = {}) {
    this.store = store
    this.logger = logger
    this.handle = undefined
    this.available = undefined
  }

  get file() {
    return join(this.store.resolveDirectory(), 'index.db')
  }

  /** Open (once) and make sure the schema exists. */
  async open() {
    if (this.available === false) return undefined
    if (this.handle !== undefined) return this.handle
    const DatabaseSync = await openSqlite()
    if (DatabaseSync === null) {
      this.available = false
      this.logger?.warn?.('[notes] node:sqlite is unavailable; the query tools are disabled')
      return undefined
    }
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      const db = new DatabaseSync(this.file)
      db.exec(SCHEMA)
      // A projection written before token accounting has the narrow events table;
      // add the columns in place so an existing index.db keeps working.
      const columns = new Set(db.prepare('PRAGMA table_info(events)').all().map((row) => row.name))
      for (const [name, type] of [
        ['model', 'TEXT'],
        ['input_tokens', 'INTEGER'],
        ['output_tokens', 'INTEGER'],
        ['cache_read_tokens', 'INTEGER'],
        ['cache_write_tokens', 'INTEGER'],
        ['reasoning_tokens', 'INTEGER'],
        ['context_messages', 'INTEGER'],
        ['context_chars', 'INTEGER'],
      ]) {
        if (columns.has(name)) continue
        db.exec('ALTER TABLE events ADD COLUMN ' + name + ' ' + type)
      }
      this.handle = db
      this.available = true
      return db
    } catch (error) {
      this.available = false
      this.logger?.warn?.(`[notes] could not open ${this.file}: ${error?.message ?? error}`)
      return undefined
    }
  }

  close() {
    try {
      this.handle?.close()
    } catch {
      /* closing twice is fine */
    }
    this.handle = undefined
  }

  /** Rebuild the notes tables from the store's JSON. Cheap at notebook scale. */
  async syncNotes() {
    const db = await this.open()
    if (db === undefined) return { synced: false, notes: 0 }
    const { notes } = await this.store.list({ limit: 0 })
    const stamp = `${notes.length}:${notes.reduce((sum, note) => sum + String(note.updatedAt ?? '').length, 0)}`
    const previous = db.prepare('SELECT value FROM meta WHERE key = ?').get('notes-stamp')
    if (previous !== undefined && previous.value === stamp && stamp !== '0:') {
      return { synced: false, notes: notes.length }
    }

    db.exec('BEGIN')
    try {
      db.exec('DELETE FROM notes')
      db.exec('DELETE FROM note_tags')
      const insertNote = db.prepare(
        'INSERT INTO notes (id, title, body, source, pinned, chars, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      const insertTag = db.prepare('INSERT INTO note_tags (note_id, tag) VALUES (?, ?)')
      for (const note of notes) {
        const body = String(note.body ?? '')
        insertNote.run(
          String(note.id),
          String(note.title ?? ''),
          body,
          String(note.source ?? 'panel'),
          note.pinned === true ? 1 : 0,
          body.length,
          String(note.createdAt ?? ''),
          String(note.updatedAt ?? ''),
        )
        for (const tag of Array.isArray(note.tags) ? note.tags : []) {
          insertTag.run(String(note.id), String(tag))
        }
      }
      db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
        'notes-stamp',
        stamp,
      )
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    return { synced: true, notes: notes.length }
  }

  /** Mirror the event log into the table the assistant queries. */
  async syncEvents(events) {
    const db = await this.open()
    if (db === undefined) return { synced: false }
    const list = Array.isArray(events) ? events : []
    const count = db.prepare('SELECT COUNT(*) AS n FROM events').get()?.n ?? 0
    if (count >= list.length) return { synced: false }
    const insert = db.prepare(
      'INSERT INTO events (at, kind, note_id, chars, elapsed_ms, first_token_ms, ok, detail, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens, context_messages, context_chars) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    db.exec('BEGIN')
    try {
      db.exec('DELETE FROM events')
      for (const event of list) {
        const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : null)
        insert.run(
          String(event.at ?? ''),
          String(event.kind ?? ''),
          event.noteId === undefined ? null : String(event.noteId),
          num(event.chars),
          num(event.elapsedMs),
          num(event.firstTokenMs),
          event.ok === undefined ? null : event.ok === true ? 1 : 0,
          typeof event.detail === 'string' ? event.detail : null,
          event.model === undefined ? null : String(event.model),
          num(event.inputTokens),
          num(event.outputTokens),
          num(event.cacheReadTokens),
          num(event.cacheWriteTokens),
          num(event.reasoningTokens),
          num(event.contextMessages),
          num(event.contextChars),
        )
      }
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    return { synced: true, events: list.length }
  }

  /** Record one AI exchange so it can be queried later. */
  async logMessage({ role, text, action }) {
    const db = await this.open()
    if (db === undefined) return
    db.prepare('INSERT INTO messages (at, role, text, action) VALUES (?, ?, ?, ?)').run(
      new Date().toISOString(),
      String(role ?? 'user'),
      String(text ?? ''),
      action === undefined ? null : String(action),
    )
  }

  /** Bring the projection up to date; safe to call before every query. */
  async ready(events) {
    const synced = await this.syncNotes()
    if (Array.isArray(events)) await this.syncEvents(events)
    return synced
  }

  /** Run one guarded SELECT. Only reads, at most `limit` rows. */
  async select(sql, params = [], { limit = 200 } = {}) {
    const db = await this.open()
    if (db === undefined) throw Object.assign(new Error('查询库不可用（node:sqlite 缺失）。'), { code: 'NO_DB' })
    const statement = String(sql ?? '').trim()
    const lower = statement.toLowerCase()
    if (!lower.startsWith('select') && !lower.startsWith('with')) {
      throw Object.assign(new Error('只允许查询（SELECT / WITH）。'), { code: 'READ_ONLY' })
    }
    if (/;\s*\S/.test(statement)) {
      throw Object.assign(new Error('一次只能执行一条语句。'), { code: 'ONE_STATEMENT' })
    }
    const prepared = db.prepare(statement)
    const rows = prepared.all(...(Array.isArray(params) ? params : []))
    return rows.slice(0, Math.min(Math.max(Number(limit) || 200, 1), 500))
  }

  /** The tables and columns the assistant is allowed to know about. */
  schemaText() {
    return [
      'notes(id, title, body, source, pinned, chars, created_at, updated_at)',
      'note_tags(note_id, tag)',
      'events(id, at, kind, note_id, chars, elapsed_ms, first_token_ms, ok, detail, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens, context_messages, context_chars)',
      'messages(id, at, role, text, action)',
      '',
      'notes 是笔记正文（body 是全文）；note_tags 每行一个标签；',
      'events 是用户与 AI 的交互埋点（kind 如 enhance、copilot.polish、board.turn）；input_tokens/output_tokens/cache_read_tokens 是 token 用量，context_messages/context_chars 是当次请求的上下文规模；',
      'messages 是问答记录（role=user/assistant）。时间均为 ISO 字符串，可直接比较。',
    ].join('\n')
  }
}
