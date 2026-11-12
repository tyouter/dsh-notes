/**
 * The panel's data plane: one HTTP route under `/notes/api`, served by the host
 * on the GUI's own origin.
 *
 * A bundled plugin's browser half has no package-private RPC bridge, so a plain
 * route is the version-stable way for the panel to read and write the notebook.
 * The model reaches the same data through the `notes` tool; both sides call one
 * `NoteStore`, so there is no second implementation of "what a note is".
 *
 * Model work goes through `sessions.js` (a session is the only place a model is
 * reachable in this deployment), and the prompts are `prompt.js`'s, shared with
 * the agent tool.
 */

import { computeStats } from './analytics.js'
import { listAssets, readAsset, saveAsset } from './assets.js'
import { convene } from './convene.js'
import { choosePersonas, createPersona, interject, PersonaStore } from './personas.js'
import { streamTranslate } from './chat.js'
import { complete } from './complete.js'
import { NotesDatabase } from './db.js'
import { ChartStore, EventLog } from './events.js'
import { SettingsStore, publicSettings } from './settings.js'
import { streamStructuredNote } from './llm.js'

import { buildEnhanceMessage, readEnhanceResult } from './prompt.js'


const PREFIX = '/notes/api'

/**
 * The system instruction for a structuring call. Short on purpose: a shorter
 * prompt is a shorter time-to-first-token.
 */
/**
 * The instruction for one structuring call.
 *
 * This used to be an agent preset's persona. Moving the call to `ctx.llm.stream()`
 * removed the session (and the stall that came with it), and the persona came with
 * it into code. `enhanceSystem` in the row config overrides it, so the behaviour
 * is still tunable from `cordis.patch.yml` without touching the plugin.
 */
function enhanceSystemOf(config) {
  const custom = typeof config?.enhanceSystem === 'string' ? config.enhanceSystem.trim() : ''
  return custom === '' ? ENHANCE_SYSTEM : custom
}

const ENHANCE_SYSTEM = [
  '你把用户给的原始内容整理成一条结构化笔记。只做这一件事。',
  '不添加原文没有的事实、数字、人名；缺失处留待补。保留用户自己的说法和语气。',
  '第一行就是标题（不要写 # 号）；正文用 Markdown：短段落、必要时用列表。',
  '不要加总结、不要写「以上」、不要复述指令。',
  // The answer is prose, not a data structure: it is streamed to the page and read as it arrives,
  // and a JSON field leaked into the page once too often. `lib/prompt.js` still salvages a JSON
  // answer, because an older `enhanceSystem` override may ask for one.
  '答案是一篇可以直接读的笔记：正文就是最终的 Markdown 本体。',
  '不要输出 JSON、不要输出代码块、不要加任何解释或前后缀。',
  '最后单独一行「标签：a, b」给出 2-4 个短标签。',
].join('\n')

/**
 * Mount the route reactively on `webServer`.
 *
 * At activation the HTTP carrier may not be mounted yet, so `ctx.inject`
 * registers the route when the service appears and disposes it when it leaves;
 * a synchronous lookup is only the fallback.
 */
