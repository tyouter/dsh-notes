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
import { BUILTIN_PERSONAS, PersonaStore, buildInterjectPrompt, interject, normalizePersona } from '../lib/personas.js'

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
  // The dashboard conversation is read-only: a write from that session is refused.
  await store.bindLink('board', 'session-board-1', { at: new Date().toISOString() })
  const blocked = await notesTool
    .execute({ action: 'add', body: 'x' }, { agent: { id: 'session-board-1' } })
    .then(
      () => undefined,
      (error) => error,
    )
  check('the board session cannot write', blocked?.code === 'READ_ONLY_SESSION', String(blocked?.code))
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
  check('a persona without a brief is dropped', normalizePersona({ id: 'x', name: 'X' }) === null)

  const before = await personas.list()
  check('the list starts with the presets', before.length === 4 && before.every((entry) => entry.custom === false), JSON.stringify(before.map((entry) => entry.id)))

  const saved = await personas.saveCustom([{ id: 'own-1', name: '我的顾问', brief: '只问一个问题。' }])
  check('a custom persona is stored beside the notes', saved.length === 5 && saved.some((entry) => entry.id === 'own-1' && entry.custom === true), JSON.stringify(saved.map((entry) => entry.id)))
  const reread = await personas.list()
  check('custom personas survive a reload', reread.some((entry) => entry.name === '我的顾问' && entry.brief === '只问一个问题。'))

  const presetEdit = await personas.saveCustom([{ ...BUILTIN_PERSONAS[0], name: '改过的' }])
  check('a preset is never written by the author', presetEdit.every((entry) => entry.custom === false), JSON.stringify(presetEdit.map((entry) => entry.custom)))
  await rm(root, { recursive: true, force: true })
}

{
  const persona = { id: 'p', name: 'P', brief: 'You are P.' }
  const prompt = buildInterjectPrompt(persona, { excerpt: '今天开会没定下来。', recent: ['先定义一下"定下来"。'] })
  check('the prompt carries the brief', prompt.system.includes('You are P.'))
  check('the prompt carries what was said', prompt.user.includes('今天开会没定下来。'))
  check('the prompt carries what it already said', prompt.user.includes('先定义一下'))
  check('silence is allowed', /SKIP/.test(prompt.system))
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
