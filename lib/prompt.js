/**
 * The two prompts that make the notebook smart.
 *
 * Both are written once and used by two callers each:
 *   - ENHANCE_PROMPT      /notes/api/enhance (the input box's 「结构化」 button)
 *   - NOTEBOOK_PROMPT     the notebook assistant created in the 「AI 处理」 tab
 * so a note is "structured" the same way whether the model was reached through
 * a chat turn or straight from the button.
 *
 * The structuring answer is prose Markdown (first line = title), because it is streamed to the page
 * and read while it arrives; a fenced json answer is still accepted so an older `enhanceSystem`
 * override keeps working. The assistant's EDIT_SHAPE stays JSON on purpose: those are proposals the
 * panel parses, never text the author reads.
 */

/** The edit schema; ids must come from the snapshot, never be invented. */
const EDIT_SHAPE = `{ "edits": [
  { "noteId": "n-...", "action": "replace", "body": "整理后的全文", "tags": ["可选的新标签"], "reason": "为什么这样改" },
  { "noteId": "n-...", "action": "append",  "body": "追加到笔记末尾的段落", "reason": "为什么加" },
  { "noteId": "n-...", "action": "retag",   "tags": ["最终标签列表"], "reason": "为什么这样归类" },
  { "noteId": "n-...", "action": "pin" },
  { "noteId": "n-...", "action": "trash",   "reason": "为什么删" }
] }`

/**
 * The prose pass: raw thought in, structured note out.
 *
 * Deliberate rules: never invent facts; keep the author's voice; a sentence
 * that is only a title is still a note.
 */
export const ENHANCE_PROMPT = [
  '你是一位排版编辑，负责把一条随手记整理成一份可以直接读的笔记。',
  '整理 = 重排版：让结构清楚、层级正确、行文好读；不是重写内容，也不是替作者总结。',
  '',
  '【输出格式】',
  '· 直接输出笔记正文的 Markdown，不要代码块、不要 JSON、不要任何解释或前后缀。',
  '· 第一行就是标题（不要写 # 号）。标题是整篇的主题概括，不是正文某一句的复制。',
  '· 如果原文第一行只是随口一句（情绪、称呼、时间前缀、打招呼），它不构成标题：另起一句概括整篇作为标题，原文那句话放进正文。',
  '· 正文里不要再复述或换个说法重复一遍标题；标题只出现一次。',
  '· 最后单独一行以「标签：」开头，给 2-4 个短标签，逗号分隔。',
  '',
  '【内容不变】',
  '1. 不添加原文没有的事实、数字、人名、日期、结论；拿不准的地方标「待确认」或保留原话，绝不猜测补全。',
  '2. 原文每一句都要有着落：并入合理的条目，或保留为独立段落。一条都不能少，也不要为了整齐而合并两句不相干的话。',
  '3. 保留作者自己的说法、语气、术语和缩写；只有明显的错别字、口误、重复粘贴才改写。',
  '3b. 假设作者是随手写的：真实输入通常只有空格、序号（1. 1、 (1) 一、）、短线（- — ·）和冒号小标题，很少用 Markdown 语法。不要把「没有用 [x]、**、##」当成缺陷，也不要要求作者按某种语法书写。',
  '3c. 识别这些低投入写法的意图：一行一个要点、冒号后面是解释、时间/人名/金额是要素、箭头表示流程或因果；需要待办清单时由你从这类散句里整理出来（谁 / 做什么 / 什么时候），而不是等作者写勾选框。',
  '',
  '【读懂作者的排版意图】',
  '4. 先判断原文有没有结构：',
  '   · 已经用 Markdown 或编号组织过的，视为作者已经排好版：只补齐缺失的层级与空白，不重排、不改写、不替换编号体系。',
  '   · 只有散句、短语、口头记录的，由你补出结构：按主题分节、每节一个意思、要点成条。',
  '5. 原文已有的 Markdown（标题、列表、引用、代码块、分隔线、强调）必须保留，不要删掉、压平或合并。',
  '6. 编号与标题记号按原文的体系延续：一、/（一）/1./1)/a)/①/• 哪一种就继续用哪一种；',
  '   原文混乱时选最接近的一种统一，并保证同层级连续递增。不同层级用不同记号或缩进区分，绝不把所有条目压成同一级的 1..N。',
  '7. 行是作者写的：一句话一行就保持一行；不要为了凑段落把它们连成一整段。需要长段落的地方才合并。',
  '',
  '【成品标准】',
  '8. 层级清晰：分节用标题，要点用列表，动作/负责人/时间这类要素各自成条，读者扫一眼就知道先看什么。',
  '9. 间距一致：标题与正文之间留空行，列表项之间不插空行，分节之间留一个空行。',
  '10. 不写总结段、不写「以上」「综上所述」，不评价作者，不加 emoji，不加多余的粗体。',
  '11. 排版必须能在 Markdown 里原样渲染：不要输出表格、HTML、脚注等原文没有的语法。',
].join('\n')

