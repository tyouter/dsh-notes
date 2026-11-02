/**
 * Descriptive statistics for the notebook dashboard.
 *
 * Pure functions over notes and events: no I/O, so the numbers can be tested and
 * the same input always yields the same output. Everything is computed from the
 * stored timestamps — the notebook has no separate analytics database.
 */

import { topTerms } from './text.js'

const DAY_MS = 86_400_000

/** Local midnight of a date, as a stable "YYYY-MM-DD" key. */
function dayKey(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Every day key from `days` days ago through today, oldest first. */
function dayRange(days, now) {
  const keys = []
  const today = new Date(now)
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    keys.push(dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset)))
  }
  return keys
}

/** Count entries into buckets, sorted by count descending. */
function tally(values) {
  const counts = new Map()
  for (const value of values) {
    const key = String(value ?? '').trim()
    if (key === '') continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value)
}

/** Length histogram in character buckets. */
function lengthBuckets(notes) {
  const edges = [0, 80, 200, 500, 1200]
  const labels = ['<80', '80-200', '200-500', '500-1200', '>1200']
  const counts = new Array(labels.length).fill(0)
  for (const note of notes) {
    const length = String(note.body ?? '').length
    let index = edges.length - 1
    for (let i = 1; i < edges.length; i += 1) {
      if (length < edges[i]) {
        index = i - 1
        break
      }
    }
    counts[index] += 1
  }
  return labels.map((label, index) => ({ label, value: counts[index] }))
}

/** Hour-of-day histogram of note creation, 0..23. */
function hourBuckets(notes) {
  const counts = new Array(24).fill(0)
  for (const note of notes) {
    const date = new Date(note.createdAt ?? note.updatedAt ?? 0)
    if (Number.isNaN(date.getTime())) continue
    counts[date.getHours()] += 1
  }
  return counts.map((value, hour) => ({ label: `${String(hour).padStart(2, '0')}`, value }))
}

