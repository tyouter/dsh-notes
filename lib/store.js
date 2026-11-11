/**
 * The notebook store: plain JSON under one directory, no hidden state.
 *
 * Two files form the whole notebook:
 *   notes.json     the working set - every note the user has not deleted
 *   trash.json     deleted notes, kept so a deletion is never final by accident
 *
 * A third file, `links.json`, only holds which conversation was created for
 * the AI side of the notebook. It is an index, not content: losing it costs one
 * conversation, never a note.
 *
 * Files are written through a temp file + rename so an interrupted write can
 * never leave a half-written notebook behind.
 */

import { appendFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve as resolvePath, sep } from 'node:path'

const SCHEMA_VERSION = 1
const MAX_TITLE = 200
const MAX_BODY = 1_000_000
const MAX_TRASH = 200
const NOTE_SOURCES = new Set(['panel', 'command', 'agent', 'ai'])

/** A failure with a status the HTTP layer and the tool can report verbatim. */
export class NotesError extends Error {
  constructor(message, code = 'NOTES_ERROR', status = 400) {
    super(message)
    this.name = 'NotesError'
    this.code = code
    this.status = status
  }
}

/**
 * Activation marker: a fresh line every time the host process loads this
 * module, so a restart can be confirmed from outside by reading the file.
 * Best-effort; a read-only profile must not break activation.
 */
try {
  await appendFile(
    resolvePath(process.env.DSH_HOME ?? process.cwd(), 'notes-plugin-activation.log'),
    `${new Date().toISOString()} load ${process.pid}\n`,
    'utf8',
  ).catch(() => {})
} catch {
  /* tracing must never fail activation */
}

function nowIso() {
  return new Date().toISOString()
}

/** Stable, filename-safe id; time-ordered so a listing reads like a log. */
function newId(prefix = 'n') {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  const random = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${stamp}-${random}`
}

/** The first non-empty line of the body, used as the note's title. */
export /** Lines that are only Markdown furniture carry no title. */
const FURNITURE = /^\s*(?:[-*_]\s*){3,}$|^\s*`{3,}.*$|^\s*(?:>\s*)*$/

/** Reduce one line to the words a title should contain. */
function titleFromLine(line) {
  let value = String(line ?? '')
  // Structural prefixes: headings, quotes, bullets, ordered list markers.
  value = value.replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/, '')
  // Inline marks: bold/italic/code wrappers and stray emphasis characters.
  value = value.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1')
  value = value.replace(/`([^`]+)`/g, '$1').replace(/[*_~`]+/g, '')
  // Links keep their label, not their target.
  value = value.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Cut a title at a sentence end, else at a word boundary, else at the limit.
 *
 * The first sentence wins even when the line fits: a paragraph's opening sentence is
 * a better title than the whole paragraph run together.
 */
function clipTitle(value) {
  const LIMIT = 42
  const sentence = value.match(/^(.{8,}?)[。！？.!?;；]/)
  if (sentence !== null) return sentence[1].trim()
  if (value.length <= LIMIT) return value
  const head = value.slice(0, LIMIT)
  const space = head.lastIndexOf(' ')
  if (space > LIMIT * 0.6) return head.slice(0, space).trim()
  return head.trim()
}

/**
 * A title derived from the body, for notes saved without one.
 *
 * Skips blank lines and Markdown furniture, unwraps inline marks, and returns the
 * first sentence rather than the first paragraph, so "### 待办\n\n- 对齐接口" is
 * titled 待办 rather than the list marker or a truncated sentence run-on.
 */
