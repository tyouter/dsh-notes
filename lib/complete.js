/**
 * Completion: the next thing the author was about to type.
 *
 * Two very different jobs, one endpoint:
 *
 *  1. repetition — the document already says "产品上线会议" twice, so finishing it is a guess worth
 *     making. The client answers this itself (`repetitionSuggestion`), with no request at all.
 *  2. continuation — the author stopped mid-thought. That needs the model, because only a model can
 *     read the section and follow the argument.
 *
 * The hard rule for (2) is the same as everywhere else in this plugin: no new facts. A completion
 * that invents a date or a name is worse than no completion, because the note stops being true.
 */
import { streamText } from './llm.js'
import { EventLog } from './events.js'

const MAX_CONTEXT = 1200
const MAX_OUTPUT_TOKENS = 320

/** The section the caret is in: the last heading above it, if any. */
function sectionOf(text, caret) {
  const before = String(text ?? '').slice(0, Math.max(0, caret))
  const lines = before.split(/\r?\n/)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const heading = lines[index].match(/^#{1,4}\s+(.+)$/)
    if (heading !== null) return heading[1].trim()
  }
  return ''
}

/** The tail of the note before the caret, trimmed to a sane size. */
function tailOf(text, caret) {
  const before = String(text ?? '').slice(0, Math.max(0, caret))
  if (before.length <= MAX_CONTEXT) return before
  const cut = before.slice(before.length - MAX_CONTEXT)
  const newline = cut.indexOf('\n')
  return newline < 0 ? cut : cut.slice(newline + 1)
}

export function buildCompleteMessage({ text, caret, section, target }) {
  const tail = tailOf(text, caret)
  const title = String(text ?? '').split(/\r?\n/).find((line) => line.trim() !== '')?.trim() ?? ''
  const language = target === undefined || target === '' ? '与原文相同的语言' : target
  return [
    '你要补全一篇笔记，补的是作者接下来本想写的那一句或几句。',
    '',
    `语言：${language}。`,
    title === '' ? '' : `笔记标题：${title}`,
    section === '' ? '' : `当前小节：${section}`,
    '',
    '已经写到的部分（末尾就是光标处）：',
    '```',
    tail,
    '```',
    '',
    '规则：',
    '1. 只输出要接在后面的正文，不要解释、不要引号、不要代码块、不要 Markdown 标记（列表符号除外）。',
    '2. 只写 1 句；只有在思路明显没写完时，最多 3 句。总长度不超过 120 字。',
    '3. 不要引入原文没有的专有信息：人名、日期、金额、数字、链接，除非上面的原文里已经出现。',
    '4. 顺着作者的语气和说法往下写，不要拔高、不要总结、不要加“总之”“因此”“值得注意的是”这类话。',
    '5. 如果接下去确实无话可说，输出一个空字符串，不要硬凑。',
  ]
    .filter((line) => line !== '')
    .join('\n')
}

const COMPLETE_SYSTEM = [
  '你是一个写作补全器，只做“接着写”这一件事。',
  '你的输出会被直接插进作者的笔记里，所以：宁可短，不可猜；宁可空，不可编。',
  '不解释、不寒暄、不回答问题、不评论文风。',
].join('\n')

/** One completion. Returns { text, chunks } or { text: '' } when there is nothing worth adding. */
export async function complete({ ctx, config, logger, store, body }) {
  const text = String(body?.text ?? '')
  const caret = Number.isFinite(Number(body?.caret)) ? Number(body.caret) : text.length
  const section = String(body?.section ?? '') || sectionOf(text, caret)
  if (text.trim() === '') throw Object.assign(new Error('没有可补全的内容。'), { code: 'BAD_REQUEST', status: 400 })

  const result = await streamText({
    ctx,
    config,
    system: COMPLETE_SYSTEM,
    user: buildCompleteMessage({ text, caret, section, target: body?.target }),
    maxTokens: MAX_OUTPUT_TOKENS,
    temperature: 0.3,
  })

  const answer = String(result.answer ?? '')
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim()

  await new EventLog(store).record('complete', {
    chars: answer.length,
    elapsedMs: result.elapsedMs,
    firstTokenMs: result.firstTokenMs,
    ok: result.ok,
    model: result.model,
  })

  if (answer === '' || result.ok !== true) return { ok: result.ok === true, text: '', model: result.model }
  return { ok: true, text: answer, model: result.model }
}
