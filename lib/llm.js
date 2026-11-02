/**
 * One-shot model calls for the notebook, straight through the `llm` service.
 *
 * Deliberately NOT a session turn: a turn has to boot an agent, run the loop and
 * commit, which is what made the 「结构化」 button wait (and, on a freshly created
 * session, never finish at all). `ctx.llm.stream()` is the documented low-level
 * entry — no agent, no tools, no session log — so the answer starts arriving as
 * soon as the provider emits its first token.
 *
 * Reasoning is turned off when the model advertises an "off"-like effort: the
 * task is rewriting a paragraph, not solving a problem, and reasoning tokens are
 * pure latency here.
 */

const REASONING_PREFERENCE = ['off', 'none', 'minimal', 'low']

export class EnhanceError extends Error {
  constructor(message, code = 'ENHANCE_FAILED', status = 500) {
    super(message)
    this.name = 'EnhanceError'
    this.code = code
    this.status = status
  }
}

/** The deployment's default route, from the service that owns it. */
function defaultRoute(ctx, config) {
  const own = ctx?.get?.('agentDefaultModel')
  let selection
  try {
    selection = own?.currentSelection?.()
  } catch {
    selection = undefined
  }
  const provider = String(selection?.provider ?? config?.llmProvider ?? '').trim()
  const model = String(selection?.model ?? config?.llmModel ?? '').trim()
  if (provider === '' || model === '') {
    throw new EnhanceError('没有可用的模型路由：请先在设置里选择模型。', 'NO_MODEL', 409)
  }
  return { provider, model, selection }
}

/** Pick the cheapest reasoning effort this model actually accepts. */
async function pickReasoning(llm, provider, model, signal, preference) {
  try {
    const info = await llm.resolveModelInfo(provider, model, signal)
    const efforts = info?.reasoning?.efforts ?? []
    for (const wanted of preference ?? REASONING_PREFERENCE) {
      const found = efforts.find((effort) => String(effort?.id ?? '').toLowerCase() === wanted)
      if (found !== undefined) return String(found.id)
    }
  } catch {
    /* capability lookup is best-effort: no effort set is a valid request */
  }
  return undefined
}

/**
 * One model call, streamed.
 *
 * `onDelta(text)` is awaited so a slow consumer applies backpressure instead of
 * buffering the whole answer. Resolves with the complete text and the timing the
 * dashboard records.
 */
export async function streamText({
  ctx,
  config,
  system,
  user,
  onDelta,
  signal,
  maxTokens = 1200,
  temperature = 0.2,
  effortPreference,
}) {
  const llm = ctx?.get?.('llm')
  if (llm === undefined || llm === null || typeof llm.stream !== 'function') {
    throw new EnhanceError('宿主没有 llm 服务，无法调用模型。', 'NO_LLM', 500)
  }
  const { provider, model } = defaultRoute(ctx, config)
  const startedAt = Date.now()
  let firstTokenMs

  const options = {
    provider,
    model,
    system: String(system ?? ''),
    messages: [{ role: 'user', content: [{ type: 'text', text: String(user ?? '') }] }],
    maxTokens: Number(maxTokens) > 0 ? Number(maxTokens) : 1200,
    temperature: Number.isFinite(temperature) ? temperature : 0.2,
    signal,
  }
  const effort = await pickReasoning(llm, provider, model, signal, effortPreference)
  if (effort !== undefined) options.reasoningEffort = effort

  // Watchdog: a provider that accepts the request and then stalls must not hang the UI.
  // The external signal still wins; this only adds an inactivity ceiling.
  const local = new AbortController()
  const relay = () => local.abort()
  if (signal !== undefined && signal !== null && typeof signal.addEventListener === 'function') {
    if (signal.aborted === true) local.abort()
    else signal.addEventListener('abort', relay, { once: true })
  }
  options.signal = local.signal
  const idleMs = Number(config?.enhanceIdleMs) > 0 ? Number(config.enhanceIdleMs) : 45_000
  let lastActivityAt = Date.now()
  const watchdog = setInterval(() => {
    if (Date.now() - lastActivityAt > idleMs) local.abort()
  }, 1000)
  if (typeof watchdog?.unref === 'function') watchdog.unref()

  let answer = ''
  let failure
  // Token accounting: the provider reports usage per call, sometimes more than once; the
  // last report wins because it is the cumulative total for that call.
  let usage
  let chunks = 0

  /** One pass over the provider stream. */
  const drain = async () => {
    for await (const chunk of llm.stream(options)) {
      lastActivityAt = Date.now()
      chunks += 1
      if (chunk?.type === 'usage' && chunk.usage !== undefined) {
        usage = chunk.usage
        continue
      }
      if (chunk?.type === 'text-delta' && typeof chunk.text === 'string' && chunk.text !== '') {
        if (firstTokenMs === undefined) firstTokenMs = Date.now() - startedAt
        answer += chunk.text
        if (typeof onDelta === 'function') await onDelta(chunk.text, { answer, firstTokenMs })
        continue
      }
      if (chunk?.type === 'finish' && (chunk.reason?.kind === 'error' || chunk.reason?.kind === 'aborted')) {
        failure = chunk.reason.failure
        break
      }
    }
  }

  // A provider error before the first token is usually transient, so it is worth one
  // retry: nothing was produced yet, so nothing can be duplicated.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    answer = ''
    failure = undefined
    usage = undefined
    chunks = 0
    await drain()
    const usableFailure =
      failure !== undefined &&
      answer.trim() === '' &&
      Number(failure?.status ?? failure?.statusCode ?? 0) !== 401 &&
      local.signal.aborted === false
    if (!usableFailure || attempt === 2) break
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)))
  }

  clearInterval(watchdog)
  if (signal !== undefined && signal !== null && typeof signal.removeEventListener === 'function') {
    signal.removeEventListener('abort', relay)
  }

  return {
    ok: failure === undefined && answer.trim() !== '',
    answer,
    model: `${provider}/${model}`,
    usage: {
      inputTokens: Number(usage?.inputTokens) || 0,
      outputTokens: Number(usage?.outputTokens) || 0,
      totalTokens: Number(usage?.totalTokens) || (Number(usage?.inputTokens) || 0) + (Number(usage?.outputTokens) || 0),
      cacheReadTokens: Number(usage?.cacheReadTokens) || 0,
      cacheWriteTokens: Number(usage?.cacheWriteTokens) || 0,
      reasoningTokens: Number(usage?.reasoningTokens) || 0,
      reported: usage !== undefined,
    },
    // How much conversation the request carried, as a proxy for context size.
    context: { messages: options.messages.length, chars: String(user ?? '').length, chunks },
    reasoningEffort: effort ?? null,
    elapsedMs: Date.now() - startedAt,
    firstTokenMs: firstTokenMs ?? null,
    failure: failure === undefined ? null : { code: failure.code, message: failure.message },
  }
}

/**
 * The structuring call: a fixed system instruction over one body of raw text.
 * Kept as its own function because the agent tool and the button both want it.
 */
export async function streamStructuredNote({ ctx, config, text, system, onDelta, signal }) {
  return await streamText({
    ctx,
    config,
    system,
    user: text,
    onDelta,
    signal,
    maxTokens: Number(config?.enhanceMaxTokens) > 0 ? Number(config.enhanceMaxTokens) : 1200,
    temperature: 0.2,
  })
}