export function registerNotesApi(ctx, store, { config, logger, speech, settings, revisions, sync } = {}) {
  // One projection handle per plugin instance, created on the first query, so the
  // routes and the mount disposer share it.
  let database
  const databaseOf = () => {
    if (database === undefined) database = new NotesDatabase(store, { logger })
    return database
  }

  // The settings/history/backup handles come from `index.js` so they are the same
  // instances the store's write hook talks to. Tests may construct the API alone,
  // in which case the plain per-request objects are enough.
  const settingsOf = () => settings ?? new SettingsStore(store)
  const syncOf = () => sync ?? null
  const revisionsOf = () => revisions ?? null

  // One projection handle per plugin instance; created on first query.

  const mount = (webServer) => {
    if (webServer === undefined || webServer === null || typeof webServer.register !== 'function') {
      logger?.warn?.('[notes] webServer is unavailable: the notebook panel has no data plane')
      return () => {}
    }
    const handler = async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const route = decodePath(url.pathname.slice(PREFIX.length).replace(/^\/+/, ''))
        const method = (req.method ?? 'GET').toUpperCase()
        const query = Object.fromEntries(url.searchParams.entries())
        const body = method === 'POST' || method === 'PUT' ? await readJsonBody(req) : {}
        // Streaming routes own the response: they cannot go through `dispatch`.
        if (
          method === 'POST' &&
          (route === 'enhance/stream' || route === 'translate/stream')
        ) {
          const streaming = {
            'enhance/stream': streamEnhance,
                      // Translation has its own prompt: the wrapper words around the text would otherwise be
            // translated along with the note.
            'translate/stream': streamTranslate,
          }
          await streaming[route]({ res, body, ctx, config, logger, store })
          return
        }
        // An image in a note is a file, so this one route answers bytes rather than JSON.
        if (method === 'GET' && route === 'asset') {
          const asset = await readAsset(store, query.path)
          res.writeHead(200, {
            'content-type': asset.type,
            'content-length': String(asset.body.length),
            // The name is the content hash: the same URL can never mean different bytes.
            'cache-control': 'public, max-age=31536000, immutable',
            'x-content-type-options': 'nosniff',
          })
          res.end(asset.body)
          return
        }
        const data = await dispatch({
          route,
          method,
          query,
          body,
          store,
          ctx,
          config,
          logger,
          databaseOf,
          speech,
          settingsOf,
          syncOf,
          revisionsOf,
        })
        respondJson(res, 200, { ok: true, data })
      } catch (error) {
        const status = Number(error?.status) || 500
        if (status >= 500) logger?.warn?.(`[notes] api error: ${error?.message ?? error}`)
        respondJson(res, status, {
          ok: false,
          error: { code: error?.code ?? 'INTERNAL', message: String(error?.message ?? error) },
        })
      }
    }
    try {
      const dispose = webServer.register({ kind: 'prefix', path: PREFIX, handler })
      logger?.info?.(`[notes] data plane mounted at ${PREFIX}`)
      const unmount = typeof dispose === 'function' ? dispose : () => {}
      return () => {
        try {
          unmount()
        } catch {
          /* an already-unmounted plane is fine */
        }
        database?.close()
      }
    } catch (error) {
      logger?.warn?.(`[notes] could not mount ${PREFIX}: ${error?.message ?? error}`)
      return () => {}
    }
  }

  if (typeof ctx.inject === 'function') {
    try {
      return ctx.inject(['webServer'], (scoped) => mount(scoped?.webServer ?? scoped?.get?.('webServer')))
    } catch {
      /* fall through to the synchronous attempt */
    }
  }
  return mount(ctx.get?.('webServer'))
}

