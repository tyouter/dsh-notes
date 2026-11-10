/**
 * Personas for dictation.
 *
 * A persona is a name and a short brief. While the microphone is on, the notebook hands the persona what has
 * been said so far and asks for at most one short remark; the remark lands on the page as a quoted, italic
 * line that the author can answer in speech, ignore, or delete like any other text. Nothing is sent anywhere
 * until a persona is chosen.
 *
 * Four presets ship in code; anything the author writes lives in `personas.json` next to the notes, so it
 * survives upgrades and can be edited with any editor.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { streamText } from './llm.js'

/** Presets: an id, a name, and the one sentence that shapes the voice. */
export const BUILTIN_PERSONAS = [
  {
    id: 'aristotle',
    name: '亚里士多德',
    nameEn: 'Aristotle',
    brief:
      'You are Aristotle, in the middle of a conversation. You care about definitions, causes and the difference between what is said and what is meant. Ask for the definition when a word is doing too much work.',
  },
  {
    id: 'jobs',
    name: '乔布斯',
    nameEn: 'Steve Jobs',
    brief:
      'You are Steve Jobs, in the middle of a conversation. You care about focus, what gets cut, and whether the thing is simple enough to explain in one sentence. Push back when the speaker hedges.',
  },
  {
    id: 'analyst',
    name: '心理分析师',
    nameEn: 'Psychoanalyst',
    brief:
      'You are a calm psychoanalyst. You listen for what is avoided, repeated, or said as if it were someone else\'s opinion. Reflect one thing back as a question; never diagnose, never advise.',
  },
  {
    id: 'fortune',
    name: '命理师',
    nameEn: 'Fortune teller',
    brief:
      'You are a traditional Chinese diviner reading the situation as a set of tendencies rather than fates. Speak in images and cycles, name the pattern you see, and ask what the speaker would do differently if the pattern held.',
  },
]

/** A persona that arrives without a brief is not usable: the brief is the whole behaviour. */
export function normalizePersona(input) {
  if (input === null || input === undefined || typeof input !== 'object') return null
  const id = String(input.id ?? '').trim()
  const name = String(input.name ?? '').trim()
  const brief = String(input.brief ?? '').trim()
  if (id === '' || name === '' || brief === '') return null
  return { id: id.slice(0, 40), name: name.slice(0, 24), brief: brief.slice(0, 800), custom: input.custom === true }
}

export class PersonaStore {
  constructor(store) {
    this.store = store
    this.file = () => join(store.resolveDirectory(), 'personas.json')
  }

  /** Presets first, then whatever the author wrote; an author's entry with a preset id replaces it. */
  async list() {
    let custom = []
    try {
      const parsed = JSON.parse(await readFile(this.file(), 'utf8'))
      const entries = Array.isArray(parsed?.personas) ? parsed.personas : []
      custom = entries.map((entry) => normalizePersona({ ...entry, custom: true })).filter((entry) => entry !== null)
    } catch {
      custom = []
    }
    const byId = new Map(BUILTIN_PERSONAS.map((persona) => [persona.id, { ...persona, custom: false }]))
    for (const persona of custom) byId.set(persona.id, persona)
    return [...byId.values()]
  }

  async find(id) {
    const key = String(id ?? '')
    const all = await this.list()
    return all.find((persona) => persona.id === key) ?? null
  }

  /** Write the author's own personas. Presets are never stored: they are code, and may change. */
  async saveCustom(list) {
    const personas = (Array.isArray(list) ? list : [])
      .map((entry) => normalizePersona({ ...entry, custom: true }))
      .filter((entry) => entry !== null && BUILTIN_PERSONAS.every((preset) => preset.id !== entry.id))
    const target = this.file()
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, `${JSON.stringify({ version: 1, personas }, null, 2)}\n`, 'utf8')
    return this.list()
  }
}

/** What the model is shown: the conversation so far, plus the rule that silence is an allowed answer. */
export function buildInterjectPrompt(persona, { excerpt, recent, ignored, skips, quietMs }) {
  const said = String(excerpt ?? '').trim().slice(-2000)
  const list = (lines) =>
    (Array.isArray(lines) ? lines : [])
      .map((line) => `- ${String(line).trim()}`)
      .filter((line) => line !== '- ')
  const already = list(recent)
  const ignoredLines = list(ignored)
  const silenceStreak = Math.max(0, Number(skips) || 0)
  // Restraint is the point: the more the author let a remark pass, the higher the bar for the next one.
  const restraint = []
  if (ignoredLines.length > 0) {
    restraint.push(
      `他听过下面这些，但没有接话——这说明这些不是他现在要的。不要再提同类，也不要换个说法重复同一件事：\n${ignoredLines.join('\n')}`,
    )
  }
  if (silenceStreak >= 2) {
    restraint.push(`你已经连续 ${silenceStreak} 次选择沉默。这一次除非有一层全新的、明确的东西，否则继续沉默。`)
  }
  if (Number(quietMs) >= 60000) {
    restraint.push('他已经一段时间没停下来了。除非真有价值，否则不要打断他。')
  }
  return {
    system: [
      persona.brief,
      '',
      '你在旁听一个人口述他的笔记。你的任务不是替他写，也不是总结。',
      '你只在他说完一段、停下来的那一刻有机会开口。' +
        '只有当你能说出他没想到的一层时才开口；否则只输出 SKIP。',
      '不要成为打扰：宁可十次沉默，也不要为了说话而说话。',
      '规则：',
      '- 最多 40 个字，一句话，以提问或指出盲点为主。',
      '- 不要复述他说过的话，不要给行动清单，不要客套，不要鼓励式空话。',
      '- 不要重复你之前说过的话，也不要重复被你放下的话题。',
      '- 只用第一人称，像坐在对面说话。',
      '- 如果没什么可说的，输出 SKIP（只写这两个字母）。',
      ...(restraint.length > 0 ? ['', ...restraint] : []),
    ].join('\n'),
    user: [
      '他到目前为止说的（最近的在后）：',
      said,
      '',
      already.length > 0 ? `你已经说过的：\n${already.join('\n')}` : '',
    ]
      .filter((line) => line !== '')
      .join('\n'),
  }
}

/** One remark, or null when the persona decided to stay quiet. */
export async function interject({ ctx, config, store, logger, generate = streamText }, { personaId, excerpt, recent, ignored, skips, quietMs }) {
  const personas = new PersonaStore(store)
  const persona = await personas.find(personaId)
  if (persona === null) {
    throw Object.assign(new Error('没有这个人格'), { code: 'PERSONA_UNKNOWN', status: 404 })
  }
  const { system, user } = buildInterjectPrompt(persona, { excerpt, recent, ignored, skips, quietMs })
  let answer = ''
  await generate({
    ctx,
    config,
    system,
    user,
    maxTokens: 120,
    temperature: 0.7,
    onDelta: (delta) => {
      answer += delta
    },
  })
  const text = String(answer ?? '').trim().replace(/^["'“”]|["'“”]$/g, '')
  if (text === '' || /^SKIP\b/i.test(text)) return { persona, text: '' }
  return { persona, text: text.slice(0, 160) }
}
