/**
 * Notebook settings.
 *
 * One small JSON file next to the notes (`settings.json`), so a setting survives upgrades and can be
 * read by eye. It holds only the writing-partner switches: whether the listener is on, whether it picks
 * its own persona or the author picked one, and the guards around that choice.
 *
 * Defaults are deliberately the opinionated ones: the listener is on, and it chooses for itself. An
 * empty `personaId` in `auto` mode simply means "nobody picked yet, ask the chooser".
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
})

const MODES = new Set(['manual', 'auto'])

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
  }
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
      return { ...DEFAULT_SETTINGS }
    }
  }

  /** Merge one patch over what is on disk; the caller only sends the keys it changed. */
  async write(patch) {
    const next = normalizeSettings({ ...(await this.read()), ...(patch !== null && typeof patch === 'object' ? patch : {}) })
    const target = this.file()
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    return next
  }
}