/** Ask the model for one structured rewrite of a single snippet. */
export function buildEnhanceMessage({ text, instruction, language, scope }) {
  const extra = String(instruction ?? '').trim()
  const target = String(language ?? '').trim()
  return [
    ENHANCE_PROMPT,
    '',
    target === '' ? '' : `输出的目标语言：${target}（标题、正文、标签都用它写；专有名词和代码保持原样）`,
    scope === 'selection'
      ? '这是一段选区（不是整篇笔记）：只整理它本身，不要新增原文没有的条目，不要补标题，条目数量和层级与原文保持一致。'
      : '',
    extra === '' ? '' : `用户的额外要求：${extra}`,
    '',
    '原始内容：',
    '"""',
    String(text ?? '').trim(),
    '"""',
  ]
    .filter((line) => line !== undefined)
    .join('\n')
}

/**
 * Turn a streamed Markdown answer into the note shape the client expects.
 *
 * The first non-empty line is the title (heading marks stripped); a trailing
 * 「标签：a, b」 line becomes the tags and is removed from the body. Nothing else is
 * interpreted, so whatever the model writes reaches the note as-is.
 */
export function parseStructuredMarkdown(raw) {
  const lines = String(raw ?? '').replace(/\r\n/g, '\n').split('\n')
  let tags = []
  const body = []
  for (const line of lines) {
    const match = line.match(/^\s*(?:标签|Tags?)[:：]\s*(.+)$/i)
    if (match !== null && line.indexOf('|') === -1) {
      tags = match[1]
        .split(/[,，、]/)
        .map((tag) => tag.trim().replace(/^#/, ''))
        .filter((tag) => tag !== '')
      continue
    }
    body.push(line)
  }
  // Strip a surrounding code fence: models sometimes wrap the answer anyway.
  let cleaned = body.join('\n').trim()
  const fenced = cleaned.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/)
  if (fenced !== null) cleaned = fenced[1].trim()

  const rows = cleaned.split('\n')
  let title = ''
  let index = -1
  for (let i = 0; i < rows.length; i += 1) {
    const value = rows[i].trim()
    if (value === '' || /^(?:[-*_]\s*){3,}$/.test(value)) continue
    index = i
    title = value.replace(/^#{1,6}\s+/, '').trim()
    break
  }
  if (index < 0) return { title: '', body: '', tags }
  const rest = rows
    .slice(index + 1)
    .join('\n')
    .trim()
  return { title, body: rest === '' ? rows[index] : rows[index] + '\n' + rows.slice(index + 1).join('\n'), tags }
}

/** Render a note compactly for the assistant's context. */
function renderNote(note) {
  const flags = [note.pinned ? '置顶' : '', note.tags.length > 0 ? note.tags.map((tag) => `#${tag}`).join(' ') : '']
    .filter(Boolean)
    .join(' ')
  return [`### ${note.id}`, note.title || '（无标题）', flags, '```', note.body, '```'].filter(Boolean).join('\n')
}

/**
 * The notebook assistant's persona.
 *
 * It is a companion that *reads and proposes*; the panel applies changes only
 * after the user clicks save, so the prompt treats every edit as a draft.
 */
export const NOTEBOOK_PROMPT = [
  '你是用户的「记事本」助手。你的工作是帮用户整理、归类、检索和重写他自己的笔记，而不是替他写新的随笔。',
  '',
  '你可以使用的工具：',
  '- `notes`：读取与修改记事本。常用 `list` / `search` / `get` 先看，必要时用 `update` 改标签或置顶；`delete` 会把笔记放进回收站（可恢复）。',
  '- 当用户要你整理或重写多条笔记时，**优先输出下面的编辑草案**，不要直接批量改：面板会把草案呈现给用户，由他自己勾选应用。',
  '',
  '工作方式：',
  '1. 先看再改：回答「有没有相关笔记」之前先 `search`；讨论某条笔记之前先 `get` 它。',
  '2. 改动要小、可解释：能改标签就不改正文；改正文时保留用户的原话。',
  '3. 删除只通过回收站，并且只在用户明确要求时。',
  '4. 用中文回答，先给结论再给依据。',
  '',
  '当你想让用户一键应用改动时，在回答末尾附上一个 json 代码块：',
  EDIT_SHAPE,
  'noteId 必须来自下面上下文里的真实 id，不要编造。每轮最多 8 条。',
].join('\n')

/** The per-turn context: what the user is looking at, and what is in the notebook. */
export function buildNotebookContext({ selectedId, notes, query, tag, total }) {
  const focus = String(selectedId ?? '')
  const current = notes.find((note) => note.id === focus)
  const filters = [query ? `搜索「${query}」` : '', tag ? `标签 #${tag}` : ''].filter(Boolean).join(' · ')
  return [
    '## 记事本现状',
    `共 ${total} 条笔记${notes.length < total ? `（下列 ${notes.length} 条，按最近更新）` : ''}${filters === '' ? '' : `；当前视图：${filters}`}。`,
    current === undefined ? '' : `用户当前打开的是 \`${current.id}\`。`,
    '',
    notes.length === 0 ? '（记事本为空）' : notes.map(renderNote).join('\n\n'),
  ]
    .filter((line) => line !== '')
    .join('\n')
}

/**
 * Parse the first fenced json object in an answer.
 *
 * Models wrap it in ```json fences or angle brackets often enough that a plain
 * JSON.parse is not enough; this keeps the parser tolerant and returns null
 * instead of throwing so a chat answer is never lost to a bad block.
 */
export function parseStructured(answer) {
  const text = String(answer ?? '')
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((match) => match[1])
  const candidates = fenced.length > 0 ? fenced : [text]
  for (const candidate of candidates) {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start === -1 || end <= start) continue
    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1))
      if (parsed !== null && typeof parsed === 'object') return parsed
    } catch {
      /* try the next block */
    }
  }
  return null
}

