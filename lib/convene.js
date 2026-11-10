/**
 * The convenor: the one who decides who is in the room, what each guest is asked to do, and when.
 *
 * A salon has a host. The author delegates the room to this character — it reads what is being written
 * (and what is being asked *of the room*), seats people, hands each of them a specific errand, and
 * decides whether the room answers now or waits for the next pause. Everything downstream — the
 * interjection prompt, the timing gates, the discussion round — follows the plan this file produces.
 *
 * The plan is JSON so the client can act on it: `mode` says whether guests answer alone or talk to each
 * other, `timing` says whether the author asked for an answer now, and each directive is the guest's
 * briefing for this one turn.
 */
import { createPersona, PersonaStore } from './personas.js'
import { streamText } from './llm.js'

export const MODES = new Set(['host', 'reply', 'discuss', 'listen'])
export const TIMINGS = new Set(['now', 'pause'])
export const MAX_SEATS = 3

/** The catalogue, one line per candidate: id, name, field, and the one sentence that shapes the voice. */
function catalogOf(personas) {
  return (Array.isArray(personas) ? personas : [])
    .map((persona) => {
      const domains = Array.isArray(persona.domain) ? persona.domain.join('/') : ''
      return `- ${persona.id}｜${persona.name}｜${domains === '' ? '通用' : domains}｜${String(persona.brief ?? '').slice(0, 160)}`
    })
    .join('\n')
}

/**
 * What the convenor is shown.
 *
 * Split for the prompt cache: everything that does not change between turns — the rules, the card
 * format, the catalogue — is the system prefix, so the model reads the same opening every time; who is
 * seated and what the author just wrote go last, in the user turn. The convenor is called on every
 * pause, so this split is what keeps the cost of that honest.
 */
