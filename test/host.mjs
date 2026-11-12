// Host-side smoke test: the store, the prompts, and the tool adapters.
// Run with: node test/host.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { NoteStore, mergeTags, deriveTitle, isMeaninglessTitle } from '../lib/store.js'
import { buildEnhanceMessage, parseStructured, readEnhanceResult } from '../lib/prompt.js'
import { computeStats } from '../lib/analytics.js'
import { ChartStore, EventLog } from '../lib/events.js'
import { NotesDatabase } from '../lib/db.js'
import { registerNotesTools } from '../lib/tools.js'
import { streamText } from '../lib/llm.js'
import { analyzeNotes } from '../lib/tools.js'
import { SpeechBridge, decodeBase64, readWavHeader, SPEECH_SAMPLE_RATE } from '../lib/speech.js'
import {
  BUILTIN_PERSONAS,
  PersonaStore,
  buildCreatePrompt,
  buildInterjectPrompt,
  buildSelectPrompt,
  choosePersonas,
  createPersona,
  interject,
  normalizePersona,
  parsePersonaCard,
  personaFromCard,
} from '../lib/personas.js'
import { DEFAULT_SETTINGS, SettingsStore, normalizeSettings } from '../lib/settings.js'
import { buildConvenePrompt, convene, normalizePlan, parseConvene } from '../lib/convene.js'

const here = dirname(fileURLToPath(import.meta.url))
const vault = join(here, '.host-vault')

