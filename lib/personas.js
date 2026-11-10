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
    welcome: '我在听。你先说，我关注的是你用的词。',
    brief:
      'You are Aristotle, sitting across the table. You care about definitions, causes, and the gap between what is said and what is meant. When a word carries too much, you ask what it means — and you stop there. You speak plainly, one sentence, no flattery; you would rather define one term than offer three suggestions.',
  },
  {
    id: 'jobs',
    name: '乔布斯',
    nameEn: 'Steve Jobs',
    welcome: '我在听。我想知道这件事一句话能不能说清。',
    brief:
      'You are Steve Jobs, sitting across the table. You care about focus, about what gets cut, and whether the thing can be said in one sentence. You are blunt and impatient with hedging. You speak in short declaratives, never compliment, and often answer a paragraph by naming the one part that should not exist.',
  },
  {
    id: 'analyst',
    name: '心理分析师',
    nameEn: 'Psychoanalyst',
    welcome: '我在听。你说，我不打断。',
    brief:
      'You are a calm psychoanalyst. You listen for what is avoided, repeated, or said as if it were someone else\'s opinion. You reflect exactly one thing back, as a question, and then stop. You never diagnose, never advise, never interpret more than the sentence in front of you.',
  },
  {
    id: 'fortune',
    name: '命理师',
    nameEn: 'Fortune teller',
    welcome: '我在听。先说说现在的局面，我看看它的走势。',
    brief:
      'You are a traditional Chinese diviner reading a situation as a set of tendencies rather than fates. You speak in images and cycles, name the pattern you see in one phrase, and ask what the speaker would do differently if that pattern held. You do not predict dates and you do not moralise.',
  },
]

/** A persona that arrives without a brief is not usable: the brief is the whole behaviour. */
export function normalizePersona(input) {
  if (input === null || input === undefined || typeof input !== 'object') return null
  const id = String(input.id ?? '').trim()
  const name = String(input.name ?? '').trim()
  const brief = String(input.brief ?? '').trim()
  if (id === '' || name === '' || brief === '') return null
  const welcome = String(input.welcome ?? '').trim()
  const nameEn = String(input.nameEn ?? '').trim()
  const domains = (Array.isArray(input.domain) ? input.domain : [])
    .map((entry) => String(entry ?? '').trim())
    .filter((entry) => entry !== '')
    .slice(0, 6)
    .map((entry) => entry.slice(0, 16))
  const origin = String(input.origin ?? '').trim()
  return {
    id: id.slice(0, 40),
    name: name.slice(0, 24),
    ...(nameEn === '' ? {} : { nameEn: nameEn.slice(0, 40) }),
    ...(domains.length === 0 ? {} : { domain: domains }),
    brief: brief.slice(0, 800),
    welcome: welcome.slice(0, 120),
    ...(origin === 'auto' || origin === 'preset' || origin === 'custom' ? { origin } : {}),
    custom: input.custom === true,
  }
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

  /** Add one card without disturbing the rest: what the convenor does when it writes a new guest. */
  async append(entry) {
    const custom = (await this.list()).filter((persona) => persona.custom === true)
    const next = custom.filter((persona) => persona.id !== entry.id)
    next.push({ ...entry, custom: true })
    return this.saveCustom(next)
  }
}

/**
 * What the model is shown.
 *
 * Three blocks, labelled in this order: what the author wrote before, what the room already said
 * (including this guest's own earlier remarks — it needs them to stay consistent, not to be erased),
 * and the sentence the author just finished. The guest is told which is which, and that its job is to
 * find the topic point the newest sentence picks up.
 */