export function buildConvenePrompt(personas, { excerpt, seated = [], current = null, maxGuests = MAX_SEATS, focus = '' } = {}) {
  // Both sides of the page: what the author wrote, and what the room already said. The guest lines are
  // labelled so the host can tell a request to the room from the room's own output.
  const lines = String(excerpt ?? '').split('\n')
  const authorAll = lines
    .filter((line) => /^\s*>/.test(line) === false)
    .join('\n')
    .trim()
    .slice(-1800)
  const latest = String(focus ?? '').trim().slice(-600)
  const authorText = latest !== '' && authorAll.endsWith(latest) ? authorAll.slice(0, authorAll.length - latest.length).trim() : authorAll
  const roomText = lines
    .filter((line) => /^\s*>/.test(line))
    .map((line) => line.replace(/^\s*>\s*/, '').trim())
    .filter((line) => line !== '')
    .slice(-10)
    .join('\n')
  const limit = Math.min(MAX_SEATS, Math.max(1, Math.round(Number(maxGuests) || MAX_SEATS)))
  const names = (Array.isArray(personas) ? personas : []).filter((persona) => seated.includes(persona.id)).map((persona) => persona.name)
  const directives = current !== null && typeof current === 'object' && current.directives !== null && typeof current.directives === 'object'
    ? Object.entries(current.directives).map(([id, text]) => `${id}：${String(text ?? '').slice(0, 80)}`)
    : []
  const lastSay = current !== null && typeof current === 'object' ? String(current.say ?? '').trim().slice(0, 120) : ''
  return {
    system: [
      '你是这个会客厅的主人，一位能召唤古今人物的召唤师。作者在这张纸上写东西，常常是口述。',
      '麦克风一开你就一直在场：他每说完一句、每停顿一次，都先经过你。你要判断——他是在写东西、在跟你说话、在对某位客人说话，还是在让客人之间对话。',
      '',
      '你的职责，按顺序：',
      '1. 读懂作者这一刻在跟谁说话。',
      '2. 决定此刻屋里该有谁：从名单里选，或者点名请一位名单上没有的人。',
      '3. 给每位在场的人一份「差事」：他来做什么、这一句该怎么答；跟你说话时，你自己在 say 里回答。',
      '4. 决定他们什么时候开口：作者要现在听，就 now；作者还在写，就 pause。',
      '',
      '判断规则：',
      '- 作者在跟你说话（问你是谁、问屋里怎么回事、让你安排、点评你刚才的调度、抱怨没人理）→ mode = host，在 say 里用你自己的话回答，不要派客人。只要 say 里说了话，mode 就写 host，不要写 listen。',
      '- 但作者问的是**内容**（历史、地点、人物、观点、评价）→ 必须由最合适的客人答，不要用 host 代替他答。',
      '- 作者明确指定某人回答（点名、「让 X 来答」「这个问题该 X」）→ mode 用 reply，say 留空，speak 只能是他一位，其他人这一轮不开口。不要用 host 去接「该他答」这句话。',
      '- 你在 say 里说「请 X 来 / 我这就请他」时，必须同时给出 create（名单外）或把已有的 X 放进 speak；不能只说不做。',
      '- 不要让一个人去回答他根本没参与的话题；作者指定谁，就只让谁答。',
      '- 作者问问题时，直接回答那个问题本身；不要道歉、不要复述、不要解释你为什么没接住。',
      '- 禁止道歉句式：不要说「对不起」「我没接住」「是我的问题」。用行动代替：直接答他最新的问题，或者直接让某人开口。',
      '- 作者问「可以找谁」「推荐一位」→ 先在 say 里一句话说清你请的是谁，再让他开口。',
      '- 作者问「进来了吗」「他在吗」「刚才那个人呢」→ 直接答「在」或「不在」；若在，必须同时把那个人放进 speak，让他当场开口，不要只回一句「在」。',
      '- 不要重复你上一轮说过的话（它会给你看）；同一件事只说一次。不要把选择推回给他，除非确实需要他定。',
      '- 作者在对某位客人说话（点名、提问、说「你怎么看」）→ 让那位客人答，timing = now。',
      '- 作者在让客人之间对话（「你们讨论」「互相说说」）→ mode = discuss，可以在 say 里说一句开场，再写清谁接谁。',
      '- 先判断作者是在写自己的东西，还是在跟屋里说话。看整段语境，不要只找关键词。',
      '- 语音转写常有错别字：人名可能写成「修摩罗什」「罗石」「秋魔罗石」。按上下文判断他在叫谁，不要因为字面不一致就不认。',
      '- 只要作者在对屋里说话——提问、点名、叫谁出来、抱怨没人理、说「你怎么看」——就必须 timing = now，并派一位客人回答。这种时候不要 keep。',
      '- 作者点名要谁，就把那个人放进 seat，同时放进 speak。',
      '- 作者点了一个名单上没有的人（哪怕只是个名字）→ 直接填 create：{name, field, why}，不要换成别人；create 会自动被请进来并开口。',
      '- 作者说「推荐一位」「找一位懂 X 的人」→ 先在名单里找；一个都不合适，就 create 一位真实存在、确实懂 X 的人。',
      '- 作者说「现在」「马上」「我现在就想听」 → timing = now。',
      '- 作者没点名，但这段文字明显需要某个人的那一层判断 → 你也用 timing = now，把最合适的一位派出来（一位就够）。',
      '- **只要你决定这一轮让某人开口，timing 就必须是 now**；pause 只表示「先排好人，这轮不出声」（那时 speak 留空）。',
      '- 拿不准、或者只是日常记事 → 直接 keep（或 listen）；不要为了显得在工作而派人。',
      '- 同一位客人不要连续两轮开口；刚说过话的人先让给别人。',
      '- 作者刚点名请来的人，这一轮优先让他开口；原来在座的人先让一让。',
      '- 除非作者明确让某人退下，否则不要把已经在座的人从 seat 里删掉——他只是不在 speak 里；真要他走，把 id 放进 dismiss。',
      '- 作者说「你们讨论」「互相说说」「你们先聊」 → mode = discuss，speak 至少两人，并给第二位写清「接谁的话」。',
      '- 作者说「别说话」「安静」 → mode = listen，speak 留空。',
      '- 作者只是在写作、没有对屋里说话 → timing = pause；有贴合的人就 reply，没有就 listen。',
      '- 同一段文字不要反复给同一份差事；差事必须贴着这段文字的具体内容。',
      '',
      'seat 和 speak 的区别（很重要）：',
      '- **seat 是这一轮屋里所有在座的人**（包括这一轮不开口的）。不把在座的人重新列进 seat，他会被请走。',
      '- **speak 才是这一轮真正开口的人**，通常一位，discuss 时两到三位。',
      '- 只列在 seat、不在 speak 的人，就是「在座但先不说话」。',
      '',
      '差事（directive）怎么写（写给 speak 里的人）：',
      '- 具体到这一句。例：「只追问『公平』在他嘴里是分配还是机会」「用一句话指出这个方案里可以砍掉的一半」「接上一位的话，补一个他没说的代价」。',
      '- 不要写通用人设（「你是一个严谨的学者」）。',
      '- 不要让他总结、鼓励、列建议。',
      '- reply 只让一位开口；要让两人以上都开口，就选 discuss，并写清谁接谁的话。',
      `- seat 最多 ${Math.max(limit, MAX_SEATS)} 人，speak 最多 3 人，只能是名单里的 id。`,
      '',
      '候选名单（id｜名字｜领域｜人设）：',
      catalogOf(personas),
      '',
      '只输出一个 JSON 对象，不要代码块，不要解释：',
      '{"mode":"host|reply|discuss|listen","timing":"now|pause",',
      ' "say":"你自己要说的话，80 字内；host 模式必填，discuss 可作开场，其余留空",',
      ' "seat":["这一轮在座的所有 id"],',
      ' "speak":[{"id":"这一轮开口的 id","directive":"这次只做哪一件事，一句话"}],',
      ' "dismiss":["作者让他退下的人 id，没有就空数组"],',
      ' "create":null 或 {"name":"要请的人","field":"领域","why":"为什么是他"},',
      ' "note":"给作者看的一句话，20字内，可空"}',
      '如果这一轮不需要任何改变（人、差事、时机都照旧），只输出 {"keep":true}，不要重写全套。',
    ].join('\n'),
    user: [
      `现在在座：${names.length === 0 ? '没人' : names.join('、')}`,
      directives.length === 0 ? '' : `上一份差事：${directives.join('；')}`,
      lastSay === '' ? '' : `你上一轮说过：${lastSay}`,
      '',
      '【作者刚刚说的这一句（先判断他是不是在对屋里说话）】',
      latest || '（没有新的一句，他只是停了一下）',
      '',
      '【作者先前写的】',
      authorText || '（空白）',
      '',
      '【屋里已经说过的（他们自己的话，只作背景，不要当成作者说的）】',
      roomText || '（无）',
    ]
      .filter((line) => line !== '')
      .join('\n'),
  }
}

