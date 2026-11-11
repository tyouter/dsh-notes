/**
 * @tyouter/dsh-notes - a notebook inside DeepSeek Harness (host half).
 *
 * Everything durable is plain JSON files under one directory, so the notebook
 * outlives the process and stays readable with any editor. This half owns the
 * store, the model-facing `notes` / `notes_enhance` tools, the `/note` command,
 * and the small HTTP plane the browser panel uses; every caller goes through
 * the same `NoteStore` methods.
 *
 * Two things hang off the store's write hook, and both are optional:
 *
 *   revisions  keeps the version a save is about to replace, as one Markdown
 *              file per version under `<notebook>/history/<id>/`
 *   sync       copies the notebook to a folder or a WebDAV address, debounced
 *              after each write, with a sha256 manifest so an unchanged note is
 *              not uploaded twice
 */

import { registerNotesApi } from './lib/api.js'
import { registerNotesCommands } from './lib/commands.js'
import { RevisionStore } from './lib/revisions.js'
import { SettingsStore } from './lib/settings.js'
import { SpeechBridge } from './lib/speech.js'
import { NoteStore } from './lib/store.js'
import { SyncEngine } from './lib/sync.js'
import { registerNotesTools } from './lib/tools.js'

export const inject = ['tools']

/**
 * Default row config; the row's `config` is merged over it (no `Config` export,
 * because a profile-installed bundle resolves only its own dependencies and
 * therefore imports no schema library).
 *
 *   notesPath    notebook directory, relative to the default workspace
 *   boardPreset    agent preset that answers questions on the dashboard. It is a
 *                  real session with tools (`notes_query`, `notes_analyze`,
 *                  `dashboard_chart`), so it reads the database instead of being
 *                  handed a truncated dump of the text in its prompt.
 *   enhanceSystem  optional instruction for the 「结构化」button, replacing the
 *                  built-in one. Structuring is a single streamed model call, not a
 *                  session, so this is how its behaviour is tuned — there is no
 *                  preset for it.
 *
 * The editor copilot likewise has no preset: it is a single streamed call.
 */
const DEFAULTS = {
  notesPath: 'notes-vault',
  boardPreset: 'notes-board',
}

export function apply(ctx, rawConfig) {
  const config = { ...DEFAULTS, ...(rawConfig ?? {}) }
  const logger = ctx.logger

  // One settings reader for the whole instance: the backup engine and the panel
  // all see the same `settings.json`, and a change made in the panel is visible to
  // the very next save.
  const store = new NoteStore({ ctx, config })
  const settings = new SettingsStore(store)
  const revisions = new RevisionStore(store, { settingsOf: () => settings.read() })
  const sync = new SyncEngine({ store, settingsOf: () => settings.read() }, { logger })

  // Every write path — save, create, pin/tag update, trash, restore — ends here, so
  // history and backup cannot drift from the notebook.
  store.hooks = {
    onWrite: async ({ type, note, previous }) => {
      if (type === 'save' && previous !== undefined) await revisions.record({ note: previous, reason: 'save' })
      if (type === 'remove' && note !== undefined) await revisions.record({ note, reason: 'remove' })
      sync.schedule()
    },
    onError: (error) => logger?.warn?.(`[notes] write hook failed: ${error?.message ?? error}`),
  }

  // The panel and the agent tools share one store instance, so a note written
  // from either side is immediately visible to the other.
  ctx.effect(() => ctx.provide('notes', store), 'notes.service')

  // Speech is optional: this bridge is here whether or not the voice bundle is enabled, and reports
  // `available: false` when it is not.
  const speech = new SpeechBridge(ctx)

  const disposers = [
    registerNotesTools(ctx, store, logger),
    registerNotesCommands(ctx, store, logger),
    registerNotesApi(ctx, store, { config, logger, speech, settings, revisions, sync }),
  ]

  ctx.effect(
    () => () => {
      sync.cancel()
      for (const dispose of disposers.splice(0)) {
        try {
          if (typeof dispose === 'function') dispose()
        } catch {
          /* one failing disposer must not keep the others registered */
        }
      }
    },
    'notes.teardown',
  )

  logger?.info?.(`[notes] ready; notebook "${config.notesPath}" (created on first use)`)
  return store
}

export { NoteStore }
