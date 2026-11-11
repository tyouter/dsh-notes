/**
 * Notebook settings.
 *
 * One small JSON file next to the notes (`settings.json`), so a setting survives upgrades and can be
 * read by eye. It holds the writing-partner switches (whether the listener is on, whether it picks its
 * own persona or the author picked one, and the guards around that choice), and the two switches the
 * backup page owns: where copies are written, and whether earlier versions of a note are kept.
 *
 * Defaults are deliberately the opinionated ones: the listener is on and chooses for itself; backups
 * are off because a destination has to be given before anything may be written anywhere; history is
 * on, because losing the previous draft is the one loss that cannot be reconstructed.
 *
 * The password is stored in this file in plain text. There is no keychain to borrow here, and the file
 * sits in the author's own notebook directory; the panel says so on the page instead of implying
 * otherwise.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export const DEFAULT_SETTINGS = Object.freeze({
  version: 1,
  enabled: true,
  mode: 'auto',
  personaId: '',
  autoCreate: true,
  maxGuests: 3,
  sync: Object.freeze({
    mode: 'off',
    folder: '',
    url: '',
    username: '',
    password: '',
    auto: true,
    mirror: true,
  }),
  history: Object.freeze({
    keep: true,
    limit: 50,
  }),
})

const MODES = new Set(['manual', 'auto'])

/** `folder` writes beside a directory on this machine (a mounted NAS share), `webdav` over the network. */
export const SYNC_MODES = new Set(['off', 'folder', 'webdav'])

export const HISTORY_LIMIT_MIN = 1
export const HISTORY_LIMIT_MAX = 500

function text(value, limit) {
  return String(value ?? '').trim().slice(0, limit)
}

/** Only http(s): a `file:` or `javascript:` destination is a mistake, never an intention. */
export function normalizeSyncUrl(value) {
  const raw = text(value, 500)
  if (raw === '') return ''
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    return parsed.toString().replace(/\/+$/, '')
  } catch {
    return ''
  }
}

export function normalizeSync(input, base = DEFAULT_SETTINGS.sync) {
  const source = input !== null && typeof input === 'object' ? input : {}
  const merged = { ...base, ...source }
  const mode = text(merged.mode, 12).toLowerCase()
  return {
    mode: SYNC_MODES.has(mode) ? mode : 'off',
    folder: text(merged.folder, 1000),
    url: normalizeSyncUrl(merged.url),
    username: text(merged.username, 120),
    password: String(merged.password ?? '').slice(0, 400),
    auto: merged.auto !== false,
    mirror: merged.mirror !== false,
  }
}

export function normalizeHistory(input, base = DEFAULT_SETTINGS.history) {
  const source = input !== null && typeof input === 'object' ? input : {}
  const merged = { ...base, ...source }
  const limit = Number(merged.limit)
  return {
    keep: merged.keep !== false,
    limit: Number.isFinite(limit)
      ? Math.min(HISTORY_LIMIT_MAX, Math.max(HISTORY_LIMIT_MIN, Math.round(limit)))
      : DEFAULT_SETTINGS.history.limit,
  }
}

/** Anything stored is re-read through this, so a hand-edited file cannot break the panel. */
export function normalizeSettings(input, base = DEFAULT_SETTINGS) {
  const source = input !== null && typeof input === 'object' ? input : {}
  const merged = { ...base, ...source }
  const mode = String(merged.mode ?? '').trim()
  const guests = Number(merged.maxGuests)
  return {
    version: 1,
    enabled: merged.enabled !== false,
    mode: MODES.has(mode) ? mode : DEFAULT_SETTINGS.mode,
    personaId: String(merged.personaId ?? '').trim().slice(0, 40),
    autoCreate: merged.autoCreate !== false,
    maxGuests: Number.isFinite(guests) ? Math.min(4, Math.max(1, Math.round(guests))) : DEFAULT_SETTINGS.maxGuests,
    sync: normalizeSync(merged.sync, normalizeSync(base.sync)),
    history: normalizeHistory(merged.history, normalizeHistory(base.history)),
  }
}

/**
 * What the panel may see of these settings. The password never travels back to the browser: the page
 * only needs to know whether one is stored, and a new one is only ever sent when the author types it.
 */
export function publicSettings(settings) {
  const sync = normalizeSync(settings?.sync)
  const { password, ...rest } = sync
  return { ...settings, sync: { ...rest, password: '', passwordSet: password !== '' } }
}

export class SettingsStore {
  constructor(store) {
    this.store = store
  }

  file() {
    return join(this.store.resolveDirectory(), 'settings.json')
  }

  async read() {
    try {
      const parsed = JSON.parse(await readFile(this.file(), 'utf8'))
      return normalizeSettings(parsed)
    } catch {
      return normalizeSettings(DEFAULT_SETTINGS)
    }
  }

  /** Merge one patch over what is on disk; the caller only sends the keys it changed. */
  async write(patch) {
    const current = await this.read()
    const given = patch !== null && typeof patch === 'object' ? patch : {}
    // One level of nesting is merged by hand so a panel that sends only `sync.folder` cannot wipe the
    // password, and a panel that sends an empty `sync.password` means "forget it".
    const next = normalizeSettings({
      ...current,
      ...given,
      sync: given.sync === undefined ? current.sync : { ...current.sync, ...(given.sync ?? {}) },
      history: given.history === undefined ? current.history : { ...current.history, ...(given.history ?? {}) },
    })
    const target = this.file()
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    return next
  }
}