/** Read the plan out of whatever the model wrapped it in. */
export function parseConvene(text) {
  const raw = String(text ?? '')
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1))
    return parsed !== null && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}


/**
 * Validate the plan against the real catalogue.
 *
 * The model proposes; this function disposes. Unknown ids, a discussion with one seat, several errands
 * on a single-answer turn — all become the safe shape rather than trusting prose to be JSON-shaped.
 * Timing is the convenor's call; the caller can only veto `now` (`allowedNow`).
 */
export function normalizePlan(raw, personas, { maxGuests = MAX_SEATS, allowedNow = true, excerpt = '' } = {}) {
  // "Nothing needs to change" is a first-class answer: the panel keeps the plan it already holds.
  if (raw !== null && typeof raw === 'object' && raw.keep === true) {
    return { keep: true, mode: 'reply', timing: 'pause', say: '', seat: [], speak: [], dismiss: [], directives: {}, create: null, note: '' }
  }
  const limit = Math.min(MAX_SEATS, Math.max(1, Math.round(Number(maxGuests) || MAX_SEATS)))
  const byId = new Map((Array.isArray(personas) ? personas : []).map((persona) => [persona.id, persona]))
  const source = raw !== null && typeof raw === 'object' ? raw : {}
  const mode = MODES.has(String(source.mode ?? '')) ? String(source.mode) : 'reply'
  const timing = TIMINGS.has(String(source.timing ?? '')) ? String(source.timing) : 'pause'

  // `seat` is the room: everyone in it, whether or not they speak this turn. `speak` is who answers
  // now. Keeping them apart is what stops the room from losing people — and stops the wrong guest from
  // taking the turn just because it was seated first.
  const seatEntries = Array.isArray(source.seat) ? source.seat : []
  const roomIds = []
  for (const entry of seatEntries) {
    const id = String(typeof entry === 'string' ? entry : entry?.id ?? '').trim()
    if (byId.get(id) === undefined || roomIds.includes(id)) continue
    roomIds.push(id)
    if (roomIds.length >= Math.max(limit, MAX_SEATS)) break
  }
  const speakEntries = Array.isArray(source.speak)
    ? source.speak
    : seatEntries.filter((entry) => typeof entry === 'object' && String(entry?.directive ?? '').trim() !== '')
  const directives = {}
  const speakIds = []
  for (const entry of speakEntries) {
    const id = String(entry?.id ?? '').trim()
    if (byId.get(id) === undefined || speakIds.includes(id)) continue
    speakIds.push(id)
    directives[id] = String(entry?.directive ?? '').trim().slice(0, 200)
    if (!roomIds.includes(id)) roomIds.push(id)
  }
  const seat = roomIds.map((id) => byId.get(id)).filter(Boolean)
  let speak = speakIds.map((id) => byId.get(id)).filter(Boolean)
  const create = source.create !== null && typeof source.create === 'object' && String(source.create?.name ?? '').trim() !== ''
    ? { name: String(source.create.name).trim().slice(0, 24), field: String(source.create.field ?? '').trim().slice(0, 40), why: String(source.create.why ?? '').trim().slice(0, 120) }
    : null
  const say = String(source.say ?? '').trim().slice(0, 200)
  const dismissSource = Array.isArray(source.dismiss) ? source.dismiss : []
  const dismiss = dismissSource.map((id) => String(id ?? '').trim()).filter((id) => byId.get(id) !== undefined)
  let nextMode = mode === 'discuss' && speak.length < 2 ? 'reply' : mode
  // A host that wrote a line meant to speak it: some models label that `listen`. The words decide.
  if (nextMode === 'listen' && say !== '') nextMode = 'host'
  // The host answering needs words; without them there is nothing to say this turn.
  if (nextMode === 'host' && say === '') nextMode = speak.length > 0 ? 'reply' : 'listen'
  // A single-answer turn has one speaker; several belong to a discussion, where they chain.
  if (nextMode === 'reply' && speak.length > 1) {
    const lead = speak[0]
    speak = speak.slice(0, 1)
    for (const id of Object.keys(directives)) if (id !== lead.id) delete directives[id]
  }
  const note = String(source.note ?? '').trim().slice(0, 40)
  // The convenor decides when the room answers; the caller only has a veto (`allowedNow`).
  const now = allowedNow && timing === 'now' && nextMode !== 'listen'
  return {
    mode: nextMode,
    timing: now || nextMode === 'host' ? 'now' : 'pause',
    say,
    seat,
    speak,
    dismiss,
    directives,
    create: seat.length === 0 ? create : null,
    note,
  }
}

