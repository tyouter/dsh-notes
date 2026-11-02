/**
 * The notebook's event log: what happened, when.
 *
 * Notes carry their own timestamps, but "the user asked the AI to polish this
 * paragraph" leaves no trace in a note until it is saved. The dashboard needs
 * that trace, so every AI call and every applied edit appends one line here.
 *
 * Append-only JSONL, trimmed on read: a log that can be lost costs statistics,
 * never notes.
 */

import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const MAX_EVENTS = 4000
/** Kinds the dashboard groups by. Kept closed so a typo surfaces as "unknown". */
export const EVENT_KINDS = new Set([
  'note.created',
  'note.updated',
  'enhance',
  'copilot.complete',
  'copilot.polish',
  'copilot.translate',
  'copilot.explain',
  'copilot.ask',
  'copilot.insert',
  'copilot.replace',
  'chart.saved',
  'chart.removed',
  // Client beacons: what the user did in the panel.
  'board.turn',
  'ui.tab',
  'ui.open',
  'ui.search',
  'copilot.insert',
])

export class EventLog {
  constructor(store) {
    this.store = store
    this.file = () => join(store.resolveDirectory(), 'events.jsonl')
  }

  /** Append one event. Never throws: a statistics line must not fail a save. */
  async record(kind, detail = {}) {
    if (!EVENT_KINDS.has(kind)) return
    const line = JSON.stringify({ at: new Date().toISOString(), kind, ...detail })
    try {
      await mkdir(dirname(this.file()), { recursive: true })
      await appendFile(this.file(), `${line}\n`, 'utf8')
    } catch {
      /* best-effort */
    }
  }

  /** Every event, oldest first, capped to the most recent MAX_EVENTS. */
  async read() {
    let text
    try {
      text = await readFile(this.file(), 'utf8')
    } catch {
      return []
    }
    const lines = text.split('\n').filter((line) => line.trim() !== '')
    const events = []
    for (const line of lines.slice(-MAX_EVENTS)) {
      try {
        const event = JSON.parse(line)
        if (event !== null && typeof event === 'object' && typeof event.kind === 'string') events.push(event)
      } catch {
        /* a torn line is skipped, not fatal */
      }
    }
    return events
  }

  /** Drop everything older than the cap, keeping the file from growing forever. */
  async compact() {
    const events = await this.read()
    if (events.length < MAX_EVENTS) return { compacted: false, events: events.length }
    const body = `${events.map((event) => JSON.stringify(event)).join('\n')}\n`
    const target = this.file()
    const temporary = `${target}.${process.pid}.tmp`
    await writeFile(temporary, body, 'utf8')
    await rename(temporary, target).catch(async () => {
      await writeFile(target, body, 'utf8')
    })
    return { compacted: true, events: events.length }
  }
}

/** Charts the user pinned on the dashboard. */
export class ChartStore {
  constructor(store) {
    this.store = store
    this.file = () => join(store.resolveDirectory(), 'dashboard.json')
  }

  async read() {
    try {
      const parsed = JSON.parse(await readFile(this.file(), 'utf8'))
      const charts = Array.isArray(parsed?.charts) ? parsed.charts : []
      return charts.filter((chart) => chart !== null && typeof chart === 'object' && typeof chart.id === 'string')
    } catch {
      return []
    }
  }

  async write(charts) {
    const target = this.file()
    await mkdir(dirname(target), { recursive: true })
    const body = `${JSON.stringify({ version: 1, charts }, null, 2)}\n`
    const temporary = `${target}.${process.pid}.tmp`
    await writeFile(temporary, body, 'utf8')
    await rename(temporary, target).catch(async () => {
      await writeFile(target, body, 'utf8')
    })
  }

  /** Add or replace one chart by id. */
  async save(chart) {
    const charts = await this.read()
    const index = charts.findIndex((entry) => entry.id === chart.id)
    if (index === -1) charts.push(chart)
    else charts[index] = chart
    await this.write(charts)
    return charts
  }

  async remove(id) {
    const charts = (await this.read()).filter((chart) => chart.id !== id)
    await this.write(charts)
    return charts
  }
}
