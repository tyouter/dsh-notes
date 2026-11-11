/**
 * Earlier versions of a note, kept as plain files.
 *
 * One directory per note under `<notebook>/history/<noteId>/`, one Markdown file per version, named by
 * the UTC instant it was replaced (`20261111T101530-412.md`). The file holds the note body exactly as
 * it was: no header, no JSON, nothing to unwrap — opening it in any editor shows the text the author
 * lost. Metadata that changes independently (tags, pin) is not versioned, because restoring an old
 * tag list is not what "undo my edit" means.
 *
 * Writes happen on the host after the note store persists, from `NoteStore`'s `onWrite` hook, so the
 * kept version is always the one that was just replaced rather than the one being written.
 *
 * Retention is a count per note, not an age: `history.limit` in settings. Pruning happens on write, so
 * a notebook that stops being edited keeps its last N versions forever.
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const NOTE_ID = /^[A-Za-z0-9_-]{1,64}$/
const STAMP_FILE = /^(\d{8}T\d{6}-\d{3})\.md$/

/** `20261111T101530-412` — sortable as text, unambiguous across time zones. */
export function revisionStamp(date = new Date()) {
  const iso = (date instanceof Date ? date : new Date(date)).toISOString()
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}-${iso.slice(20, 23)}`
}

/** The instant a stamp was taken, for display; `null` when the name is not one of ours. */
export function stampDate(stamp) {
  const raw = String(stamp ?? '')
  if (!/^\d{8}T\d{6}-\d{3}$/.test(raw)) return null
  const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(9, 11)}:${raw.slice(11, 13)}:${raw.slice(13, 15)}.${raw.slice(16, 19)}Z`
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

/** The first line of a body, the way the notebook names a note. */
export function bodyTitle(body) {
  const line = String(body ?? '')
    .split('\n')
    .map((entry) => entry.trim())
    .find((entry) => entry !== '')
  if (line === undefined) return ''
  return line.replace(/^#+\s*/, '').slice(0, 80)
}

export class RevisionStore {
  /**
   * @param store       the NoteStore, for the notebook directory and for saving a restore
   * @param settingsOf  () => Promise<settings>, so `history.keep` / `history.limit` are read live
   */
  constructor(store, { settingsOf } = {}) {
    this.store = store
    this.settingsOf = typeof settingsOf === 'function' ? settingsOf : async () => ({ history: { keep: true, limit: 50 } })
  }

  root() {
    return join(this.store.resolveDirectory(), 'history')
  }

  directoryOf(noteId) {
    return join(this.root(), String(noteId))
  }

  async limits() {
    try {
      const settings = (await this.settingsOf()) ?? {}
      const history = settings.history ?? {}
      const limit = Number(history.limit)
      return {
        keep: history.keep !== false,
        limit: Number.isFinite(limit) ? Math.min(500, Math.max(1, Math.round(limit))) : 50,
      }
    } catch {
      return { keep: true, limit: 50 }
    }
  }

  /** Stamps present for one note, newest first. */
  async stamps(noteId) {
    if (!NOTE_ID.test(String(noteId ?? ''))) return []
    try {
      const names = await readdir(this.directoryOf(noteId))
      return names
        .map((name) => STAMP_FILE.exec(name)?.[1])
        .filter((stamp) => stamp !== undefined)
        .sort()
        .reverse()
    } catch {
      return []
    }
  }

  /**
   * Keep one more version of a note.
   *
   * `note` is the version being replaced. A body identical to the newest kept version is skipped:
   * saving a pin toggle or a tag change must not fill the history with duplicates.
   */
  async record({ note, at = new Date(), reason = 'save' } = {}) {
    const id = String(note?.id ?? '')
    const body = String(note?.body ?? '')
    if (!NOTE_ID.test(id) || body.trim() === '') return null
    const { keep, limit } = await this.limits()
    if (!keep) return null
    const directory = this.directoryOf(id)
    const existing = await this.stamps(id)
    if (existing.length > 0) {
      const newest = await this.readStamp(id, existing[0])
      if (newest === body) return null
    }
    await mkdir(directory, { recursive: true })
    const stamp = revisionStamp(at)
    await writeFile(join(directory, `${stamp}.md`), body, 'utf8')
    await this.prune(id, limit)
    return { stamp, id, reason, chars: body.length }
  }

  async readStamp(noteId, stamp) {
    if (!NOTE_ID.test(String(noteId ?? '')) || !/^\d{8}T\d{6}-\d{3}$/.test(String(stamp ?? ''))) return null
    try {
      return await readFile(join(this.directoryOf(noteId), `${stamp}.md`), 'utf8')
    } catch {
      return null
    }
  }

  /** Newest first, with just enough for a list: when, how long, and what it was called. */
  async list(noteId, { limit = 50 } = {}) {
    const stamps = await this.stamps(noteId)
    const page = stamps.slice(0, Math.max(1, Math.min(200, Number(limit) || 50)))
    const versions = []
    for (const stamp of page) {
      const body = await this.readStamp(noteId, stamp)
      if (body === null) continue
      versions.push({ stamp, at: stampDate(stamp)?.toISOString() ?? null, chars: body.length, title: bodyTitle(body) })
    }
    return versions
  }

  async read(noteId, stamp) {
    const body = await this.readStamp(noteId, stamp)
    if (body === null) {
      throw Object.assign(new Error('找不到这个版本'), { code: 'NOT_FOUND', status: 404 })
    }
    return { stamp, at: stampDate(stamp)?.toISOString() ?? null, body, title: bodyTitle(body) }
  }

  /**
   * Put an old body back.
   *
   * The version being replaced is recorded first, so a restore is itself undoable — including a
   * restore that was a mistake.
   */
  async restore(noteId, stamp) {
    const version = await this.read(noteId, stamp)
    const note = await this.store.get(noteId)
    if (note === null || note === undefined) {
      throw Object.assign(new Error('这条笔记不在了'), { code: 'NOT_FOUND', status: 404 })
    }
    await this.record({ note, reason: 'restore' })
    const saved = await this.store.save({ id: noteId, body: version.body, source: 'revision' })
    return { note: saved, restored: version.stamp }
  }

  /** Keep the newest `limit` versions of one note. */
  async prune(noteId, limit) {
    const stamps = await this.stamps(noteId)
    const drop = stamps.slice(Math.max(1, limit))
    for (const stamp of drop) {
      try {
        await rm(join(this.directoryOf(noteId), `${stamp}.md`), { force: true })
      } catch {
        /* a file already gone is the state we wanted */
      }
    }
    return drop.length
  }
}