async function dispatch({ route, method, query, body, store, ctx, config, logger, databaseOf, speech, settingsOf, syncOf, revisionsOf }) {
  // Cheap handles, one per request: both only hold the notebook directory.
  const eventsOf = () => new EventLog(store)
  const chartsOf = () => new ChartStore(store)

  if (route === 'health') {
    return { ok: true, location: store.location(), at: new Date().toISOString() }
  }

  if (route === 'list' && method === 'GET') {
    const listing = await store.list({
      query: query.q ?? '',
      tag: query.tag ?? '',
      includeTrash: query.trash === '1',
      limit: numberOr(query.limit, 0),
    })
    const tags = await store.tags()
    return { ...listing, tags, location: store.location() }
  }

  if (route === 'tags' && method === 'GET') {
    return { tags: await store.tags() }
  }

  const single = route.match(/^note\/([^/]+)$/)
  if (single !== null) {
    const id = single[1]
    if (method === 'GET') return await store.get(id)
    if (method === 'PUT') return await store.save({ id, ...body })
    if (method === 'DELETE') return await store.remove(id)
  }

  if (route === 'note' && (method === 'POST' || method === 'PUT')) {
    return await store.save({
      body: body.body ?? body.content ?? body.text,
      tags: body.tags,
      pinned: body.pinned,
      source: body.source,
      enhancedFrom: body.enhancedFrom,
    })
  }

  if (route === 'restore' && method === 'POST') {
    return await store.restore(String(body.id ?? ''))
  }

  // ---- the trash: what was deleted, and the two ways of making it final ----

  if (route === 'trash' && method === 'GET') {
    const notes = await store.trashed()
    return { trash: notes, total: notes.length }
  }

  if (route === 'trash/purge' && method === 'POST') {
    return await store.purge(String(body.id ?? ''))
  }

  if (route === 'trash/empty' && method === 'POST') {
    return await store.emptyTrash()
  }

  if (route === 'update' && method === 'POST') {
    return await store.update({
      id: body.id,
      pinned: typeof body.pinned === 'boolean' ? body.pinned : undefined,
      tags: Array.isArray(body.tags) ? body.tags : undefined,
      replace: body.replace === true,
    })
  }

  // ---- AI: raw thought in, structured note out ------------------------------

  if (route === 'enhance' && method === 'POST') {
    return await enhance({ ctx, config, logger, store, text: body.text, instruction: body.instruction, body })
  }

  // ---- completion: the next sentence, only when the author stopped typing ----

  if (route === 'complete' && method === 'POST') {
    return await complete({ ctx, config, logger, store, body })
  }

  // ---- the dashboard conversation ------------------------------------------

  if (route === 'session/create' && method === 'POST') {
    // Creation is Host-only: the Client can retain and drive a session but not
    // create one.
    const controller = ctx?.get?.('sessionController')
    if (controller === undefined || typeof controller.create !== 'function') {
      throw Object.assign(new Error('宿主没有 sessionController，无法创建会话。'), { code: 'NO_SESSION_CONTROLLER', status: 500 })
    }
    const created = await controller.create({
      cwd: store.resolveDirectory() === undefined ? undefined : undefined,
      agentPreset: typeof config?.boardPreset === 'string' ? config.boardPreset : 'notes-board',
    })
    const sessionId = String(created?.sessionId ?? created?.id ?? "")
    if (sessionId === '') throw Object.assign(new Error('会话创建没有返回 id。'), { code: 'NO_SESSION_ID', status: 500 })
    await store.bindLink('board', sessionId, { at: new Date().toISOString() }).catch(() => undefined)
    return { sessionId, agentPreset: created?.agentPreset ?? null }
  }

  if (route === 'session/link' && method === 'GET') {
    const link = await store.linkOf('board')
    return { sessionId: link?.sessionId ?? null }
  }

  // ---- client beacons ------------------------------------------------------

  if (route === 'event' && method === 'POST') {
    const kind = String(body.kind ?? '')
    if (kind === '') throw badRequest('需要 kind。')
    await eventsOf().record('ui.' + kind.replace(/^ui\./, ''), {
      noteId: body.noteId === undefined ? undefined : String(body.noteId),
      detail: typeof body.detail === 'string' ? body.detail.slice(0, 120) : undefined,
    })
    return { recorded: true }
  }

  // ---- statistics ---------------------------------------------------------

  if (route === 'stats' && method === 'GET') {
    const snapshot = await store.snapshot({ limit: 5000 })
    const events = await eventsOf().read()
    // Keep the queryable projection current: notes, events, and the Q&A log.
    await databaseOf().ready(events).catch(() => undefined)
    await ingestBoardTranscript(ctx, store, databaseOf()).catch(() => undefined)
    return {
      ...computeStats({
        notes: snapshot.notes,
        trashed: await store.trashed(),
        events,
        days: Math.min(Math.max(numberOr(query.days, 30), 7), 180),
      }),
      pinned: await chartsOf().read(),
    }
  }

  // ---- dashboard charts ---------------------------------------------------

  if (route === 'charts' && method === 'GET') {
    return { charts: await chartsOf().read() }
  }

  if (route === 'charts' && method === 'POST') {
    const chart = body.chart
    if (chart === null || typeof chart !== 'object') throw badRequest('需要 chart。')
    const saved = await chartsOf().save({
      id: String(chart.id ?? `c-${Date.now().toString(36)}`),
      title: String(chart.title ?? '图表').slice(0, 60),
      type: ['bar', 'line', 'pie', 'stat'].includes(String(chart.type)) ? String(chart.type) : 'bar',
      data: Array.isArray(chart.data) ? chart.data.slice(0, 40) : [],
      note: typeof chart.note === 'string' ? chart.note.slice(0, 200) : '',
      savedAt: new Date().toISOString(),
    })
    await eventsOf().record('chart.saved', { chartId: String(chart.id ?? '') })
    return { charts: saved }
  }

  // ---- speech -------------------------------------------------------------------------------
  // The notebook recognises nothing itself: these routes stand in front of the Host's `speechToText`
  // registry, the same one the built-in voice input uses. When the voice bundle is disabled the service is
  // absent and `available` is false, which is how the panel knows to draw no microphone at all.
  if (route === 'speech/state' && method === 'GET') {
    return speech === undefined || speech === null ? { available: false, providers: [], selection: null } : speech.state()
  }
  if (route === 'speech/prepare' && method === 'POST') {
    if (speech === undefined || speech === null) {
      throw Object.assign(new Error('语音识别不可用'), { code: 'SPEECH_UNAVAILABLE', status: 503 })
    }
    return speech.prepare()
  }
  if (route === 'settings' && method === 'GET') {
    // The password never travels back to the browser: the page only needs to know that one is stored.
    return { settings: publicSettings(await settingsOf().read()) }
  }
  if (route === 'settings' && method === 'POST') {
    const next = await settingsOf().write(body?.settings ?? body)
    // A destination that was just chosen is worth one copy now, rather than at the next save.
    syncOf()?.schedule(0)
    return { settings: publicSettings(next) }
  }

  // ---- images -----------------------------------------------------------------------------
  // A pasted picture goes in as base64 and comes back as a note-relative path; the note body then
  // only carries `![](assets/…png)`, which is what the renderer and the backup both understand.
  if (route === 'asset' && method === 'POST') {
    return { asset: await saveAsset(store, body ?? {}) }
  }
  if (route === 'assets' && method === 'GET') {
    const assets = await listAssets(store)
    return { assets: assets.map(({ path, bytes }) => ({ path, bytes })), total: assets.length }
  }

  // ---- backup -----------------------------------------------------------------------------
  // The engine lives in `index.js` (one instance, debounced from the store's write hook); these
  // routes only ask it what happened and occasionally push a run through by hand.
  if (route === 'sync/state' && method === 'GET') {
    return { sync: syncOf()?.state() ?? { mode: 'off', configured: false, lastResult: 'never' } }
  }
  if (route === 'sync/run' && method === 'POST') {
    const engine = syncOf()
    if (engine === null) throw Object.assign(new Error('备份不可用'), { code: 'SYNC_UNAVAILABLE', status: 503 })
    return { sync: await engine.run({ manual: true }) }
  }
  if (route === 'sync/test' && method === 'POST') {
    const engine = syncOf()
    if (engine === null) throw Object.assign(new Error('备份不可用'), { code: 'SYNC_UNAVAILABLE', status: 503 })
    return { test: await engine.test() }
  }

  // ---- history ----------------------------------------------------------------------------
  if (route === 'revisions' && method === 'GET') {
    const engine = revisionsOf()
    const revisions = engine === null ? [] : await engine.list(String(query.noteId ?? ''), { limit: numberOr(query.limit, 50) })
    return { revisions }
  }
  if (route === 'revision' && method === 'GET') {
    const engine = revisionsOf()
    if (engine === null) throw Object.assign(new Error('历史版本不可用'), { code: 'HISTORY_UNAVAILABLE', status: 503 })
    return { revision: await engine.read(String(query.noteId ?? ''), String(query.stamp ?? '')) }
  }
  if (route === 'revision/restore' && method === 'POST') {
    const engine = revisionsOf()
    if (engine === null) throw Object.assign(new Error('历史版本不可用'), { code: 'HISTORY_UNAVAILABLE', status: 503 })
    return await engine.restore(String(body?.noteId ?? ''), String(body?.stamp ?? ''))
  }
  if (route === 'voice/convene' && method === 'POST') {
    // The host of the room: reads the page and the author's ask, then decides who is in, what each is
    // asked to do, and whether the room answers now or at the next pause.
    return convene({ ctx, config, store, logger }, {
      excerpt: body?.excerpt,
      focus: body?.focus,
      maxGuests: body?.maxGuests,
      seated: Array.isArray(body?.seated) ? body.seated : [],
      current: body?.current !== null && typeof body?.current === 'object' ? body.current : null,
    })
  }
  if (route === 'voice/select' && method === 'POST') {
    // The convenor choosing a table: up to `maxGuests` people whose field matches the text. `persona`
    // stays as the old single-seat answer so an older panel keeps working.
    const personas = await choosePersonas({ ctx, config, store, logger }, {
      excerpt: body?.excerpt,
      maxGuests: body?.maxGuests,
    })
    return { personas, persona: personas[0] ?? null }
  }
  if (route === 'voice/create' && method === 'POST') {
    // Nobody fits: write the missing guest from the same card schema as the presets, and store it.
    const persona = await createPersona({ ctx, config, store, logger }, { excerpt: body?.excerpt })
    return { persona }
  }
  if (route === 'voice/personas' && method === 'GET') {
    return { personas: await new PersonaStore(store).list() }
  }
  if (route === 'voice/personas' && method === 'POST') {
    return { personas: await new PersonaStore(store).saveCustom(body?.personas) }
  }
  if (route === 'voice/personas/save' && method === 'POST') {
    // One card at a time: a preset keeps its id, so saving over it is an override rather than a copy.
    const people = new PersonaStore(store)
    const persona = await people.upsert(body?.persona ?? body)
    return { persona, personas: await people.list() }
  }
  if (route === 'voice/personas/reset' && method === 'POST') {
    // Drop the override, bring the shipped text back.
    const people = new PersonaStore(store)
    return { reset: await people.reset(body?.id), personas: await people.list() }
  }
  if (route === 'voice/personas/delete' && method === 'POST') {
    const people = new PersonaStore(store)
    return { removed: await people.remove(body?.id), personas: await people.list() }
  }
  if (route === 'voice/interject' && method === 'POST') {
    // One persona, one quiet remark: the excerpt is what was said, `recent` is what it already said, so it
    // does not repeat itself. An empty `text` means the persona chose to stay silent.
    return interject({ ctx, config, store, logger }, {
      personaId: body?.personaId,
      excerpt: body?.excerpt,
      focus: body?.focus,
      recent: body?.recent,
      ignored: body?.ignored,
      skips: body?.skips,
      quietMs: body?.quietMs,
      directive: body?.directive,
      discussion: body?.discussion,
    })
  }

  if (route === 'speech/transcribe' && method === 'POST') {
    if (speech === undefined || speech === null) {
      throw Object.assign(new Error('语音识别不可用'), { code: 'SPEECH_UNAVAILABLE', status: 503 })
    }
    return speech.transcribe({ audioBase64: body?.audioBase64, language: body?.language })
  }

  if (route === 'charts/remove' && method === 'POST') {
    const charts = await chartsOf().remove(String(body.id ?? ''))
    await eventsOf().record('chart.removed', { chartId: String(body.id ?? '') })
    return { charts }
  }

  throw Object.assign(new Error(`未知的接口：${method} ${route}`), { code: 'NOT_FOUND', status: 404 })
}