export function deriveTitle(body, fallback = '') {
  let fenced = false
  for (const line of String(body ?? '').split(/\r?\n/)) {
    // A fence line toggles the block; its contents are code, not prose.
    if (/^\s*`{3,}/.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    if (FURNITURE.test(line)) continue
    const value = titleFromLine(line)
    if (value === '') continue
    return clipTitle(value).slice(0, MAX_TITLE)
  }
  return String(fallback ?? '').slice(0, MAX_TITLE)
}

/** True when a stored title is only Markdown furniture, so it is worth re-deriving. */
export function isMeaninglessTitle(title) {
  const value = String(title ?? '').trim()
  if (value === '') return true
  return FURNITURE.test(value) || /^[-*_#>`\s]+$/.test(value)
}

/** A tag's display form: no leading `#`, no whitespace, no commas. */
export function normalizeTag(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/^#+/, '')
    .replace(/[,\s]+/g, '-')
    .slice(0, 40)
}

/** Merge tag lists case-insensitively, keeping the first spelling seen. */
export function mergeTags(...lists) {
  const seen = new Map()
  for (const list of lists) {
    if (!Array.isArray(list)) continue
    for (const entry of list) {
      const tag = normalizeTag(entry)
      if (tag === '') continue
      const key = tag.toLowerCase()
      if (!seen.has(key)) seen.set(key, tag)
    }
  }
  return [...seen.values()]
}

/** Fold text for search: lowercase, and strip whitespace so CJK queries match across line breaks. */
function fold(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
}

function emptyFile(kind) {
  return { version: SCHEMA_VERSION, kind, notes: [] }
}

export class NoteStore {
  constructor({ ctx, config, hooks }) {
    this.ctx = ctx
    this.config = config
    this.directory = undefined
    this.loaded = undefined
    // `onWrite({ type, note, previous })` runs after every persist: the host half hangs revision
    // keeping and the backup schedule on it, so the store itself stays ignorant of both.
    this.hooks = hooks
  }

  /**
   * Tell the hook that something was written. A failing hook must never fail the write: a backup that
   * cannot reach its destination is a status line, not a lost note.
   */
  async notifyWrite(detail) {
    const onWrite = this.hooks?.onWrite
    if (typeof onWrite !== 'function') return
    try {
      await onWrite(detail)
    } catch (error) {
      try {
        this.hooks?.onError?.(error)
      } catch {
        /* a broken error handler is still not a reason to fail the save */
      }
    }
  }

  // ------------------------------------------------------------- files ---

  /**
   * Resolve the notebook directory.
   *
   * A relative `notesPath` is anchored on the *default workspace* - the folder
   * the window opens in - never on whichever session happens to call first: a
   * panel opened before any session exists must land in the same place as one
   * bound to a random conversation. An absolute path is used as-is.
   */
  resolveDirectory() {
    if (this.directory !== undefined) return this.directory
    const configured = String(this.config?.notesPath ?? 'notes-vault').trim() || 'notes-vault'
    if (isAbsolute(configured) || /^[a-zA-Z]:[\\/]/.test(configured) || configured.startsWith('\\\\')) {
      this.directory = resolvePath(configured)
      return this.directory
    }
    const base = this.workspaceBase()
    this.directory = base === undefined ? resolvePath(configured) : join(base, configured)
    return this.directory
  }

  /**
   * The default workspace directory, from the durable registry.
   *
   * Deliberately *not* "the cwd of whoever called": in this deployment a plugin
   * request carries no session, so the process directory is the profile - the
   * notebook must not silently land there. Order: registry default workspace,
   * then the first registered workspace, then an explicit env override.
   */
  workspaceBase() {
    const registry = this.ctx?.get?.('workspaceRegistry')
    try {
      const workspaces = registry?.list?.() ?? []
      if (workspaces.length > 0) {
        const global = registry?.global?.get?.()
        const defaultId = global?.defaultWorkspaceId
        const preferred = defaultId !== undefined ? workspaces.find((entry) => entry.id === defaultId) : undefined
        const chosen = preferred ?? workspaces[0]
        if (typeof chosen?.path === 'string' && chosen.path !== '') return chosen.path
      }
    } catch {
      /* a missing registry is not an error */
    }
    const fromEnv = process.env.DSH_WORKSPACE
    if (typeof fromEnv === 'string' && fromEnv !== '') return fromEnv
    return undefined
  }

  file(name) {
    return join(this.resolveDirectory(), name)
  }

  async readFileSafe(path) {
    try {
      return await readFile(path, 'utf8')
    } catch (error) {
      if (error?.code === 'ENOENT') return undefined
      throw error
    }
  }

  /**
   * Write through a temp file, then rename.
   *
   * The rename is retried and finally skipped: on Windows a synced folder
   * (OneDrive) or a virus scanner can hold the destination handle for a moment,
   * which surfaces as EPERM/EBUSY. Losing a note to that race is worse than a
   * non-atomic write, so the fallback is an in-place write.
   */
  async writeFileSafe(path, content) {
    await mkdir(dirname(path), { recursive: true })
    const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
    await writeFile(temporary, content, 'utf8')
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await rename(temporary, path)
        return
      } catch (error) {
        const code = error?.code
        if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') throw error
        await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)))
      }
    }
    await writeFile(path, content, 'utf8')
    await rm(temporary, { force: true }).catch(() => {})
  }

  /** A cheap identity for a file: the same mtime and size means the same bytes. */
  async stampOf(name) {
    try {
      const info = await stat(this.file(name))
      return `${info.mtimeMs}:${info.size}`
    } catch {
      return 'missing'
    }
  }

  /** Have the three data files changed since we last read them? */
  async isStale() {
    if (this.stamp === undefined) return true
    const [notes, trash, links] = await Promise.all([
      this.stampOf('notes.json'),
      this.stampOf('trash.json'),
      this.stampOf('links.json'),
    ])
    return notes !== this.stamp.notes || trash !== this.stamp.trash || links !== this.stamp.links
  }

  /**
   * Load the notebook, and reload it when the files changed underneath us.
   *
   * The in-memory copy is the authority for this process, but the notebook is plain JSON on disk: a
   * second window, an editor, or a sync can rewrite it. Without the stamp check those edits stayed
   * invisible until restart, which is what "the history is stale until I click it" looked like.
   */
  async load() {
    if (this.loaded !== undefined && (await this.isStale()) === false) return this.loaded
    const [notesText, trashText, linksText] = await Promise.all([
      this.readFileSafe(this.file('notes.json')),
      this.readFileSafe(this.file('trash.json')),
      this.readFileSafe(this.file('links.json')),
    ])
    this.loaded = {
      notes: parseFile(notesText, 'notes'),
      trash: parseFile(trashText, 'trash'),
      links: parseLinks(linksText),
    }
    this.stamp = {
      notes: await this.stampOf('notes.json'),
      trash: await this.stampOf('trash.json'),
      links: await this.stampOf('links.json'),
    }
    return this.loaded
  }

  async persistNotes() {
    const data = await this.load()
    await this.writeFileSafe(this.file('notes.json'), `${JSON.stringify(data.notes, null, 2)}\n`)
    this.stamp = { ...(this.stamp ?? {}), notes: await this.stampOf('notes.json') }
  }

  async persistTrash() {
    const data = await this.load()
    await this.writeFileSafe(this.file('trash.json'), `${JSON.stringify(data.trash, null, 2)}\n`)
    this.stamp = { ...(this.stamp ?? {}), trash: await this.stampOf('trash.json') }
  }

  async persistLinks() {
    const data = await this.load()
    await this.writeFileSafe(this.file('links.json'), `${JSON.stringify(data.links, null, 2)}\n`)
  }

  // -------------------------------------------------------------- notes ---

  /** Every live note, newest first, with the pinned ones on top. */
  async list({ query = '', tag = '', includeTrash = false, limit = 0 } = {}) {
    const data = await this.load()
    const pool = includeTrash ? [...data.trash.notes] : [...data.notes.notes]
    const needle = fold(query)
    const tagKey = normalizeTag(tag).toLowerCase()
    const filtered = pool.filter((note) => {
      if (tagKey !== '' && !note.tags.some((entry) => entry.toLowerCase() === tagKey)) return false
      if (needle === '') return true
      return fold(`${note.body}\n${note.tags.join(' ')}`).includes(needle)
    })
    filtered.sort(compareNotes)
    const sliced = limit > 0 ? filtered.slice(0, limit) : filtered
    return { notes: sliced, total: filtered.length }
  }

  async get(id) {
    const data = await this.load()
    const live = data.notes.notes.find((note) => note.id === id)
    if (live !== undefined) return { note: live, trashed: false }
    const deleted = data.trash.notes.find((note) => note.id === id)
    if (deleted !== undefined) return { note: deleted, trashed: true }
    throw new NotesError(`找不到笔记 ${id}`, 'NOT_FOUND', 404)
  }

  async tags() {
    const data = await this.load()
    const counts = new Map()
    for (const note of data.notes.notes) {
      for (const tag of note.tags) {
        const key = tag.toLowerCase()
        const current = counts.get(key)
        if (current === undefined) counts.set(key, { tag, count: 1 })
        else current.count += 1
      }
    }
    return [...counts.values()].sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag))
  }

  /**
   * Snapshot for the AI side: every note with its body, plus the tag index.
   * One read so a conversation always sees a consistent picture.
   */
  async snapshot({ limit = 200 } = {}) {
    const { notes, total } = await this.list({ limit })
    return { notes, total, tags: await this.tags(), location: this.location() }
  }

  /**
   * Create a note, or replace the content of an existing one.
   *
   * `body` wins over `text` (the conventional alias). A new note with an empty
   * body is refused, because an empty note is indistinguishable from a mistake.
   * `source` records who wrote it: panel, command, agent (the tool) or ai (the
   * notebook's own assistant through an approved draft); `enhancedFrom` points
   * at the id of the note an AI prose pass rewrote.
   */
  async save({ id, body, content, text, tags, pinned, source, enhancedFrom } = {}) {
    const raw = body ?? content ?? text ?? ''
    if (typeof raw !== 'string') throw new NotesError('笔记正文必须是字符串。', 'BAD_REQUEST')
    if (raw.length > MAX_BODY) throw new NotesError(`笔记太长（上限 ${MAX_BODY} 字符）。`, 'BAD_REQUEST')
    const data = await this.load()
    const stamp = nowIso()

    if (id !== undefined && id !== null && String(id) !== '') {
      const note = data.notes.notes.find((entry) => entry.id === String(id))
      if (note === undefined) {
        const deleted = data.trash.notes.find((entry) => entry.id === String(id))
        if (deleted === undefined) throw new NotesError(`找不到笔记 ${id}`, 'NOT_FOUND', 404)
        throw new NotesError(`笔记 ${id} 在回收站里，先恢复再修改。`, 'IN_TRASH', 409)
      }
      // Taken before the body is replaced: this is the version the history keeps.
      const previous = { id: note.id, body: note.body, title: note.title, tags: [...note.tags], updatedAt: note.updatedAt }
      if (raw.trim() !== '') note.body = raw
      note.title = deriveTitle(note.body)
      note.updatedAt = stamp
      if (tags !== undefined) note.tags = mergeTags(note.tags, tags)
      if (typeof pinned === 'boolean') note.pinned = pinned
      if (typeof source === 'string' && NOTE_SOURCES.has(source)) note.source = source
      await this.persistNotes()
      await this.notifyWrite({ type: 'save', note: { ...note, tags: [...note.tags] }, previous })
      return { note, created: false }
    }

    if (raw.trim() === '') throw new NotesError('空笔记不会保存。', 'EMPTY', 400)
    const note = {
      id: newId(),
      body: raw,
      title: deriveTitle(raw),
      tags: mergeTags(tags),
      pinned: pinned === true,
      createdAt: stamp,
      updatedAt: stamp,
    }
    if (typeof source === 'string' && NOTE_SOURCES.has(source)) note.source = source
    if (typeof enhancedFrom === 'string' && enhancedFrom !== '') note.enhancedFrom = enhancedFrom.slice(0, 80)
    data.notes.notes.push(note)
    await this.persistNotes()
    await this.notifyWrite({ type: 'create', note: { ...note, tags: [...note.tags] } })
    return { note, created: true }
  }

  /**
   * Apply per-note changes without replacing the body: pin, tags, or both.
   * `tags` with `replace: true` overwrites the tag list instead of merging.
   */
  async update({ id, pinned, tags, replace } = {}) {
    const reference = String(id ?? '')
    if (reference === '') throw new NotesError('需要 id。', 'BAD_REQUEST')
    const data = await this.load()
    const note = data.notes.notes.find((entry) => entry.id === reference)
    if (note === undefined) throw new NotesError(`找不到笔记 ${reference}`, 'NOT_FOUND', 404)
    if (typeof pinned === 'boolean') note.pinned = pinned
    if (Array.isArray(tags)) note.tags = replace === true ? mergeTags(tags) : mergeTags(note.tags, tags)
    note.updatedAt = nowIso()
    await this.persistNotes()
    await this.notifyWrite({ type: 'update', note: { ...note, tags: [...note.tags] } })
    return { note }
  }

  /** Move a note to the trash. Repeated deletion is harmless. */
  async remove(id) {
    const reference = String(id ?? '')
    if (reference === '') throw new NotesError('需要 id。', 'BAD_REQUEST')
    const data = await this.load()
    const index = data.notes.notes.findIndex((entry) => entry.id === reference)
    if (index === -1) {
      if (data.trash.notes.some((entry) => entry.id === reference)) return { deleted: true, alreadyTrashed: true }
      throw new NotesError(`找不到笔记 ${reference}`, 'NOT_FOUND', 404)
    }
    const [note] = data.notes.notes.splice(index, 1)
    data.trash.notes.unshift({ ...note, deletedAt: nowIso() })
    // The trash is a safety net, not a second notebook: the oldest entries fall off.
    data.trash.notes = data.trash.notes.slice(0, MAX_TRASH)
    await this.persistNotes()
    await this.persistTrash()
    await this.notifyWrite({ type: 'remove', note: { ...note, tags: [...note.tags] } })
    return { deleted: true, note }
  }

  /** Put a trashed note back into the notebook. */
  /** The deleted notes, for statistics and the restore list. */
  async trashed() {
    const data = await this.load()
    return [...data.trash.notes]
  }

  async restore(id) {
    const reference = String(id ?? '')
    const data = await this.load()
    const index = data.trash.notes.findIndex((entry) => entry.id === reference)
    if (index === -1) {
      if (data.notes.notes.some((entry) => entry.id === reference)) return { restored: true, alreadyPresent: true }
      throw new NotesError(`回收站里没有笔记 ${reference}`, 'NOT_FOUND', 404)
    }
    const [note] = data.trash.notes.splice(index, 1)
    delete note.deletedAt
    note.updatedAt = nowIso()
    data.notes.notes.push(note)
    await this.persistTrash()
    await this.persistNotes()
    await this.notifyWrite({ type: 'restore', note: { ...note, tags: [...note.tags] } })
    return { restored: true, note }
  }

  // ---------------------------------------------------------------- ai ---

  /** The conversation bound to a notebook context, if one was ever created. */
  async linkOf(kind) {
    const data = await this.load()
    const entry = data.links[kind]
    return typeof entry?.sessionId === 'string' && entry.sessionId !== '' ? entry : undefined
  }

  async bindLink(kind, sessionId, extra = {}) {
    const data = await this.load()
    data.links[kind] = { sessionId: String(sessionId), at: nowIso(), ...extra }
    await this.persistLinks()
    return data.links[kind]
  }

  async clearLink(kind) {
    const data = await this.load()
    delete data.links[kind]
    await this.persistLinks()
  }

  /** Where the notebook lives, for diagnostics and the panel footer. */
  location() {
    const directory = this.resolveDirectory()
    const base = this.workspaceBase()
    let display = directory
    if (base !== undefined) {
      const inside = relative(base, directory)
      if (inside !== '' && !inside.startsWith('..') && !isAbsolute(inside)) display = inside.split(sep).join('/')
    }
    return { directory, display, notesFile: 'notes.json', trashFile: 'trash.json' }
  }
}