/** Longest run of consecutive days ending today with at least one note. */
function streakOf(days) {
  const active = new Set(days.filter((entry) => entry.value > 0).map((entry) => entry.label))
  let streak = 0
  const cursor = new Date()
  for (;;) {
    const key = dayKey(cursor)
    if (!active.has(key)) break
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

/**
 * The dashboard's numbers.
 *
 * `notes` are live notes; `trashed` are the deleted ones; `events` are the AI and
 * edit records. `days` controls the activity window.
 */
/**
 * One year of daily counts, oldest first, aligned to Sunday so the renderer can
 * chunk it into week columns without knowing about dates.
 *
 * Cells past today are simply absent: the last column is short, which is what a
 * contribution graph looks like mid-week.
 */
function calendarYear(notes, now, weeks = 53) {
  const counts = new Map()
  for (const note of notes) {
    const key = dayKey(note.createdAt ?? note.updatedAt)
    if (key === undefined) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const start = new Date(today)
  start.setDate(start.getDate() - (weeks * 7 - 1))
  // Rewind to the most recent Sunday: a contribution graph starts on a week edge.
  start.setDate(start.getDate() - start.getDay())

  const cells = []
  for (const cursor = new Date(start); cursor <= today; cursor.setDate(cursor.getDate() + 1)) {
    const key = dayKey(cursor)
    cells.push({ label: key, value: counts.get(key) ?? 0 })
  }
  return cells
}

export function computeStats({ notes = [], trashed = [], events = [], days = 30, now = Date.now() } = {}) {
  const range = dayRange(days, now)
  const createdByDay = new Map(range.map((key) => [key, 0]))
  const touchedByDay = new Map(range.map((key) => [key, 0]))
  let totalChars = 0

  for (const note of notes) {
    totalChars += String(note.body ?? '').length
    const created = dayKey(note.createdAt ?? note.updatedAt)
    if (created !== undefined && createdByDay.has(created)) createdByDay.set(created, createdByDay.get(created) + 1)
    const updated = dayKey(note.updatedAt)
    if (updated !== undefined && touchedByDay.has(updated)) touchedByDay.set(updated, touchedByDay.get(updated) + 1)
  }

  // Events: AI calls are the "AI 使用" panel; edits show the writing rhythm.
  const aiKinds = new Set([...EVENT_KINDS_AI])
  const eventsByDay = new Map(range.map((key) => [key, 0]))
  const aiByKind = new Map()
  let aiCalls = 0
  let aiLatencyTotal = 0
  let aiLatencyCount = 0
  let aiFirstTokenTotal = 0
  let aiFirstTokenCount = 0
  for (const event of events) {
    const key = dayKey(event.at)
    if (key !== undefined && eventsByDay.has(key)) eventsByDay.set(key, eventsByDay.get(key) + 1)
    if (!aiKinds.has(event.kind)) continue
    aiCalls += 1
    aiByKind.set(event.kind, (aiByKind.get(event.kind) ?? 0) + 1)
    if (Number.isFinite(Number(event.elapsedMs))) {
      aiLatencyTotal += Number(event.elapsedMs)
      aiLatencyCount += 1
    }
    if (Number.isFinite(Number(event.firstTokenMs))) {
      aiFirstTokenTotal += Number(event.firstTokenMs)
      aiFirstTokenCount += 1
    }
  }

  // ---- token accounting ----
  // Every model call records the same fields, so this is one pass over the events.
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, calls: 0 }
  const tokensByDay = new Map(range.map((key) => [key, 0]))
  const tokensByKind = new Map()
  let contextCharsTotal = 0
  let contextSamples = 0
  for (const event of events) {
    const input = Number(event.inputTokens) || 0
    const output = Number(event.outputTokens) || 0
    if (input === 0 && output === 0) continue
    tokens.calls += 1
    tokens.input += input
    tokens.output += output
    tokens.cacheRead += Number(event.cacheReadTokens) || 0
    tokens.cacheWrite += Number(event.cacheWriteTokens) || 0
    tokens.reasoning += Number(event.reasoningTokens) || 0
    const day = dayKey(event.at)
    if (day !== undefined && tokensByDay.has(day)) tokensByDay.set(day, tokensByDay.get(day) + input + output)
    const kind = String(event.kind ?? 'other')
    tokensByKind.set(kind, (tokensByKind.get(kind) ?? 0) + input + output)
    const chars = Number(event.contextChars) || 0
    if (chars > 0) {
      contextCharsTotal += chars
      contextSamples += 1
    }
  }

  const activity30 = range.map((key) => ({ label: key.slice(5), value: createdByDay.get(key) ?? 0 }))
  const edited30 = range.map((key) => ({ label: key.slice(5), value: touchedByDay.get(key) ?? 0 }))
  const events30 = range.map((key) => ({ label: key.slice(5), value: eventsByDay.get(key) ?? 0 }))

  const tags = tally(notes.flatMap((note) => (Array.isArray(note.tags) ? note.tags : [])))
  const sources = tally(notes.map((note) => note.source ?? 'panel'))

  return {
    days,
    generatedAt: new Date(now).toISOString(),
    totals: {
      notes: notes.length,
      trashed: trashed.length,
      tags: tags.length,
      chars: totalChars,
      averageChars: notes.length === 0 ? 0 : Math.round(totalChars / notes.length),
      pinned: notes.filter((note) => note.pinned === true).length,
      daysActive: activity30.filter((entry) => entry.value > 0).length,
      streak: streakOf(activity30),
    },
    tokens: {
      total: tokens.input + tokens.output,
      input: tokens.input,
      output: tokens.output,
      cacheRead: tokens.cacheRead,
      cacheWrite: tokens.cacheWrite,
      reasoning: tokens.reasoning,
      calls: tokens.calls,
      // Average prompt size: the context the plugin was actually billed for.
      averageContextChars: contextSamples === 0 ? 0 : Math.round(contextCharsTotal / contextSamples),
      byKind: [...tokensByKind.entries()]
        .map(([label, value]) => ({ label, value }))
        .sort((left, right) => right.value - left.value),
    },
    ai: {
      calls: aiCalls,
      byKind: [...aiByKind.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
      averageElapsedMs: aiLatencyCount === 0 ? null : Math.round(aiLatencyTotal / aiLatencyCount),
      averageFirstTokenMs: aiFirstTokenCount === 0 ? null : Math.round(aiFirstTokenTotal / aiFirstTokenCount),
    },
    charts: {
      created: activity30,
      // The contribution matrix: a year of days, for the dot-matrix view.
      calendar: calendarYear(notes, now),
      tokens: range.map((key) => ({ label: key.slice(5), value: tokensByDay.get(key) ?? 0 })),
      edited: edited30,
      events: events30,
      tags: tags.slice(0, 12),
      sources,
      lengths: lengthBuckets(notes),
      hours: hourBuckets(notes),
      // The words the notebook keeps coming back to; the dashboard draws them and
      // the terms tool answers the same question over SQL.
      terms: topTerms(
        notes.map((note) => note.body),
        { limit: 12 },
      ),
    },
  }
}

/** Event kinds that count as "AI usage". */
export const EVENT_KINDS_AI = new Set([
  'enhance',
  'translate',
  'complete',
])