/**
 * One structured rewrite, buffered.
 *
 * Straight through `ctx.llm.stream()` — no agent, no session, no tools (see
 * `lib/llm.js` for why). The streamed variant below is what the button uses;
 * this one exists for callers that want the finished value (the agent tool).
 */
async function enhance({ ctx, config, logger, store, text, instruction, body }) {
  const raw = String(text ?? '').trim()
  if (raw === '') throw badRequest('没有要整理的内容。')
  if (raw.length > 20_000) throw badRequest('内容太长，请先拆成几条再整理。')

  const result = await streamStructuredNote({
    ctx,
    config,
    text: buildEnhanceMessage({ text: raw, instruction, language: body?.language, scope: body?.scope }),
    system: enhanceSystemOf(config),
  })
  await new EventLog(store).record('enhance', {
    chars: raw.length,
    elapsedMs: result.elapsedMs,
    firstTokenMs: result.firstTokenMs,
    ok: result.ok,
    model: result.model,
    ...tokenFields(result),
  })
  const parsed = readEnhanceResult(result.answer)
  const base = {
    model: result.model,
    reasoningEffort: result.reasoningEffort,
    elapsedMs: result.elapsedMs,
    firstTokenMs: result.firstTokenMs,
  }
  if (parsed === null) {
    logger?.warn?.(`[notes] enhance produced no parsable draft (${result.failure?.message ?? 'no json block'})`)
    return {
      ok: false,
      ...base,
      raw: result.answer.slice(0, 4000),
      reason:
        result.failure !== null
          ? `模型调用失败：${result.failure.message}`
          : result.answer.trim() === ''
            ? '模型没有返回任何内容。'
            : '模型没有返回可解析的结构，已保留原文。',
    }
  }
  return { ok: true, ...base, draft: parsed }
}