/** What the enhance button needs from a parsed answer, or null. */
/**
 * Remove a body line that merely repeats the title.
 *
 * Returns `{ title, body }`: the title is dropped when it is only a section heading that is kept in
 * the body, so the finished note never opens with the same sentence twice.
 */
export function dedupeTitle(title, body) {
  const value = String(title ?? '').trim()
  const lines = String(body ?? '').split(/\r?\n/)
  if (value === '') return { title: '', body: lines.join('\n') }
  const same = (line) => line.replace(/^\s{0,3}#{1,6}\s+/, '').replace(/^\s*[-*+]\s+/, '').trim() === value

  const firstIndex = lines.findIndex((line) => line.trim() !== '')
  const headings = lines.filter((line) => /^\s{0,3}#{1,6}\s+/.test(line))
  if (firstIndex >= 0 && same(lines[firstIndex])) {
    const first = lines[firstIndex]
    if (/^\s{0,3}#{1,6}\s+/.test(first)) {
      // One heading and it opens the note: it is the title, so it leaves the body.
      if (headings.length === 1) {
        lines.splice(firstIndex, 1)
        if (lines[firstIndex] !== undefined && lines[firstIndex].trim() === '') lines.splice(firstIndex, 1)
        return { title: value, body: lines.join('\n').trim() }
      }
      // Several sections: the headings are the document's structure, not a title.
      return { title: '', body: lines.join('\n').trim() }
    }
    lines.splice(firstIndex, 1)
    // Drop the blank line that separated the removed title from the body.
    if (lines[firstIndex] !== undefined && lines[firstIndex].trim() === '') lines.splice(firstIndex, 1)
    return { title: value, body: lines.join('\n').trim() }
  }
  // The "title" is a section heading that belongs in the body: keep it there, report no title.
  if (lines.some((line) => /^\s{0,3}#{1,6}\s+/.test(line) && same(line))) {
    return { title: '', body: lines.join('\n').trim() }
  }
  return { title: value, body: lines.join('\n').trim() }
}

/**
 * Whether an answer is a JSON object rather than prose.
 *
 * The prompt asks for Markdown, but two things still produce JSON: an `enhanceSystem` override
 * written for the old schema, and a model that decides the safest reply is a data structure. Such
 * an answer must never be painted into the page as if it were a note, so the test is deliberately
 * blunt: a leading brace (or a json fence) plus one of the note fields.
 */
export function looksLikeJsonAnswer(answer) {
  const text = String(answer ?? '').trim()
  if (!text.startsWith('{') && !/^```(?:json)?/i.test(text)) return false
  const head = text.replace(/^```[a-zA-Z]*\s*/, '')
  return head.startsWith('{') && /"(?:title|body|tags|notes)"\s*:/.test(head)
}

/** Undo the escaping of a JSON string body when the object itself would not parse. */
function unescapeJsonString(raw) {
  try {
    const parsed = JSON.parse(`"${raw}"`)
    if (typeof parsed === 'string') return parsed
  } catch {
    /* fall through to the manual pass */
  }
  return raw
    .replace(/\\r\\n|\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}

/** Read one string field out of an answer that is JSON-shaped but not valid JSON. */
function fieldOf(text, name) {
  const match = text.match(new RegExp(`"${name}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`))
  return match === null ? '' : unescapeJsonString(match[1])
}

/**
 * Last-resort rescue of a JSON-shaped answer: the draft is recovered field by field.
 *
 * Used only when `JSON.parse` failed (a trailing comma, a truncated tail, an unquoted newline), so a
 * model that answered in the old schema still contributes a note instead of a wall of braces.
 */
export function salvageJsonDraft(answer) {
  const text = String(answer ?? '')
  const body = fieldOf(text, 'body')
  if (body.trim() === '') return null
  const tagsField = text.match(/"tags"\s*:\s*\[([^\]]*)\]/)
  const tags =
    tagsField === null
      ? []
      : [...tagsField[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((match) => unescapeJsonString(match[1])).map((tag) => tag.trim()).filter((tag) => tag !== '')
  const notesField = text.match(/"notes"\s*:\s*\[([^\]]*)\]/)
  const notes =
    notesField === null
      ? []
      : [...notesField[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((match) => unescapeJsonString(match[1])).map((note) => note.trim()).filter((note) => note !== '')
  return { title: fieldOf(text, 'title'), body, tags, notes }
}

export function readEnhanceResult(answer) {
  // Two shapes are accepted, in this order: a JSON object (the old contract, and whatever a custom
  // system prompt asks for) and prose Markdown (the current contract).
  const asJson = parseStructured(answer) ?? (looksLikeJsonAnswer(answer) ? salvageJsonDraft(answer) : null)
  if (asJson !== null) {
    // Valid JSON wins, including when it is unusable: an empty body is a rejection, not a
    // reason to reinterpret the JSON text as prose.
    const body = typeof asJson.body === 'string' ? asJson.body.trim() : ''
    if (body === '') return null
    const deduped = dedupeTitle(typeof asJson.title === 'string' ? asJson.title : '', body)
    return {
      title: deduped.title.slice(0, 120),
      body: deduped.body,
      tags: Array.isArray(asJson.tags) ? asJson.tags.filter((tag) => typeof tag === 'string') : [],
      notes: Array.isArray(asJson.notes) ? asJson.notes.filter((entry) => typeof entry === 'string') : [],
    }
  }
  // JSON-shaped but unreadable: report a failure instead of painting braces into the note.
  if (looksLikeJsonAnswer(answer)) return null
  // The streaming prompt answers with Markdown instead of JSON: same result shape, no
  // escaping, and readable while it arrives. Only accept it when it actually carries
  // structure — otherwise a plain sentence would count as a rewritten note.
  const markdown = parseStructuredMarkdown(answer)
  const body = String(markdown.body ?? '').trim()
  if (body === '') return null
  const lines = body.split(/\r?\n/).filter((line) => line.trim() !== '')
  const hasMarkers =
    /^\s{0,3}#{1,6}\s+\S/m.test(body) ||
    /^\s*[-*+]\s+\S/m.test(body) ||
    /^\s*\d+[.)]\s+\S/m.test(body) ||
    /^\s*>\s?\S/m.test(body)
  if (!hasMarkers && markdown.tags.length === 0 && lines.length < 2) return null
  const deduped = dedupeTitle(String(markdown.title ?? ''), body)
  return {
    title: deduped.title.slice(0, 120),
    body: deduped.body,
    tags: Array.isArray(markdown.tags) ? markdown.tags : [],
    notes: [],
  }
}

/**
 * What the notebook assistant proposes, validated against the ids that actually
 * exist: an edit for an unknown note is dropped rather than applied to a guess.
 */
export function readEditDraft(answer, existingIds) {
  const parsed = parseStructured(answer)
  if (parsed === null || !Array.isArray(parsed.edits)) return []
  const known = new Set(existingIds)
  const actions = new Set(['replace', 'append', 'retag', 'pin', 'trash'])
  const edits = []
  for (const raw of parsed.edits.slice(0, 8)) {
    if (raw === null || typeof raw !== 'object') continue
    const noteId = String(raw.noteId ?? '')
    const action = String(raw.action ?? '')
    if (!known.has(noteId) || !actions.has(action)) continue
    const edit = { noteId, action }
    if (typeof raw.body === 'string' && raw.body.trim() !== '') edit.body = raw.body
    if (Array.isArray(raw.tags)) edit.tags = raw.tags.filter((tag) => typeof tag === 'string')
    if (typeof raw.reason === 'string' && raw.reason.trim() !== '') edit.reason = raw.reason.trim().slice(0, 200)
    if ((action === 'replace' || action === 'append') && typeof edit.body !== 'string') continue
    if (action === 'retag' && !Array.isArray(edit.tags)) continue
    edits.push(edit)
  }
  return edits
}