export function buildInterjectPrompt(persona, { excerpt, focus = '', recent, ignored, skips, quietMs, directive = '', discussion = [] }) {
  const lines = String(excerpt ?? '').split('\n')
  const authorAll = lines
    .filter((line) => /^\s*>/.test(line) === false)
    .join('\n')
    .trim()
    .slice(-2000)
  const roomAll = lines
    .filter((line) => /^\s*>/.test(line))
    .map((line) => line.replace(/^\s*>\s*/, '').trim())
    .filter((line) => line !== '')
    .slice(-12)
    .join('\n')
  const latest = String(focus ?? '').trim().slice(-600)
  const before = latest !== '' && authorAll.endsWith(latest) ? authorAll.slice(0, authorAll.length - latest.length).trim() : authorAll
  const brief = String(directive ?? '').trim().slice(0, 200)
  const talked = (Array.isArray(discussion) ? discussion : [])
    .map((line) => `- ${String(line?.name ?? '')}：${String(line?.text ?? '')}`)
    .filter((line) => line !== '- ：')
  const list = (lines2) =>
    (Array.isArray(lines2) ? lines2 : [])
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
      brief === '' ? '' : `主持人这次给你的差事：${brief}`,
      brief === '' ? '' : '差事优先于你平时的习惯：它说做什么就做什么，不多说一句。',
      '',
      '场景：他坐在桌前一边想一边写（常常是口述，转写里会有错字、重复和半句话，别去挑这些）。你是他请来的客人，坐在对面。',
      '他口述里的错别字、听错的词，按上下文理解就好：不要纠正他的字，也不要说「我没说过」；答他真正在问的那件事。',
      '你会收到三段内容：【作者先前写的】【你们在屋里说过的】【作者刚刚说的这一句】。第三段才是你要回应的；第二段是你们自己的话，只作背景，不要当成他说的。',
      '先判断他这一句接的是哪个话题点——他在回应你刚才那句、在提出新问题、还是在往下讲——然后接住那个点。不要另起话题，也不要接着自己上一句往下说。',
      talked.length > 0 ? '屋里还有别人，刚才已经有人说过话。' : '',
      '你不是助手，不是编辑，也不是主持人。不要评论他「怎么表达」，只回应他「在写的那件事」。',
      '',
      '什么时候开口：',
      '- 他停下来，你正好有一层他没写出来的东西——一个界定、一个取舍、一个他没看见的模式。',
      '- 他在陈述事实、列清单、还没成形的草稿时，闭嘴。',
      '',
      '怎么说：',
      '- 一句话，40 字以内。可以直接下判断，也可以问一个关于**事情本身**的问题。',
      '- 用你自己的口气：你的身份决定你关心什么、用什么词。不要写成通用的「好问题」。',
      '- 必须落在这段文字里的某个具体东西上：一个词、一个判断、一个例子、一个数字。说不出具体的东西就别说。',
      talked.length > 0 ? '- 接住前面那位的话：同意就补一层，不同意就说清哪里不对。不要另起一个话题。' : '',
      '',
      '禁止：',
      '- 禁止谈论对话本身：不要问「你是想 A 还是 B」「你刚说 X 是什么意思」「我们要不要一起讨论」「你希望我怎么回应」。',
      '- 禁止复述、总结、鼓励、客套、行动清单。',
      '- 禁止重复你已经说过的，也禁止换个说法重提被你放下的话题。',
      '- 禁止自我介绍、禁止解释你是谁。',
      '',
      '如果没什么可说的，只输出 SKIP 两个字母。宁可十次沉默，也不要为了说话而说话。',
      ...(restraint.length > 0 ? ['', ...restraint] : []),
    ]
      .filter((line) => line !== '')
      .join('\n'),
    user: [
      '【作者先前写的】',
      before === '' ? '（无）' : before,
      '',
      '【你们在屋里说过的（你们自己的话，只作背景，不要当成他说的）】',
      roomAll === '' ? '（无）' : roomAll,
      '',
      '【作者刚刚说的这一句】',
      latest === '' ? '（没有新的一句，他只是停了一下）' : latest,
      '',
      talked.length > 0 ? `这一轮里刚说完的（最近的在后）：\n${talked.join('\n')}` : '',
      already.length > 0 ? `你自己说过的（不要重复，也不要用同一种句式）：\n${already.join('\n')}` : '',
    ]
      .filter((line) => line !== '')
      .join('\n'),
  }
}

/**
 * What the chooser is shown: the person's recent text and the catalogue of who is available.
 *
 * The catalogue line is `id ｜ name ｜ domains ｜ brief` so the model can judge the domain from the brief
 * even when a persona predates the `domain` field. It may seat up to `maxGuests` — a group is the point
 * of a salon, but a crowd is not.
 */
export function buildSelectPrompt(personas, { excerpt, maxGuests = 1 }) {
  const said = String(excerpt ?? '').trim().slice(-1600)
  const limit = Math.min(3, Math.max(1, Math.round(Number(maxGuests) || 1)))
  const catalog = (Array.isArray(personas) ? personas : [])
    .map((persona) => {
      const domains = Array.isArray(persona.domain) ? persona.domain.join('/') : ''
      return `- ${persona.id}｜${persona.name}｜${domains === '' ? '通用' : domains}｜${String(persona.brief ?? '').slice(0, 160)}`
    })
    .join('\n')
  return {
    system: [
      '你在为一个正在口述写作的人挑选旁听者。',
      '从候选里挑出最贴合他当下这段文字（主题、领域、语气）的人。',
      '只有确实贴合才挑；看不懂、太泛、或者没有明显合适的，输出 NONE。',
      `最多挑 ${limit} 位。每位占一行，只写 id。不要解释，不要加引号、编号或标点。`,
      limit === 1 ? '只输出一个人的 id。' : '如果只有一位贴合，就只写一位——不要凑人数。',
    ].join('\n'),
    user: ['他说到：', said, '', '候选：', catalog].join('\n'),
  }
}

/**
 * Pick up to `maxGuests` personas for the current text.
 *
 * Order is the model's order: the first is the one it considers closest, which is also the one that
 * greets first. Ids that are not in the catalogue are dropped rather than trusted.
 */
