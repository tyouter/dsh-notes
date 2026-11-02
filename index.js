/**
 * @tyouter/dsh-notes - a notebook inside DeepSeek Harness (host half).
 *
 * Everything durable is plain JSON files under one directory, so the notebook
 * outlives the process and stays readable with any editor. This half owns the
 * store, the model-facing `notes` / `notes_enhance` tools, the `/note` command,
 * and the small HTTP plane the browser panel uses; every caller goes through
 * the same `NoteStore` methods.
 */

import { registerNotesApi } from './lib/api.js'
import { registerNotesCommands } from './lib/commands.js'
import { NoteStore } from './lib/store.js'
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
  const store = new NoteStore({ ctx, config })

  // The panel and the agent tools share one store instance, so a note written
  // from either side is immediately visible to the other.
  ctx.effect(() => ctx.provide('notes', store), 'notes.service')

  const disposers = [
    registerNotesTools(ctx, store, logger),
    registerNotesCommands(ctx, store, logger),
    registerNotesApi(ctx, store, { config, logger }),
  ]

  ctx.effect(
    () => () => {
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