let failures = 0
const check = (label, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${condition ? '' : `  ${detail}`}`)
  if (!condition) failures += 1
}

const store = new NoteStore({ ctx: { get: () => undefined }, config: { notesPath: vault } })

try {
  // ---- store ----
  const a = await store.save({ body: '  会议记录\n决定：先做接口', tags: ['工作'] })
  check('save derives a title from the first line', a.note.title === '会议记录', a.note.title)
  const b = await store.save({ body: '接口的 TODO\n1. 联调\n2. 文档', tags: ['工作', 'todo'], source: 'agent' })
  await store.save({ body: '另一条', tags: ['个人'] })

  const found = await store.list({ query: '接口' })
  check('search finds both notes mentioning 接口', found.total === 2, String(found.total))
  check('tags are aggregated', (await store.tags()).length === 3)
  check('snapshot carries notes, total, tags, location', (await store.snapshot()).notes.length === 3)

  const pinned = await store.update({ id: b.note.id, pinned: true })
  check('pin survives update', pinned.note.pinned === true)
  const replaced = await store.update({ id: b.note.id, tags: ['todo'], replace: true })
  check('retag with replace drops old tags', JSON.stringify(replaced.note.tags) === '["todo"]', JSON.stringify(replaced.note.tags))

  await store.remove(a.note.id)
  check('removed note leaves the live list', (await store.list({})).total === 2)
  // includeTrash lists the trash, not the union, so the note is found there.
  check('removed note is recoverable from the trash', (await store.list({ includeTrash: true })).total === 1)
  await store.restore(a.note.id)
  check('restore puts it back', (await store.list({})).total === 3)

  // ---- links: the AI conversation index ----
  await store.bindLink('notebook', 's-test')
  check('link round-trips', (await store.linkOf('notebook'))?.sessionId === 's-test')
  await store.clearLink('notebook')
  check('cleared link is gone', (await store.linkOf('notebook')) === undefined)

  // ---- prompts ----
  check('tags merge case-insensitively', JSON.stringify(mergeTags(['Work', 'work'])) === '["Work"]')
  check('title ignores markdown headings', deriveTitle('## 标题行') === '标题行')

  const message = buildEnhanceMessage({ text: ' 原始内容 ', instruction: '分成两部分' })
  check('enhance message carries the raw text', message.includes('原始内容'))
  check('enhance message carries the user instruction', message.includes('分成两部分'))

  check(
    'parseStructured finds a fenced json block',
    parseStructured('好的：\n```json\n{"body":"x"}\n```\n以上')?.body === 'x',
  )
  check('parseStructured returns null for prose', parseStructured('普通回答，没有结构') === null)

  const enhance = readEnhanceResult('```json\n{"title":"T","body":"B","tags":["x"],"notes":["n"]}\n```')
  check('enhance result reads title/body/tags', enhance?.title === 'T' && enhance?.body === 'B' && JSON.stringify(enhance.tags) === '["x"]')
  check('enhance result rejects an empty body', readEnhanceResult('```json\n{"title":"T"}\n```') === null)

  // ---- statistics over a real notebook ----
  const snapshot = await store.snapshot()
  const stats = computeStats({ notes: snapshot.notes, trashed: [], events: [], days: 30 })
  check('stats count the notes', stats.totals.notes === snapshot.notes.length, String(stats.totals.notes))
  check('stats count the tags', stats.totals.tags > 0)
  check('stats keep a 30-day window', stats.charts.created.length === 30, String(stats.charts.created.length))
  const calendar = stats.charts.calendar
  check('stats build a contribution calendar', Array.isArray(calendar) && calendar.length > 360, String(calendar?.length))
  check('calendar starts on a Sunday', new Date(calendar[0].label).getDay() === 0, String(new Date(calendar[0].label).getDay()))
  check('calendar ends today', calendar[calendar.length - 1].label === new Date().toLocaleDateString('en-CA'), calendar[calendar.length - 1].label)
  check('calendar counts are numbers', calendar.every((cell) => typeof cell.value === 'number'))
  check('stats bucket the lengths', stats.charts.lengths.length === 5)
  check('stats extract the top terms', Array.isArray(stats.charts.terms) && stats.charts.terms.length > 0, JSON.stringify(stats.charts.terms))
  check('stats rank terms by frequency', stats.charts.terms.every((term, index, all) => index === 0 || all[index - 1].value >= term.value))
  check('stats sum the characters', stats.totals.chars > 0)

  // ---- the event log: append, read back, ignore unknown kinds ----
  const log = new EventLog(store)
  await log.record('enhance', { chars: 12, elapsedMs: 900, firstTokenMs: 400, ok: true })
  await log.record('not-a-kind', { chars: 1 })
  const events = await log.read()
  check('event log records a known kind', events.some((event) => event.kind === 'enhance'))
  check('event log drops an unknown kind', !events.some((event) => event.kind === 'not-a-kind'))
  const withAi = computeStats({ notes: snapshot.notes, trashed: [], events, days: 30 })
  check('stats count AI calls', withAi.ai.calls === 1, String(withAi.ai.calls))
  check('stats average the AI latency', withAi.ai.averageElapsedMs === 900, String(withAi.ai.averageElapsedMs))

  // Token columns survive the log and the projection.
  await log.record('translate', { inputTokens: 900, outputTokens: 120, cacheReadTokens: 600, contextChars: 3500 })
  const tokenEvents = (await log.read()).filter((event) => event.kind === 'translate')
  check('the event keeps token fields', tokenEvents.at(-1)?.inputTokens === 900, JSON.stringify(tokenEvents.at(-1)))
  const projection = new NotesDatabase(store)
  await projection.ready(await log.read())
  const rows = await projection.select('select sum(input_tokens) as input, sum(cache_read_tokens) as cache from events')
  check('SQL can aggregate tokens', Number(rows[0]?.input) >= 900, JSON.stringify(rows))
  check('SQL can aggregate cache reads', Number(rows[0]?.cache) >= 600, JSON.stringify(rows))
  projection.close()

  // ---- the chart store: save, replace by id, remove ----
  const charts = new ChartStore(store)
  await charts.save({ id: 'c1', title: '一', type: 'bar', data: [{ label: 'a', value: 1 }] })
  await charts.save({ id: 'c2', title: '二', type: 'line', data: [{ label: 'b', value: 2 }] })
  await charts.save({ id: 'c1', title: '一改', type: 'bar', data: [{ label: 'a', value: 5 }] })
  const saved = await charts.read()
  check('charts save by id without duplicating', saved.length === 2, String(saved.length))
  check('charts replace on the same id', saved.find((chart) => chart.id === 'c1')?.title === '一改')
  const remaining = await charts.remove('c2')
  check('charts remove', remaining.length === 1 && remaining[0].id === 'c1')

  // ---- tool adapters, registered against a mock registry ----
  const registered = []
  const tools = { register: (definition) => (registered.push(definition), () => {}) }
  const dispose = registerNotesTools({ get: (name) => (name === 'tools' ? tools : undefined) }, store, console)
  check(
    'registers the query tools, notes and notes_enhance',
    ['notes_query', 'notes_analyze', 'dashboard_chart', 'notes', 'notes_enhance'].every((name) =>
      registered.some((entry) => entry.name === name),
    ),
    registered.map((entry) => entry.name).join(','),
  )
  const byName = (name) => registered.find((entry) => entry.name === name)
  const notesTool = byName('notes')
  // The dashboard conversation writes: a question can become a page without leaving the chat.
  await store.bindLink('board', 'session-board-1', { at: new Date().toISOString() })
  const fromBoard = await notesTool.execute({ action: 'add', body: '看板写下的\n一行' }, { agent: { id: 'session-board-1' } })
  check('the board session can create a note', fromBoard.status === 'created' && fromBoard.note.source === 'agent', JSON.stringify(fromBoard).slice(0, 80))
  const revised = await notesTool.execute(
    { action: 'update', id: fromBoard.note.id, tags: ['看板'] },
    { agent: { id: 'session-board-1' } },
  )
  check('the board session can edit a note', Array.isArray(revised.note?.tags) && revised.note.tags.includes('看板'), JSON.stringify(revised).slice(0, 80))
  const blocked = await notesTool
    .execute({ action: 'delete', id: fromBoard.note.id }, { agent: { id: 'session-board-1' } })
    .then(
      () => undefined,
      (error) => error,
    )
  check('the board session cannot delete', blocked?.code === 'BOARD_NO_DELETE', String(blocked?.code))
  check('the note it wrote survived the refused delete', (await store.get(fromBoard.note.id)) !== undefined)
  const readable = await notesTool.execute({ action: 'list' }, { agent: { id: 'session-board-1' } })
  check('the board session can still read', typeof readable.total === 'number')
  const allowed = await notesTool.execute({ action: 'add', body: 'from another session' }, { agent: { id: 'session-other' } })
  check('another session still writes', allowed.status === 'created', JSON.stringify(allowed).slice(0, 60))
  const created = await notesTool.execute({ action: 'add', body: '来自工具\n内容' })
  check('tool add creates a note', created.status === 'created' && created.note.source === 'agent')
  const searched = await notesTool.execute({ action: 'search', query: '来自工具' })
  check('tool search finds it', searched.total === 1)
  const enhanced = await byName('notes_enhance').execute({ text: '原始' })
  check('notes_enhance explains the output shape', enhanced.ok === false && typeof enhanced.prompt === 'string')
  dispose()
} finally {
  await rm(vault, { recursive: true, force: true })
}

// ---- note titles ----
// The title must skip Markdown furniture and prefer the first sentence: a note that
// opens with "---" used to be titled "---".
const titleCases = [
  ['---\n\n## deepseek harness\n\n- test format', 'deepseek harness'],
  ['# 目标\n\n做一个插件', '目标'],
  ['### 待办\n\n- 对齐接口', '待办'],
  ['> 引用的一句话', '引用的一句话'],
  ['1. 第一条\n2. 第二条', '第一条'],
  ['这是 **重点** 内容', '这是 重点 内容'],
  ['看 `code` 的实现', '看 code 的实现'],
  ['[链接](https://example.com) 说明', '链接 说明'],
  ['```js\nconst a = 1\n```\n\n真正的标题', '真正的标题'],
  ['***\n\n- - -\n\n最后一行', '最后一行'],
  ['明天下午三点跟 A 组对齐接口，把文档补齐。还有第二句。', '明天下午三点跟 A 组对齐接口，把文档补齐'],
  ['   ', ''],
]
for (const [input, expected] of titleCases) {
  check('title: ' + JSON.stringify(input).slice(0, 28), deriveTitle(input) === expected, JSON.stringify(deriveTitle(input)))
}
check('a furniture-only title is meaningless', isMeaninglessTitle('---') === true)
check('a real title is kept', isMeaninglessTitle('deepseek harness') === false)

// ---- retrying a transient provider failure ----
// A 5xx before the first token used to surface as an error wall; one retry covers the
// common case without duplicating text.
const retryScript = async (failuresBeforeSuccess) => {
  let calls = 0
  const ctx = {
    get: (name) =>
      name === 'llm'
        ? {
            resolveModelInfo: async () => ({ reasoning: { efforts: [{ id: 'off' }] } }),
            stream: async function* () {
              calls += 1
              if (calls <= failuresBeforeSuccess) {
                yield { type: 'finish', reason: { kind: 'error', failure: { message: 'boom', status: 500 } } }
                return
              }
              yield { type: 'text-delta', text: 'ok' }
              yield { type: 'finish', reason: { kind: 'completed' } }
            },
          }
        : name === 'agentDefaultModel'
          ? { currentSelection: () => ({ provider: 'p', model: 'm' }) }
          : undefined,
  }
  const result = await streamText({ ctx, user: 'hi', system: 's' })
  return { calls, result }
}

const retried = await retryScript(1)
check('a transient failure is retried', retried.calls === 2 && retried.result.ok === true, JSON.stringify(retried))
const exhausted = await retryScript(9)
check('retries stop', exhausted.calls === 3, String(exhausted.calls))

// ---- token analysis: real accounting, never char estimates ----
const tokenVault = join(here, '.host-token-vault')
await rm(tokenVault, { recursive: true, force: true })
await mkdir(tokenVault, { recursive: true })
const tokenStore = new NoteStore({ ctx: { get: () => undefined }, config: { notesPath: tokenVault } })
await tokenStore.load()
const tokenLog = new EventLog(tokenStore)
await tokenLog.record('enhance', { inputTokens: 1000, outputTokens: 200, at: '2026-10-28T10:00:00.000Z' })
await tokenLog.record('translate', { inputTokens: 300, outputTokens: 100, at: '2026-10-29T10:00:00.000Z' })
await tokenLog.record('enhance', { chars: 900, at: '2026-10-30T10:00:00.000Z' })
const tokenDb = new NotesDatabase(tokenStore)
await tokenDb.ready(await tokenLog.read())
const byDay = await analyzeNotes(
  { store: tokenStore, database: tokenDb, chartStore: new ChartStore(tokenStore), logger: console },
  { kind: 'tokens', days: 30 },
)
check('token analysis totals the real columns', byDay.rows.reduce((sum, row) => sum + row.value, 0) === 1600, JSON.stringify(byDay.rows))
check('an event without token columns adds nothing', byDay.rows.every((row) => row.value > 0), JSON.stringify(byDay.rows))
const byKind = await analyzeNotes(
  { store: tokenStore, database: tokenDb, chartStore: new ChartStore(tokenStore), logger: console },
  { kind: 'token_kinds' },
)
check('token kinds rank the spend', byKind.rows[0]?.label === 'enhance', JSON.stringify(byKind.rows))

// ---- grounding: every result says where it came from ----
check('analysis results carry provenance', typeof byDay.provenance?.source === 'string' && byDay.provenance.rows === byDay.rows.length, JSON.stringify(byDay.provenance))
check('token analysis warns about pre-accounting calls', typeof byDay.caveat === 'string' && byDay.caveat.length > 0)

// A failing query must come back as data, with a message the assistant can repeat.
const queryTools = []
const disposeQueryTools = registerNotesTools(
  { get: (name) => (name === 'tools' ? { register: (definition) => (queryTools.push(definition), () => {}) } : undefined) },
  tokenStore,
  console,
)
const queryTool = queryTools.find((entry) => entry.name === 'notes_query')
if (queryTool !== undefined) {
  const failed = await queryTool.execute({ sql: 'select * from nope' })
  check('a failing query returns an error field', typeof failed?.error === 'string', JSON.stringify(failed))
  check('a failing query returns no rows', Array.isArray(failed?.rows) && failed.rows.length === 0)
  const ok = await queryTool.execute({ sql: 'select count(*) as n from notes' })
  check('a good query reports provenance', ok?.provenance?.rows === 1, JSON.stringify(ok?.provenance))
}
if (typeof disposeQueryTools === 'function') disposeQueryTools()
tokenDb.close()
await rm(tokenVault, { recursive: true, force: true })

// ---- outside edits ----
// The notebook is plain JSON on disk, so another window or an editor can rewrite it. The store used
// to cache its first read forever, which is why the panel could look stale until something forced a
// second load.
{
  const root = await mkdtemp(join(tmpdir(), 'dsh-notes-host-fresh-'))
  const store = new NoteStore({ config: { notesPath: root } })
  await store.save({ body: '第一版', source: 'panel' })
  const before = await store.list()
  const file = join(root, 'notes.json')
  const parsed = JSON.parse(readFileSync(file, 'utf8'))
  parsed.notes.push({
    id: 'n-external',
    title: '外部写入',
    body: '别人写的',
    tags: [],
    source: 'panel',
    pinned: false,
    ai: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
  // let the mtime move past the write we just made
  await new Promise((resolve) => setTimeout(resolve, 20))
  writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
  const after = await store.list()
  check('a file changed on disk is picked up', after.notes.length === before.notes.length + 1, JSON.stringify({ before: before.notes.length, after: after.notes.length }))
  check('the external note is readable', after.notes.some((note) => String(note.body).includes('别人写的')))
  await rm(root, { recursive: true, force: true })
}

// ---- chart colours ----
// Charts are written by the model, so a colour reaches an inline style: the shape is checked, and an
// unusable value is dropped instead of passed through.
{
  const root = await mkdtemp(join(tmpdir(), 'dsh-notes-chart-colour-'))
  const store = new NoteStore({ config: { notesPath: root } })
  const tools = []
  const dispose = registerNotesTools(
    { get: (name) => (name === 'tools' ? { register: (definition) => (tools.push(definition), () => {}) } : undefined) },
    store,
    console,
  )
  const chartTool = tools.find((entry) => entry.name === 'dashboard_chart')
  const saved = await chartTool.execute({
    title: 'colours',
    type: 'bar',
    data: [
      { label: '绿色', value: 1, color: '#2ea043' },
      { label: '默认', value: 2 },
      { label: '注入', value: 3, color: 'url(https://example.com/x)' },
    ],
  })
  const points = saved?.saved?.data ?? []
  check('a chart keeps a point colour', points[0]?.color === '#2ea043', JSON.stringify(points[0]))
  check('a point without a colour stays clean', points[1]?.color === undefined, JSON.stringify(points[1]))
  check('an unsafe colour is dropped', points[2]?.color === undefined, JSON.stringify(points[2]))
  if (typeof dispose === 'function') dispose()
  await rm(root, { recursive: true, force: true })
}

// ---- speech ----
// The notebook owns no recognizer: it reports what `speechToText` offers, and refuses audio that is not the
// shape the Host accepts.
{
  const wav = (seconds = 0.1, rate = SPEECH_SAMPLE_RATE) => {
    const samples = Math.round(seconds * rate)
    const bytes = new Uint8Array(44 + samples * 2)
    const view = new DataView(bytes.buffer)
    const text = (at, value) => {
      for (let i = 0; i < value.length; i += 1) bytes[at + i] = value.charCodeAt(i)
    }
    text(0, 'RIFF')
    view.setUint32(4, bytes.length - 8, true)
    text(8, 'WAVE')
    text(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, rate, true)
    view.setUint32(28, rate * 2, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    text(36, 'data')
    view.setUint32(40, samples * 2, true)
    return bytes
  }

  const header = readWavHeader(wav())
  check('a 16 kHz mono wav is accepted', header.ok === true && Math.abs(header.seconds - 0.1) < 0.01, JSON.stringify(header))
  check('a stereo wav is refused', readWavHeader(wav(0.1, 44100)).ok === false)

  const silent = new SpeechBridge({ get: () => undefined })
  check('no speech service means no microphone', silent.state().available === false && silent.state().reason === 'no-service', JSON.stringify(silent.state()))

  const calls = []
  const fake = {
    snapshot: () => ({ providers: [{ id: 'sensevoice-local', name: 'SenseVoice', languages: ['zh', 'en'], preparation: { phase: 'ready' } }], selection: { providerId: 'sensevoice-local', language: 'zh' } }),
    prepare: (id) => calls.push(['prepare', id]),
    resolve: (request) => ({ ...request, provider: 'sensevoice-local' }),
    transcribe: async (spec) => {
      calls.push(['transcribe', spec.audio.length])
      return { text: '  今天写完了  ', audioSeconds: 0.1, inferenceSeconds: 0.2 }
    },
  }
  const bridge = new SpeechBridge({ get: () => fake })
  const state = bridge.state()
  check('a speech bridge reports availability', state.available === true && state.providers[0].id === 'sensevoice-local', JSON.stringify(state))
  check('prepare warm the selected recognizer', bridge.prepare().available === true && calls[0]?.[1] === 'sensevoice-local', JSON.stringify(calls))

  const base64 = Buffer.from(wav()).toString('base64')
  const result = await bridge.transcribe({ audioBase64: base64 })
  check('transcribe returns the trimmed text', result.text === '今天写完了', JSON.stringify(result))
  check('transcribe hands the audio to the host', calls.some(([kind, size]) => kind === 'transcribe' && size > 44), JSON.stringify(calls))

  let badAudio = null
  try {
    await bridge.transcribe({ audioBase64: Buffer.from('not a wav').toString('base64') })
  } catch (error) {
    badAudio = error
  }
  check('audio that is not a wav is refused', badAudio?.code === 'SPEECH_BAD_AUDIO', String(badAudio?.code))

  let missing = null
  try {
    await silent.transcribe({ audioBase64: base64 })
  } catch (error) {
    missing = error
  }
  check('transcribing without a service says so', missing?.code === 'SPEECH_UNAVAILABLE', String(missing?.code))
  check('base64 decodes back to the same bytes', decodeBase64(base64).length === wav().length)
}

// ---- personas ----
// A listener is a name plus a brief; the presets are code, the author's own live in personas.json, and a
// silent answer is a valid answer.
{
  const root = await mkdtemp(join(tmpdir(), 'dsh-notes-persona-'))
  const store = new NoteStore({ config: { notesPath: root } })
  const personas = new PersonaStore(store)
  check('the presets ship in code', BUILTIN_PERSONAS.length === 4 && BUILTIN_PERSONAS.every((entry) => entry.id && entry.brief))
  check('every preset greets', BUILTIN_PERSONAS.every((entry) => typeof entry.welcome === 'string' && entry.welcome.length > 0))
  check('a persona without a brief is dropped', normalizePersona({ id: 'x', name: 'X' }) === null)

  const before = await personas.list()
  check(
    'the list starts with the presets',
    before.length === 4 && before.every((entry) => entry.custom === false && entry.edited === false),
    JSON.stringify(before.map((entry) => entry.id)),
  )

  const saved = await personas.saveCustom([{ id: 'own-1', name: '我的顾问', brief: '只问一个问题。' }])
  check('a custom persona is stored beside the notes', saved.length === 5 && saved.some((entry) => entry.id === 'own-1' && entry.custom === true), JSON.stringify(saved.map((entry) => entry.id)))
  const reread = await personas.list()
  check('custom personas survive a reload', reread.some((entry) => entry.name === '我的顾问' && entry.brief === '只问一个问题。'))

  // Presets are editable now: an entry with a preset id is an override, not a fifth person.
  const presetEdit = await personas.upsert({ ...BUILTIN_PERSONAS[0], name: '改过的' })
  check('a preset can be edited in place', presetEdit.name === '改过的' && presetEdit.custom === false && presetEdit.edited === true)
  const afterEdit = await personas.list()
  check('editing a preset does not add a duplicate', afterEdit.filter((entry) => entry.id === BUILTIN_PERSONAS[0].id).length === 1 && afterEdit.length === 5)
  await personas.reset(BUILTIN_PERSONAS[0].id)
  const afterReset = await personas.list()
  check(
    'resetting brings the shipped text back',
    afterReset.find((entry) => entry.id === BUILTIN_PERSONAS[0].id)?.name === BUILTIN_PERSONAS[0].name &&
      afterReset.find((entry) => entry.id === BUILTIN_PERSONAS[0].id)?.edited === false,
  )
  check('a preset cannot be deleted, only reset', (await personas.remove(BUILTIN_PERSONAS[0].id)) === false)

  await personas.upsert({ id: 'own-2', name: '问者', brief: 'You ask one question.' })
  check('an own persona can be deleted', (await personas.remove('own-2')) === true && !(await personas.list()).some((entry) => entry.id === 'own-2'))
  let invalid = null
  try {
    await personas.upsert({ id: 'own-3', name: '', brief: '' })
  } catch (error) {
    invalid = error
  }
  check('a card without a name or a brief is refused', invalid?.code === 'PERSONA_INVALID' && invalid?.status === 400)
  await rm(root, { recursive: true, force: true })
}

{
  // ---- the partner's switch board ----
  // Defaults are the opinionated ones: on, and choosing for itself. Everything is re-read through
  // normalizeSettings, so a hand-edited settings.json cannot put the panel in an impossible state.
  check('the partner starts on and choosing for itself', DEFAULT_SETTINGS.enabled === true && DEFAULT_SETTINGS.mode === 'auto')
  check('three guests by default', DEFAULT_SETTINGS.maxGuests === 3)
  check('an unknown mode falls back to auto', normalizeSettings({ mode: 'whatever' }).mode === 'auto')
  check('guests are clamped', normalizeSettings({ maxGuests: 99 }).maxGuests === 4 && normalizeSettings({ maxGuests: 0 }).maxGuests === 1)

  const root = await mkdtemp(join(tmpdir(), 'dsh-notes-settings-'))
  const store = new NoteStore({ config: { notesPath: root } })
  const settings = new SettingsStore(store)
  check('a missing file reads as the defaults', (await settings.read()).mode === 'auto')
  const written = await settings.write({ enabled: false, personaId: 'jobs' })
  check('a patch is merged and stored', written.enabled === false && written.personaId === 'jobs' && written.maxGuests === 3)
  const again = await settings.read()
  check('settings survive a reload', again.enabled === false && again.personaId === 'jobs')

  const prompt = buildSelectPrompt(BUILTIN_PERSONAS, { excerpt: '这一章的财政数据对不上。', maxGuests: 3 })
  check('the chooser sees the catalogue', BUILTIN_PERSONAS.every((entry) => prompt.user.includes(entry.id)))
  check('the chooser sees what was said', prompt.user.includes('财政数据'))
  check('the chooser may answer NONE', /NONE/.test(prompt.system))
  check('the chooser is told the table size', /最多挑 3 位/.test(prompt.system))

  const generateWith = (text) => async ({ onDelta }) => {
    onDelta(text)
  }
  const table = await choosePersonas({ generate: generateWith('fortune\njobs'), config: {}, store, logger: { warn() {}, info() {} } }, { excerpt: '先看看这件事的走势。', maxGuests: 3 })
  check('the convenor seats a table', table.length === 2 && table[0].id === 'fortune' && table[1].id === 'jobs')
  const capped = await choosePersonas({ generate: generateWith('fortune jobs aristotle analyst'), config: {}, store, logger: { warn() {}, info() {} } }, { excerpt: '先看看这件事的走势。', maxGuests: 2 })
  check('the table respects maxGuests', capped.length === 2)
  const none = await choosePersonas({ generate: generateWith('NONE'), config: {}, store, logger: { warn() {}, info() {} } }, { excerpt: '今天天气不错。' })
  check('NONE means nobody fits', none.length === 0)
  const ghost = await choosePersonas({ generate: generateWith('nobody'), config: {}, store, logger: { warn() {}, info() {} } }, { excerpt: '今天天气不错。' })
  check('an unknown id is dropped, not trusted', ghost.length === 0)

  // ---- the convenor writing a missing guest ----
  const createPrompt = buildCreatePrompt(BUILTIN_PERSONAS, { excerpt: '明朝的财政为什么收不上税。' })
  check('the writer is told the card schema', /"brief"/.test(createPrompt.system) && /"welcome"/.test(createPrompt.system))
  check('the writer sees the story', createPrompt.user.includes('明朝的财政'))
  const card = parsePersonaCard('好的：{"name":"黄仁宇","nameEn":"Ray Huang","domain":["历史"],"brief":"You read institutions.","welcome":"我在听。"}')
  check('a card wrapped in prose is still read', card !== null && card.name === '黄仁宇')
  const made = personaFromCard(card, BUILTIN_PERSONAS)
  check('a written card becomes a persona', made !== null && made.id.startsWith('auto-') && made.origin === 'auto')
  check('a broken card is refused', personaFromCard(null, BUILTIN_PERSONAS) === null && parsePersonaCard('no json here') === null)

  const created = await createPersona({ generate: generateWith('{"name":"黄仁宇","nameEn":"Ray Huang","brief":"You read institutions.","welcome":"我在听。"}'), config: {}, store, logger: { warn() {}, info() {} } }, { excerpt: '明朝的财政。' })
  check('a written guest is stored', created !== null && created.custom === true && created.origin === 'auto')
  check('the room grows by one', (await new PersonaStore(store).list()).length === BUILTIN_PERSONAS.length + 1)
  await rm(root, { recursive: true, force: true })
}

// ---- the convenor ----
// The host of the room: it seats people, hands each a directive, and decides whether the room answers
// now or at the next pause. Everything the panel does downstream follows this plan.
{
  const prompt = buildConvenePrompt(BUILTIN_PERSONAS, { excerpt: '明朝的财政收不上税。', seated: ['jobs'], maxGuests: 3 })
  check('the convenor sees the catalogue', BUILTIN_PERSONAS.every((entry) => prompt.system.includes(entry.id)))
  check('the convenor knows who is seated', prompt.user.includes('现在在座：乔布斯'))
  check('the seat is not in the cached prefix', prompt.system.includes('现在在座') === false)
  check('the convenor is asked for a plan', /"timing"/.test(prompt.system) && /"directive"/.test(prompt.system))
  check('the convenor may answer "keep"', /"keep":true/.test(prompt.system))
  check('the convenor is told about transcription typos', /错别字/.test(prompt.system) && /修摩罗什/.test(prompt.system))
  check('a question to the room must be answered', /必须 timing = now/.test(prompt.system))
  check('an absent guest answer must also hand over the floor', /必须同时把那个人放进 speak/.test(prompt.system))

  const kept = normalizePlan({ keep: true }, BUILTIN_PERSONAS)
  check('keep is a first-class answer', kept.keep === true)
  const hostPlan = normalizePlan({ mode: 'host', say: '我是这里的召唤师。', seat: [] }, BUILTIN_PERSONAS)
  check('the host can answer as itself', hostPlan.mode === 'host' && hostPlan.say.includes('召唤师') && hostPlan.timing === 'now')
  const hostBlank = normalizePlan({ mode: 'host', say: '', seat: [] }, BUILTIN_PERSONAS)
  check('a host with nothing to say stays quiet', hostBlank.mode === 'listen')
  const mislabelled = normalizePlan({ mode: 'listen', say: '屋里只有鸠摩罗什。', seat: [] }, BUILTIN_PERSONAS)
  check('words outrank a listen label', mislabelled.mode === 'host')
  const focused = buildConvenePrompt(BUILTIN_PERSONAS, { excerpt: '先说一句。\n修摩罗什怎么看？', focus: '修摩罗什怎么看？' })
  check('the convenor is given the latest sentence', focused.user.includes('【作者刚刚说的这一句') && focused.user.includes('修摩罗什怎么看'))
  check('the convenor is told it is always present', /一直在场/.test(focused.system))
  check('the convenor is told not to apologise', /不要道歉/.test(focused.system))
  const withLast = buildConvenePrompt(BUILTIN_PERSONAS, { excerpt: 'x', current: { mode: 'host', timing: 'now', say: '张骞我请来', directives: {} } })
  check('the convenor sees what it said last turn', withLast.user.includes('你上一轮说过：张骞我请来'))
  const summoned = normalizePlan(
    { mode: 'reply', timing: 'now', seat: [{ id: 'jobs', directive: '说一句' }] },
    BUILTIN_PERSONAS,
    { excerpt: '可以让鸠摩罗什来跟我说吗？' },
  )
  check('a summons without the word 现在 still counts as now', summoned.timing === 'now')
  const plain = normalizePlan(
    { mode: 'reply', timing: 'now', seat: [{ id: 'jobs', directive: '说一句' }] },
    BUILTIN_PERSONAS,
    { excerpt: '我在写一个产品的取舍。' },
  )
  check('a plain sentence may still be answered when the convenor decides', plain.timing === 'now')

  const plan = normalizePlan(
    {
      mode: 'discuss',
      timing: 'now',
      seat: [
        { id: 'jobs', directive: '一句话砍掉一半' },
        { id: 'aristotle', directive: '接上乔布斯的话，追问定义' },
        { id: 'nobody', directive: 'x' },
      ],
      note: '请两位',
    },
    BUILTIN_PERSONAS,
    { maxGuests: 3, excerpt: '你们先讨论一下，现在开始。' },
  )
  check('unknown ids are dropped', plan.seat.length === 2 && plan.seat.every((entry) => entry.id !== 'nobody'))
  check('the directives are kept per guest', plan.directives.jobs.includes('砍掉') && plan.directives.aristotle.includes('接上'))
  check('now and discuss survive an explicit request', plan.timing === 'now' && plan.mode === 'discuss')
  check('the caller can refuse now', normalizePlan({ mode: 'reply', timing: 'now', seat: [{ id: 'jobs', directive: 'a' }] }, BUILTIN_PERSONAS, { allowedNow: false }).timing === 'pause')
  check('a single answer has one errand', Object.keys(normalizePlan({ mode: 'reply', seat: [{ id: 'jobs', directive: 'a' }, { id: 'aristotle', directive: 'b' }] }, BUILTIN_PERSONAS).directives).length === 1)

  const lonely = normalizePlan({ mode: 'discuss', seat: [{ id: 'jobs', directive: 'a' }] }, BUILTIN_PERSONAS)
  check('a discussion needs two people', lonely.mode === 'reply')
  const noNow = normalizePlan({ mode: 'reply', timing: 'now', seat: [{ id: 'jobs', directive: 'a' }] }, BUILTIN_PERSONAS, { allowedNow: false })
  check('now can be refused by the caller', noNow.timing === 'pause')
  const listen = normalizePlan({ mode: 'listen', timing: 'now', seat: [] }, BUILTIN_PERSONAS)
  check('a listening turn says nothing', listen.mode === 'listen' && listen.timing === 'pause')

  check('a plan wrapped in prose is read', parseConvene('好：{"mode":"reply","timing":"now","seat":[]}')?.mode === 'reply')
  check('garbage is refused', parseConvene('no plan here') === null)

  const root = await mkdtemp(join(tmpdir(), 'dsh-notes-convene-'))
  const store = new NoteStore({ config: { notesPath: root } })
  const scripted = (texts) => {
    let index = 0
    return async ({ onDelta }) => {
      onDelta(texts[Math.min(index, texts.length - 1)])
      index += 1
    }
  }
  const seated = await convene(
    {
      generate: scripted(['{"mode":"reply","timing":"pause","seat":[{"id":"jobs","directive":"一句话砍掉一半"}],"create":null,"note":""}']),
      config: {},
      store,
      logger: { warn() {}, info() {} },
    },
    { excerpt: '要不要给这个产品加语音。', maxGuests: 3 },
  )
  check('the plan is resolved to real personas', seated.seat.length === 1 && seated.seat[0].id === 'jobs')
  check('the convenor passes its directive through', seated.directives.jobs === '一句话砍掉一半')

  const keptRun = await convene(
    { generate: scripted(['{"keep":true}']), config: {}, store, logger: { warn() {}, info() {} } },
    { excerpt: '要不要给这个产品加语音。', seated: ['jobs'], current: { mode: 'reply', timing: 'pause', directives: { jobs: '一句话砍掉一半' } } },
  )
  check('keep leaves the room alone', keptRun.keep === true && keptRun.seat.length === 0)

  const made = await convene(
    {
      generate: scripted([
        '{"mode":"reply","timing":"pause","seat":[],"create":{"name":"黄仁宇","field":"财政史","why":"他关心制度与执行的距离"},"note":""}',
        '{"name":"黄仁宇","nameEn":"Ray Huang","brief":"You read institutions.","welcome":"账要这么看。"}',
      ]),
      config: {},
      store,
      logger: { warn() {}, info() {} },
    },
    { excerpt: '明朝的财政。', maxGuests: 3 },
  )
  check('an empty room may be filled by writing a guest', made.seat.length === 1 && made.created && made.created.origin === 'auto')
  check('the written guest gets its errand', typeof made.directives[made.seat[0].id] === 'string' && made.directives[made.seat[0].id] !== '')
  await rm(root, { recursive: true, force: true })
}

{
  const persona = { id: 'p', name: 'P', brief: 'You are P.' }
  const prompt = buildInterjectPrompt(persona, { excerpt: '今天开会没定下来。', recent: ['先定义一下"定下来"。'] })
  check('the prompt carries the brief', prompt.system.includes('You are P.'))
  check('the prompt carries what was said', prompt.user.includes('今天开会没定下来。'))
  check('the prompt carries what it already said', prompt.user.includes('先定义一下'))
  check('silence is allowed', /SKIP/.test(prompt.system))

  const quoted = buildInterjectPrompt(persona, {
    excerpt: '我去了敦煌。\n> **鸠摩罗什**：那句话译过来时丢了什么？\n现在说武威。',
    focus: '现在说武威。',
  })
  check('the context is split into author / room / focus', quoted.user.includes('【作者先前写的】') && quoted.user.includes('【你们在屋里说过的') && quoted.user.includes('【作者刚刚说的这一句】'))
  check('the room keeps its own words as background', quoted.user.includes('那句话译过来时丢了什么'))
  check('the focus is the latest sentence', /【作者刚刚说的这一句】\n现在说武威。/.test(quoted.user))
  check('the focus is not repeated in the earlier block', quoted.user.indexOf('现在说武威。') === quoted.user.lastIndexOf('现在说武威。'))

  // Restraint: what was ignored is shown back, and a silence streak raises the bar.
  const learning = buildInterjectPrompt(persona, {
    excerpt: '今天开会没定下来。',
    recent: ['先定义一下"定下来"。'],
    ignored: ['先定义一下"定下来"。'],
    skips: 2,
    quietMs: 90000,
  })
  check('what was ignored is shown back to it', learning.system.includes('不要再提同类') && learning.system.includes('先定义一下'))
  check('a silence streak asks for more silence', /连续 2 次选择沉默/.test(learning.system))
  check('a long stretch of speech discourages interruption', /不要打断他/.test(learning.system))
  check('it is told not to become a nuisance', /宁可十次沉默/.test(learning.system))
}

{
  const root = await mkdtemp(join(tmpdir(), 'dsh-notes-persona-run-'))
  const store = new NoteStore({ config: { notesPath: root } })
  await new PersonaStore(store).saveCustom([{ id: 'own-2', name: '问者', brief: 'You ask one question.' }])
  // The generator is injected: the suite must not need a model route to test the wiring.
  const generateWith = (text) => async ({ onDelta }) => {
    onDelta(text)
  }

  const spoken = await interject({ generate: generateWith('这个"定下来"指什么？'), config: {}, store, logger: { warn() {}, info() {} } }, {
    personaId: 'own-2',
    excerpt: '今天开会没定下来。',
    recent: [],
  })
  check('an interjection comes back as one line', spoken.text === '这个"定下来"指什么？' && spoken.persona.id === 'own-2', JSON.stringify(spoken))

  const silent = await interject({ generate: generateWith('SKIP'), config: {}, store, logger: { warn() {} } }, {
    personaId: 'own-2',
    excerpt: '今天开会没定下来。',
    recent: [],
  })
  check('SKIP means the persona stays quiet', silent.text === '', JSON.stringify(silent))

  let unknown = null
  try {
    await interject({ generate: generateWith('x'), config: {}, store, logger: { warn() {} } }, { personaId: 'nobody', excerpt: 'x', recent: [] })
  } catch (error) {
    unknown = error
  }
  check('an unknown persona is refused', unknown?.code === 'PERSONA_UNKNOWN', String(unknown?.code))
  await rm(root, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