/** Sort: pinned first, then most recently updated. */
function compareNotes(left, right) {
  if (left.pinned !== right.pinned) return left.pinned ? -1 : 1
  return String(right.updatedAt).localeCompare(String(left.updatedAt))
}

/** Parse one notebook file, repairing a damaged or older one instead of failing. */
function parseFile(text, kind) {
  if (text === undefined || text.trim() === '') return emptyFile(kind)
  try {
    const parsed = JSON.parse(text)
    const notes = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.notes) ? parsed.notes : []
    return { version: SCHEMA_VERSION, kind, notes: notes.map((note) => repairNote(note, kind)).filter(Boolean) }
  } catch {
    return emptyFile(kind)
  }
}

function repairNote(raw, kind) {
  if (raw === null || typeof raw !== 'object') return undefined
  const body = typeof raw.body === 'string' ? raw.body : ''
  const id = typeof raw.id === 'string' && raw.id !== '' ? raw.id : newId()
  const stamp = typeof raw.updatedAt === 'string' ? raw.updatedAt : nowIso()
  const note = {
    id,
    body,
    title:
      typeof raw.title === 'string' && raw.title !== '' && !isMeaninglessTitle(raw.title)
        ? raw.title
        : deriveTitle(body, typeof raw.title === 'string' ? raw.title : ''),
    tags: mergeTags(raw.tags),
    pinned: raw.pinned === true,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : stamp,
    updatedAt: stamp,
  }
  if (kind === 'trash' && typeof raw.deletedAt === 'string') note.deletedAt = raw.deletedAt
  if (typeof raw.source === 'string' && NOTE_SOURCES.has(raw.source)) note.source = raw.source
  if (typeof raw.enhancedFrom === 'string' && raw.enhancedFrom !== '') note.enhancedFrom = raw.enhancedFrom
  return note
}

/** Parse links.json; an absent or damaged file simply means "no conversation yet". */
function parseLinks(text) {
  if (text === undefined || text.trim() === '') return {}
  try {
    const parsed = JSON.parse(text)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}