/**
 * The streamed variant: Server-Sent Events, one frame per delta.
 *
 * Frames: `meta` (model), `delta` (text), `done` (parsed draft) or `error`.
 * The response is committed before the model is called, so the browser can show
 * the draft card immediately instead of waiting for a round trip.
 */
async function streamEnhance({ res, body, ctx, config, logger, store }) {
  const raw = String(body?.text ?? '').trim()
  const send = (event, payload) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
  }
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  })
  // Commit the stream now: the browser needs the response open before the first
  // token exists, otherwise the card cannot appear until the model answers.
  if (typeof res.flushHeaders === 'function') res.flushHeaders()
  send('start', { at: Date.now() })
  if (raw === '') {
    send('error', { message: '没有要整理的内容。' })
    res.end()
    return
  }
  if (raw.length > 20_000) {
    send('error', { message: '内容太长，请先拆成几条再整理。' })
    res.end()
    return
  }

  const controller = new AbortController()
  // A closed tab must cancel the model call, not leave it billing.
  res.on('close', () => controller.abort())

  let result
  try {
    result = await streamStructuredNote({
      ctx,
      config,
      text: buildEnhanceMessage({ text: raw, instruction: body?.instruction, language: body?.language, scope: body?.scope }),
      system: enhanceSystemOf(config),
      signal: controller.signal,
      onDelta: async (delta) => {
        send('delta', { text: delta })
      },
    })
  } catch (error) {
    logger?.warn?.(`[notes] enhance stream failed: ${error?.message ?? error}`)
    send('error', { message: String(error?.message ?? error) })
    res.end()
    return
  }

  if (result.failure !== null) {
    send('error', { message: `模型调用失败：${result.failure.message}`, code: result.failure.code })
    res.end()
    return
  }
  await new EventLog(store).record('enhance', {
    chars: raw.length,
    elapsedMs: result.elapsedMs,
    firstTokenMs: result.firstTokenMs,
    ok: true,
    model: result.model,
    ...tokenFields(result),
  }).catch(() => {})
  const parsed = readEnhanceResult(result.answer)
  if (parsed === null) {
    send('error', {
      message: result.answer.trim() === '' ? '模型没有返回任何内容。' : '模型没有返回可解析的结构。',
      raw: result.answer.slice(0, 4000),
    })
    res.end()
    return
  }
  send('done', {
    draft: parsed,
    model: result.model,
    reasoningEffort: result.reasoningEffort,
    elapsedMs: result.elapsedMs,
    firstTokenMs: result.firstTokenMs,
  })
  res.end()
}


