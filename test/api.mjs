// The data plane, exercised in-process.
//
// The running app keeps its host modules in memory, so a route added here cannot
// be reached until the app restarts. This test boots the real `registerNotesApi`
// against a fake webServer, a fake `llm` and a real store, then drives every
// route the panel uses — including the two SSE streams — so the handlers are
// proven before anyone restarts anything.
//
//   node test/api.mjs

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { NoteStore } from '../lib/store.js'
import { registerNotesApi } from '../lib/api.js'

const here = dirname(fileURLToPath(import.meta.url))
let failures = 0
const check = (label, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${condition ? '' : `  ${detail}`}`)
  if (!condition) failures += 1
}

/** A minimal SSE response: records what the handler wrote. */
function fakeResponse() {
  const frames = []
  const response = {
    status: 0,
    headers: {},
    ended: false,
    writeHead(status, headers) {
      response.status = status
      response.headers = headers ?? {}
    },
    flushHeaders() {},
    write(chunk) {
      frames.push(String(chunk))
    },
    end(chunk) {
      if (chunk !== undefined && chunk !== null) frames.push(String(chunk))
      response.ended = true
    },
    on() {},
    frames,
  }
  return response
}

/** Parse recorded SSE text into { event, data } pairs. */
function parseFrames(frames) {
  const out = []
  for (const chunk of frames) {
    for (const block of String(chunk).split('\n\n')) {
      const lines = block.split('\n').filter(Boolean)
      if (lines.length === 0) continue
      let event = 'message'
      let data = ''
      for (const line of lines) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      if (data === '') continue
      try {
        out.push({ event, data: JSON.parse(data) })
      } catch {
        out.push({ event, data: null })
      }
    }
  }
  return out
}

/** A fake request whose JSON body the reader can drain (async-iterable). */
function fakeRequest(method, url, body) {
  const payload = body === undefined ? '' : JSON.stringify(body)
  const chunks = payload === '' ? [] : [Buffer.from(payload, 'utf8')]
  return {
    method,
    url,
    headers: { 'content-type': 'application/json' },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
    on() {
      return this
    },
    destroy() {},
  }
}

/** One model answer, streamed as the llm service would. */
const llmCalls = []
function fakeLlm(answer) {
  return {
    resolveModelInfo: async () => ({ reasoning: { efforts: [{ id: 'off' }] } }),
    async *stream(options) {
      llmCalls.push(options)
      // The provider reports usage before the text; keep that shape.
      yield { type: 'usage', usage: { inputTokens: 1000, outputTokens: 250, cacheReadTokens: 700 } }
      const pieces = String(answer).match(/[\s\S]{1,12}/g) ?? []
      for (const piece of pieces) {
        yield { type: 'text-delta', text: piece }
      }
      yield { type: 'finish', reason: { kind: 'completed' } }
    },
  }
}

const directory = await mkdtemp(join(tmpdir(), 'notes-api-'))
// Declared outside the try so the finally block can release it.
let disposeDataPlane
try {
  let handler
  const webServer = {
    register({ path, handler: mounted }) {
      check('data plane mounts at /notes/api', path === '/notes/api', path)
      handler = mounted
      return () => {}
    },
  }

  let answer = '普通回答。'
  const ctx = {
    get(name) {
      if (name === 'webServer') return webServer
      if (name === 'llm') return fakeLlm(answer)
      if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-flash' }) }
      return undefined
    },
  }

  const store = new NoteStore({ ctx: { get: () => undefined }, config: { notesPath: directory } })
  disposeDataPlane = registerNotesApi(ctx, store, { config: {}, logger: { warn() {}, info() {} } })
  check('the plugin returns a disposer', typeof disposeDataPlane === 'function')
  check('a handler was mounted', typeof handler === 'function')

  const call = async (method, path, body) => {
    const res = fakeResponse()
    await handler(fakeRequest(method, `/notes/api/${path}`, body), res)
    const text = res.frames.join('')
    try {
      return { status: res.status || 200, json: JSON.parse(text), res }
    } catch {
      return { status: res.status || 200, raw: text, res }
    }
  }

  // ---- notes CRUD still works ----
  await store.save({ body: '第二条\n内容', tags: ['工作'] })
  await store.save({ body: 'first', tags: ['工作', 'idea'], source: 'ai' })

  const list = await call('GET', 'list')
  check('list returns the notes', list.json?.data?.total === 2, JSON.stringify(list.json?.data?.total))

  // ---- statistics ----
  const stats = await call('GET', 'stats?days=30')
  const data = stats.json?.data
  check('stats responds', stats.json?.ok === true, JSON.stringify(stats.json)?.slice(0, 120))
  check('stats counts notes', data?.totals?.notes === 2, String(data?.totals?.notes))
  check('stats counts tags', data?.totals?.tags === 2, String(data?.totals?.tags))
  check('stats has a 30-day series', data?.charts?.created?.length === 30, String(data?.charts?.created?.length))
  check('stats has AI shape', data?.ai !== undefined && Array.isArray(data.ai.byKind))
  check('stats keeps the pinned list separate from the series', data?.pinned?.length === 0 && Array.isArray(data?.charts?.created))

  // ---- pinned charts ----
  const savedChart = await call('POST', 'charts', { chart: { id: 'c1', title: '我的图', type: 'bar', data: [{ label: 'a', value: 2 }] } })
  check('chart saves', savedChart.json?.data?.charts?.length === 1, JSON.stringify(savedChart.json?.data)?.slice(0, 120))
  const afterSave = await call('GET', 'stats?days=30')
  check('stats carries the pinned chart', afterSave.json?.data?.pinned?.length === 1, JSON.stringify(afterSave.json?.data?.pinned))
  const removedChart = await call('POST', 'charts/remove', { id: 'c1' })
  check('chart removes', removedChart.json?.data?.charts?.length === 0)

  // ---- completion ----
  answer = '李四会先同步压测报告。'
  const completed = await call('POST', 'complete', { text: '## 会议\n产品上线会议 的议题是压测。', caret: 23 })
  check('completion returns the next sentence', completed.json?.data?.text === '李四会先同步压测报告。', JSON.stringify(completed.json).slice(0, 200))
  const completeCall = llmCalls[llmCalls.length - 1]
  check('the completion prompt carries the note tail', JSON.stringify(completeCall?.messages ?? []).includes('产品上线会议'), JSON.stringify(completeCall?.messages ?? []).slice(0, 160))
  check('the completion prompt forbids new facts', String(completeCall?.system ?? '').includes('宁可短') || JSON.stringify(completeCall?.messages ?? []).includes('不要引入原文没有的专有信息'))

  answer = ''
  const emptyCompletion = await call('POST', 'complete', { text: '今天好累。', caret: 5 })
  check('an empty answer is allowed', emptyCompletion.json?.data?.text === '', JSON.stringify(emptyCompletion.json).slice(0, 160))

  // ---- the dashboard chat is a native session now, so the route is gone ----
  const noChat = await call('POST', 'chat/stream', { question: 'x' })
  check('the prompt-stuffing chat route is gone', noChat.status === 404, String(noChat.status))

  // ---- client beacons land in the event log ----
  const beacon = await call('POST', 'event', { kind: 'tab', detail: 'history' })
  check('a beacon is accepted', beacon.json?.data?.recorded === true, JSON.stringify(beacon.json).slice(0, 120))

  // ---- the native conversation needs a session id ----
  const session = await call('POST', 'session/create', {})
  check('session/create answers or explains itself', session.json?.ok !== undefined, JSON.stringify(session.json).slice(0, 140))
  // ---- the structuring stream still works and records usage ----
  answer = '```json\n{"title":"T","body":"B","tags":["x"]}\n```'
  const enhance = await call('POST', 'enhance/stream', { text: '原始内容' })
  const enhanceFrames = parseFrames(enhance.res.frames)
  const enhanceDone = enhanceFrames.find((frame) => frame.event === 'done')
  check('enhance streams a draft', enhanceDone?.data?.draft?.body === 'B', JSON.stringify(enhanceDone?.data)?.slice(0, 120))

  // The structuring instruction is real prompt text, and configurable.
  const enhanceCall = llmCalls.find((call) => String(call.system).includes('json'))
  check('structuring sends a system instruction', enhanceCall !== undefined)
  check('the instruction asks for a json block', String(enhanceCall?.system).includes('json'))
  check('structuring runs without tools', enhanceCall?.tools === undefined)

  // The target language travels with the request and lands in the prompt.
  answer = '```json\n{"title":"T","body":"B"}\n```'
  await call('POST', 'enhance/stream', { text: '原始内容', language: 'English' })
  const localized = llmCalls[llmCalls.length - 1]
  const localizedText = JSON.stringify(localized?.messages ?? [])
  // ---- translation has its own route ----
  // The copilot's wrapper (action, note title, quoted text) used to be translated
  // along with the note. This route sends only an instruction and the text.
  answer = '返回的译文'
  const translated = await call('POST', 'translate/stream', { text: '原始文本', target: 'English', keepNumbering: true })
  const translatedFrames = translated.raw ?? ''
  check('translate streams deltas', translatedFrames.includes('event: delta'), translatedFrames.slice(0, 120))
  check('translate finishes with the text', translatedFrames.includes('event: done'), translatedFrames.slice(0, 200))
  const translateCall = llmCalls[llmCalls.length - 1]
  const translateSystem = String(translateCall?.system ?? '')
  check('the translate prompt is instruction only', translateSystem.includes('只输出译文本身'), translateSystem.slice(0, 120))
  // ---- indexed translation ----
  // The draft goes out as numbered lines; the answer is parsed by index, so a merged or omitted
  // line cannot shorten the result.
  answer = ['<<1>> Opening', '<<2>> ', '<<3>> - item one', '<<5>> - item three'].join('\n')
  const indexed = await call('POST', 'translate/stream', { lines: ['开头', '', '- 一', '- 二', '- 三'], target: 'English' })
  const indexedDone = /event: done\ndata: (.*)/.exec(String(indexed.raw ?? ''))
  const indexedPayload = indexedDone === null ? null : JSON.parse(indexedDone[1])
  check('indexed translation returns an array', Array.isArray(indexedPayload?.lines), String(indexed.raw ?? '').slice(0, 200))
  check('indexed translation keeps the indices', indexedPayload?.lines?.[0] === 'Opening' && indexedPayload?.lines?.[2] === '- item one', JSON.stringify(indexedPayload))
  check('a blank line stays blank', indexedPayload?.lines?.[1] === null, JSON.stringify(indexedPayload?.lines))
  check('an omitted line is null, not shifted', indexedPayload?.lines?.[3] === null && indexedPayload?.lines?.[4] === '- item three', JSON.stringify(indexedPayload?.lines))
  const indexedCall = llmCalls[llmCalls.length - 1]
  check('the draft is sent with line numbers', JSON.stringify(indexedCall?.messages ?? []).includes('<<1>>'), JSON.stringify(indexedCall?.messages ?? []).slice(0, 160))
  check('the prompt forbids merging', String(indexedCall?.system ?? '').includes('不要合并两行'), String(indexedCall?.system ?? '').slice(0, 120))

  // ---- title handling through the route ----
  answer = ['缓存优化记录', '', '- 命中缓存时 0.4 秒', '- 未命中时 1.6 秒', '', '标签：缓存, 性能'].join('\n')
  const titled = await call('POST', 'enhance', { text: '缓存优化记录 命中缓存 0.4 秒 未命中 1.6 秒' })
  const titledDraft = titled.json?.data?.draft ?? {}
  check('the draft does not repeat its title', String(titledDraft.body ?? '').startsWith('缓存优化记录') === false, JSON.stringify(titledDraft))
  check('the title is kept once', titledDraft.title === '缓存优化记录', JSON.stringify(titledDraft.title))

  answer = ['## 议题一：加载性能', '', '1. 现状', '', '## 议题二：token', '一、已统计'].join('\n')
  const sections = await call('POST', 'enhance', { text: '议题一 加载性能 1 现状 议题二 token 一 已统计' })
  const sectionsDraft = sections.json?.data?.draft ?? {}
  check('a multi-section draft has no separate title', sectionsDraft.title === '', JSON.stringify(sectionsDraft.title))
  check('both section headings survive', String(sectionsDraft.body ?? '').includes('## 议题一') && String(sectionsDraft.body ?? '').includes('## 议题二'), JSON.stringify(sectionsDraft.body))

  check('the translate prompt keeps numbering when asked', translateSystem.includes('序号体系与原文保持一致') || translateSystem.includes('序号与标题记号按上面的规则原样保留'), translateSystem.slice(0, 220))
  check('the note text is the user message', JSON.stringify(translateCall?.messages ?? []).includes('原始文本'))

  // A fenced or quoted answer is cleaned before it reaches the editor.
  answer = ['```markdown', 'Translated body', '```'].join('\n')
  const fenced = await call('POST', 'translate/stream', { text: '甲', target: 'English' })
  const fencedDone = /event: done\ndata: (.*)/.exec(String(fenced.raw ?? ''))
  const fencedText = fencedDone === null ? null : JSON.parse(fencedDone[1]).text
  check('a code fence is stripped from the translation', fencedText === 'Translated body', JSON.stringify(fencedText))

  check('the language reaches the prompt', localizedText.includes('English'), localizedText.slice(0, 160))
  check('the prompt asks for it explicitly', localizedText.includes('目标语言'))

  // The event log is what the dashboard's AI numbers come from.
  const afterAi = await call('GET', 'stats?days=30')
  check('AI usage is recorded', Number(afterAi.json?.data?.ai?.calls) >= 2, String(afterAi.json?.data?.ai?.calls))
  check('AI usage is broken down by kind', (afterAi.json?.data?.ai?.byKind ?? []).length >= 2, JSON.stringify(afterAi.json?.data?.ai?.byKind))

  // Token accounting: per-call numbers, aggregated by the stats route.
  const tokens = afterAi.json?.data?.tokens
  check('tokens are recorded', Number(tokens?.total) > 0, JSON.stringify(tokens))
  check('input and output are separated', Number(tokens?.input) > 0 && Number(tokens?.output) > 0)
  check('cache reads are tracked', Number(tokens?.cacheRead) > 0, String(tokens?.cacheRead))
  check('the call count is tracked', Number(tokens?.calls) >= 2, String(tokens?.calls))
  check('a daily token series exists', Array.isArray(afterAi.json?.data?.charts?.tokens))
  check('the context size is averaged', Number(tokens?.averageContextChars) > 0, String(tokens?.averageContextChars))

  // ---- unknown route ----
  const missing = await call('GET', 'nope')
  check('unknown route answers 404', missing.status === 404, String(missing.status))
} finally {
  // Release the sqlite handle before deleting the directory (Windows locks it).
  disposeDataPlane?.()
  await rm(directory, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