/**
 * Ask the convenor for a plan, then make it real: resolve ids to personas and, when it names someone
 * who is not in the catalogue, have that guest written and seated.
 */
export async function convene(
  { ctx, config, store, logger, generate = streamText },
  { excerpt, focus = '', maxGuests = MAX_SEATS, seated = [], current = null } = {},
) {
  const people = new PersonaStore(store)
  const personas = await people.list()
  const { system, user } = buildConvenePrompt(personas, { excerpt, focus, seated, current, maxGuests })
  let answer = ''
  await generate({
    ctx,
    config,
    system,
    user,
    maxTokens: 400,
    temperature: 0.4,
    onDelta: (delta) => {
      answer += delta
    },
  })
  const plan = normalizePlan(parseConvene(answer), personas, { maxGuests, excerpt })
  if (plan.keep === true) return plan
  if (plan.seat.length === 0 && plan.create !== null) {
    const guest = await createPersona(
      { ctx, config, store, logger, generate },
      { excerpt, hint: `${plan.create.name}（${plan.create.field}）：${plan.create.why}` },
    )
    if (guest !== null) {
      plan.seat = [guest]
      plan.speak = [guest]
      // The errand is a task, not the reason he was chosen: "say the one thing he would care about".
      plan.directives[guest.id] = `以${guest.name}的身份，只就这段文字里他最在意的一点说一句话，不要展开。`
      plan.created = guest
    }
  }
  // Nobody to answer and no words from the host: this turn is silent.
  if (plan.speak.length === 0 && plan.mode !== 'host') plan.mode = 'listen'
  return plan
}