/** Whether the preset that gives the notebook assistant its persona is installed. */

/**
 * Copy the dashboard conversation into the database.
 *
 * The transcript already exists as session events; this makes it queryable next to
 * the notes, which is what lets the assistant answer "what did I ask you last
 * week". Reading a live session is cheap and idempotent (keyed by seq).
 */
async function ingestBoardTranscript(ctx, store, database) {
  const link = await store.linkOf('board')
  const sessionId = String(link?.sessionId ?? '')
  if (sessionId === '') return { inserted: 0 }
  const live = ctx?.get?.('sessions')?.get?.(sessionId)
  if (live === undefined) return { inserted: 0 }
  const events = typeof live.snapshotEvents === 'function' ? live.snapshotEvents() : (live.ownEvents?.() ?? [])
  const messages = []
  for (const event of events) {
    if (event?.type !== 'user/message' && event?.type !== 'assistant/message') continue
    const content = event?.data?.message?.content ?? []
    const text = blocksToText(content)
    if (text.trim() === '') continue
    messages.push({
      seq: Number(event.seq),
      at: new Date(Number(event.time) || Date.now()).toISOString(),
      role: event.type === 'user/message' ? 'user' : 'assistant',
      text,
    })
  }
  const inserted = await database.ingestMessages(sessionId, messages)

  // Token usage per finished assistant message. Keyed by the message sequence so
  // repeated polling records each turn exactly once.
  const turns = []
  for (const event of events) {
    if (event?.type !== 'assistant/message') continue
    const usage = event?.data?.usage
    if (usage === undefined) continue
    turns.push({
      seq: Number(event.seq),
      at: new Date(Number(event.time) || Date.now()).toISOString(),
      usage,
    })
  }
  if (turns.length > 0) {
    const log = new EventLog(store)
    const seen = new Set(await boardTurnSeqs(store))
    for (const turn of turns) {
      if (seen.has(turn.seq)) continue
      await log.record('board.turn', {
        model: 'notes-board',
        inputTokens: Number(turn.usage.inputTokens) || 0,
        outputTokens: Number(turn.usage.outputTokens) || 0,
        cacheReadTokens: Number(turn.usage.cacheReadTokens) || 0,
        cacheWriteTokens: Number(turn.usage.cacheWriteTokens) || 0,
        reasoningTokens: Number(turn.usage.reasoningTokens) || 0,
        detail: 'seq:' + turn.seq,
      })
    }
  }

  return inserted
}