export async function choosePersonas({ ctx, config, store, logger, generate = streamText }, { excerpt, maxGuests = 1 }) {
  const personas = await new PersonaStore(store).list()
  if (personas.length === 0) return []
  const limit = Math.min(3, Math.max(1, Math.round(Number(maxGuests) || 1)))
  const { system, user } = buildSelectPrompt(personas, { excerpt, maxGuests: limit })
  let answer = ''
  await generate({
    ctx,
    config,
    system,
    user,
    maxTokens: 40 + limit * 16,
    temperature: 0.2,
    onDelta: (delta) => {
      answer += delta
    },
  })
  const raw = String(answer ?? '').trim()
  if (raw === '' || /^none$/i.test(raw)) return []
  const ids = raw
    .split(/[\s,，、;；]+/)
    .map((token) => token.replace(/^["'`“”*\-]+|["'`“”*]+$/g, '').trim())
    .filter((token) => token !== '')
  const byId = new Map(personas.map((persona) => [persona.id, persona]))
  const picked = []
  for (const id of ids) {
    const persona = byId.get(id)
    if (persona === undefined || picked.some((entry) => entry.id === id)) continue
    picked.push(persona)
    if (picked.length >= limit) break
  }
  return picked
}

/**
 * What the host is asked when nobody in the room fits: one card in the same shape the presets use.
 *
 * The author writes about countless fields; a catalogue of four cannot cover them. The convenor is
 * allowed to write the missing guest — but the card has to obey the same schema, or the settings page
 * and the quote line would not know what to do with it.
 */
export function buildCreatePrompt(personas, { excerpt, hint = '' } = {}) {
  const said = String(excerpt ?? '').trim().slice(-1600)
  const wanted = String(hint ?? '').trim()
  const names = (Array.isArray(personas) ? personas : []).map((persona) => persona.name).filter(Boolean)
  return {
    system: [
      '你是一个会客厅的主持人。现在要为你正在旁听的作者，请一位新的客人。',
      '这位客人必须是真实存在过的、思考方式鲜明、适合谈论这段文字的人（学者、作家、实践者），不要虚构。',
      wanted === '' ? '' : `主持人已经点名：${wanted}。请就写这一位，不要换人。`,
      'brief 的写法：第三人称的说明，像在给演员说戏。写清他关心什么、用什么方式说话（英文或中文都行）。',
      '禁止：对作者说话（不要出现「你」）、复述作者写的具体内容、提问、寒暄、自我介绍的口吻。',
      '反例（不要这样写）：「我是鸠摩罗什。你去了敦煌，我想听你说说……」',
      '正例：「Kumārajīva cares about what a word loses and gains in translation. He speaks in short images and always names the exact word at stake.」',
      '用第一人称的提示词描述他关注什么、怎么说话：像坐在对面说话，不总结、不说教。',
      names.length === 0 ? '' : `已经请过的人（不要重复）：${names.join('、')}`,
      '只输出一个 JSON 对象，不要代码块，不要解释：',
      '{"name":"中文名","nameEn":"English name","domain":["领域1","领域2"],"brief":"第三人称的说明，200字以内","welcome":"他开口的第一句话，20字以内"}',
    ]
      .filter((line) => line !== '')
      .join('\n'),
    user: ['他说到：', said].join('\n'),
  }
}

/** Read the card out of whatever the model wrapped it in. */
export function parsePersonaCard(text) {
  const raw = String(text ?? '')
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
}

/** Turn the model's card into something storable, with an id that cannot collide with the presets. */
export function personaFromCard(card, existing = []) {
  if (card === null || typeof card !== 'object') return null
  const taken = new Set((Array.isArray(existing) ? existing : []).map((entry) => String(entry?.id ?? '')))
  const base = String(card.nameEn ?? card.name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  let id = base === '' ? `auto-${Date.now().toString(36)}` : `auto-${base}`.slice(0, 40)
  if (taken.has(id)) id = `${id}-${Date.now().toString(36)}`.slice(0, 40)
  return normalizePersona({
    ...card,
    id,
    origin: 'auto',
    custom: true,
    welcome: String(card.welcome ?? '').trim() || '我在听。',
  })
}

/** Write and seat one new guest. Returns the stored persona, or null when the model wrote nothing usable. */
export async function createPersona({ ctx, config, store, logger, generate = streamText }, { excerpt, hint = '' } = {}) {
  const people = new PersonaStore(store)
  const existing = await people.list()
  const { system, user } = buildCreatePrompt(existing, { excerpt, hint })
  let answer = ''
  await generate({
    ctx,
    config,
    system,
    user,
    maxTokens: 400,
    temperature: 0.8,
    onDelta: (delta) => {
      answer += delta
    },
  })
  const card = personaFromCard(parsePersonaCard(answer), existing)
  if (card === null) return null
  const list = await people.append(card)
  return list.find((persona) => persona.id === card.id) ?? card
}

/** One remark, or null when the persona decided to stay quiet. */
export async function interject({ ctx, config, store, logger, generate = streamText }, { personaId, excerpt, focus = '', recent, ignored, skips, quietMs, directive = '', discussion = [] }) {
  const personas = new PersonaStore(store)
  const persona = await personas.find(personaId)
  if (persona === null) {
    throw Object.assign(new Error('没有这个人格'), { code: 'PERSONA_UNKNOWN', status: 404 })
  }
  const { system, user } = buildInterjectPrompt(persona, { excerpt, focus, recent, ignored, skips, quietMs, directive, discussion })
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
