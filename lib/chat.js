/**
 * The two direct model calls behind the capture page: one translation, and one
 * structured rewrite (which lives in lib/llm.js and is re-exported here).
 *
 * Neither is an agent session. Each needs an answer to one narrow request, so a
 * streamed call keeps first token at the provider's own latency; the dashboard,
 * which needs tools, uses a real session instead.
 */

import { streamText } from './llm.js'
import { EventLog } from './events.js'

/** Shared SSE plumbing: headers, a `send`, and an abort tied to the connection. */
function openStream(res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  })
  // Commit now: the browser needs the stream open before the first token exists.
  if (typeof res.flushHeaders === 'function') res.flushHeaders()
  const controller = new AbortController()
  // A closed tab must cancel the model call, not leave it running.
  res.on('close', () => controller.abort())
  return {
    send(event, payload) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
    },
    signal: controller.signal,
    end: () => res.end(),
  }
}

/**
 * Translate a block of text.
 *
 * This sends no wrapper: the model gets an instruction and the text,
 * so there is nothing in the prompt that could be echoed into the translation.
 *
 * Frames: `start`, `delta`…, then `done` (the full text) or `error`.
 */
export async function streamTranslate({ res, body, ctx, config, logger, store }) {
  const stream = openStream(res)
  const source = String(body?.text ?? '').trim()
  const target = String(body?.target ?? '').trim() || 'English'
  // Numbered-line mode: the caller sends `lines` and expects one translation per index.
  const lines = Array.isArray(body?.lines) ? body.lines.map((line) => String(line ?? '')) : null
  // A partial translation must keep the surrounding numbering; a whole-note one may adopt
  // the target language's conventions.
  const keepNumbering = body?.keepNumbering !== false

  stream.send('start', { target })
  if (source === '' && (lines === null || lines.length === 0)) {
    stream.send('error', { message: '没有要翻译的内容。' })
    stream.end()
    return
  }
  if (source.length > 20_000) {
    stream.send('error', { message: '内容太长，请先拆成几段再翻译。' })
    stream.end()
    return
  }

  if (lines !== null && lines.length > 0) {
    const system = [
      '你是专业译者，负责把一份已经排好版的笔记逐行翻译成' + target + '。',
      '输入每一行都以 <<n>> 开头，n 是行号。输出必须同样逐行，格式严格为 <<n>> 译文。',
      '规则：',
      '1. 行数必须与输入完全一致：不要合并两行、不要拆成两行、不要省略、不要补行。',
      '2. 空行保持 <<n>> 后面为空，不要输出任何解释、标题或代码块。',
      '3. 译文内部的换行请用空格代替，保证一行输入对应一行输出。',
      '4. 专有名词、产品名、代码、网址、数字保持原样。',
      '5. 列表标记（1. / (1) / a) / ① / -）原样保留在行首。',
    ].join('\n')
    const source = lines
      .map((line, index) => '<<' + (index + 1) + '>> ' + line.trim())
      .join('\n')

    stream.send('start', { target, lines: lines.length })
    let answer = ''
    let result
    try {
      result = await streamText({
        ctx,
        config,
        system,
        user: source,
        signal: stream.signal,
        maxTokens: Number(config?.enhanceMaxTokens) > 0 ? Number(config.enhanceMaxTokens) : 2000,
        temperature: 0.1,
        effortPreference: 'off',
        onDelta: async (delta) => {
          stream.send('delta', { text: delta })
        },
      })
      answer = result.answer
    } catch (error) {
      stream.send('error', { message: String(error?.message ?? error) })
      stream.end()
      return
    }

    // Parse "<<n>> text" into an index-aligned array; anything missing stays null.
    const translated = new Array(lines.length).fill(null)
    for (const raw of String(answer ?? '').split(/\r?\n/)) {
      const match = raw.match(/^\s*<<(\d+)>>\s*(.*)$/)
      if (match === null) continue
      const index = Number(match[1]) - 1
      if (index < 0 || index >= lines.length) continue
      const value = match[2].trim()
      if (value !== '') translated[index] = value
    }

    await new EventLog(store).record('translate', {
      chars: source.length,
      elapsedMs: result.elapsedMs,
      firstTokenMs: result.firstTokenMs,
      ok: result.ok,
      model: result.model,
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      cacheReadTokens: result.usage?.cacheReadTokens ?? 0,
    }).catch(() => {})

    stream.send('done', { lines: translated, model: result.model })
    stream.end()
    return
  }

  const system = [
    '你是专业译者，负责把一份已经排好版的笔记翻译成' + target + '。',
    '只输出译文本身：不要输出任何说明、标题、引号、代码块或“以下是译文”之类的话。',
    '',
    '这是一次「换语言的重排版」，译文必须与原文逐块对应：',
    '1. 段落数量、段落顺序、层级关系都不变：原文有几段就是几段，不要合并、不要拆分、不要省略、不要补写。',
    '2. 保留 Markdown 结构：标题、列表、引用、代码块、表格、分隔线、强调。列表仍是列表，引用仍是引用。',
    '3. 序号体系与原文保持一致：原文用 一、/（一）/1)/a)/①/• 的哪一种，译文就用哪一种，编号值不变。',
    '4. 原文每一条都要译到，一条不多一条不少；条目内的换行与缩进也保持一致。',
    '5. 专有名词、产品名、代码、网址、数字保持原样。',
    keepNumbering
      ? '6. 序号与标题记号按上面的规则原样保留，不要换成别的体系。'
      : '6. 如果原文的编号体系与' + target + '的书写习惯明显不符，可以换成本语言常用的体系，但必须保持层级：不同层级的条目用不同的记号或缩进区分，每一层各自从 1 开始连续递增（1,2,3 / (1),(2),(3) / a),b),c)），绝不把所有条目压成同一级的 1..N。',
  ].join('\n')

  let answer = ''
  let result
  try {
    result = await streamText({
      ctx,
      config,
      system,
      user: source,
      signal: stream.signal,
      maxTokens: Number(config?.enhanceMaxTokens) > 0 ? Number(config.enhanceMaxTokens) : 2000,
      temperature: 0.1,
      effortPreference: 'off',
      onDelta: async (delta) => {
        stream.send('delta', { text: delta })
      },
    })
    answer = result.answer
  } catch (error) {
    stream.send('error', { message: String(error?.message ?? error) })
    stream.end()
    return
  }

  const cleaned = answer
    // Strip a code fence around the whole answer, and the quote markers the prompt no longer
    // sends but a model may still add out of habit.
    .replace(/^\s*```[a-zA-Z]*\s*\n/, '')
    .replace(/\n?\s*```\s*$/, '')
    .replace(/^\s*"""\s*/, '')
    .replace(/\s*"""\s*$/, '')
    .trim()

  await new EventLog(store).record('translate', {
    chars: source.length,
    elapsedMs: result.elapsedMs,
    firstTokenMs: result.firstTokenMs,
    ok: result.ok,
    model: result.model,
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
    cacheReadTokens: result.usage?.cacheReadTokens ?? 0,
    contextMessages: result.context?.messages ?? 0,
    contextChars: result.context?.chars ?? 0,
  }).catch(() => {})

  stream.send('done', { text: cleaned, model: result.model })
  stream.end()
}