/**
 * Flatten a model result into the event-log fields the dashboard reads.
 *
 * Every call records the same shape, so token totals are a single SUM over the log.
 */
function tokenFields(result) {
  const usage = result?.usage ?? {}
  const context = result?.context ?? {}
  return {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    cacheReadTokens: usage.cacheReadTokens ?? 0,
    cacheWriteTokens: usage.cacheWriteTokens ?? 0,
    reasoningTokens: usage.reasoningTokens ?? 0,
    contextMessages: context.messages ?? 0,
    contextChars: context.chars ?? 0,
  }
}

/** Which board-turn sequences were already recorded. */
async function boardTurnSeqs(store) {
  const events = await new EventLog(store).read()
  const seqs = []
  for (const event of events) {
    if (event.kind !== 'board.turn') continue
    const match = String(event.detail ?? '').match(/^seq:(\d+)$/)
    if (match !== null) seqs.push(Number(match[1]))
  }
  return seqs
}

function blocksToText(blocks) {
  return (Array.isArray(blocks) ? blocks : [])
    .filter((block) => block !== null && typeof block === 'object' && block.type === 'text')
    .map((block) => String(block.text ?? ''))
    .join('\n')
}

function badRequest(message) {
  return Object.assign(new Error(message), { code: 'BAD_REQUEST', status: 400 })
}

function numberOr(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

/** Decode path segments so unusual characters still route. */
function decodePath(raw) {
  return raw
    .split('/')
    .map((segment) => {
      try {
        return decodeURIComponent(segment)
      } catch {
        return segment
      }
    })
    .join('/')
}

async function readJsonBody(req, maxBytes = 4 * 1024 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBytes) throw Object.assign(new Error('请求体过大。'), { code: 'BAD_REQUEST', status: 413 })
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (text === '') return {}
  try {
    return JSON.parse(text)
  } catch {
    throw Object.assign(new Error('请求体不是合法 JSON。'), { code: 'BAD_REQUEST', status: 400 })
  }
}

function respondJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}
