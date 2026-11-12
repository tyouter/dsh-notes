/**
 * The `notes` tool the model can call.
 *
 * Every action is a thin adapter over one `NoteStore` method, so a note the
 * user types in the panel and a note the assistant writes are the same object.
 * When the plugin has an assistant session, `notes_enhance` narrows the tool to
 * the notebook conversation only.
 */

import { NotesDatabase } from './db.js'
import { ChartStore, EventLog } from './events.js'
import { ENHANCE_PROMPT, readEnhanceResult } from './prompt.js'
import { safeColor, topTerms } from './text.js'

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  description: '记事本操作的结果；具体字段随 action 变化。',
}

const DESCRIPTION = [
  '读写用户本地记事本（DSH 里的「记事本」面板）。用户说"记一下 / 帮我记 / 记到记事本 / 赛博记事本"，或用它问"我之前记过什么"时用这个工具。',
  '',
  '动作：',
  '- add：新建一条笔记。body 是正文（多行用 \\n；第一行自动成为标题），tags 可选。用户临时想记点东西时，**不要再问**，直接把他说的话整理成正文记下来，然后回一句确认。',
  '- append：把内容追加到已有笔记末尾（id 必填）。适合"在刚才那条后面补一句"。',
  '- list：列出笔记（可按 tag 过滤；query 做全文搜索；include_trash 查看回收站）。',
  '- get：读一条笔记的全文（id 必填）。',
  '- search：全文搜索，返回命中的片段。',
  '- update：改标题/标签/置顶（id 必填）；用 tags + replace_tags=true 覆盖标签。',
  '- delete：把笔记移到回收站（可恢复）。',
  '- restore：从回收站恢复。',
  '- tags：列出所有标签及数量。',
  '',
  '注意：笔记是用户的私人记录，只在他明确要求时才写入或删除；不要因为"顺便"而修改。',
].join('\n')

/** The same shape the panel's 「结构化」 button asks for. */
const ENHANCE_TOOL = {
  name: 'notes_enhance',
  description: [
    '把一段随手记的原始内容整理成结构化笔记（标题 + 正文 + 标签）。',
    '当用户说「把这段整理一下 / 结构化 / 帮我整理成笔记」时调用它，比直接用 `notes add` 更好：它会按固定格式返回，面板可以预览和编辑后再保存。',
    '编辑页的「结构化」按钮走的是同一套提示词。',
  ].join('\n'),
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '要整理的原始内容（原样传入，不要预先改写）。' },
      instruction: { type: 'string', description: '用户的额外要求，例如"分成待办和工作记录两部分"。' },
    },
    required: ['text'],
  },
}

function text(title, lines) {
  return [{ type: 'text', text: `${title}\n\n${lines.filter((line) => line !== undefined && line !== null).join('\n')}` }]
}

/** A short excerpt around the first match, for search results and list previews. */
function excerpt(body, query, width = 90) {
  const flat = String(body ?? '').replace(/\s+/g, ' ').trim()
  const needle = String(query ?? '').replace(/\s+/g, '')
  if (needle === '' || flat === '') return flat.slice(0, width)
  const index = flat.toLowerCase().replace(/\s+/g, '').indexOf(needle.toLowerCase())
  if (index === -1) return flat.slice(0, width)
  const start = Math.max(0, index - Math.floor(width / 3))
  return `${start > 0 ? '…' : ''}${flat.slice(start, start + width)}${start + width < flat.length ? '…' : ''}`
}

function when(note) {
  const iso = note.updatedAt ?? note.createdAt ?? ''
  return iso === '' ? '' : iso.replace('T', ' ').replace(/\..*$/, '')
}

/** An in-conversation rewrite: shows the result as a draft the user can keep or discard. */
async function enhanceInConversation(args) {
  const parsed = readEnhanceResult(String(args.text ?? ''))
  if (parsed !== null) {
    return {
      value: { ok: true, draft: parsed },
      content: text('structured note', [parsed.body, '', parsed.tags.map((tag) => `#${tag}`).join(' ')]),
    }
  }
  // The caller is a model: the answer is already structured in this result, so
  // hand back the rules so it can produce the block itself.
  return {
    value: {
      ok: false,
      format: 'Return a ```json block with { "title", "body", "tags", "notes" }.',
      prompt: ENHANCE_PROMPT,
    },
    content: text('notes_enhance · guidance', [ENHANCE_PROMPT]),
  }
}

async function run(store, args) {
  const action = String(args.action ?? 'list')
  const limit = Number.isFinite(Number(args.limit)) && Number(args.limit) > 0 ? Number(args.limit) : 30

  if (action === 'add') {
    const { note, created } = await store.save({ body: args.body, tags: args.tags, source: 'agent' })
    return {
      value: { status: created ? 'created' : 'updated', note, path: store.location().display },
      content: text('notes · add', [
        `已记下：**${note.title || '无标题'}**（${note.id}）`,
        note.tags.length > 0 ? `标签：${note.tags.map((tag) => `#${tag}`).join(' ')}` : '',
        '',
        '> ' + note.body.split(/\r?\n/).slice(0, 6).join('\n> '),
        '',
        `保存位置：${store.location().display}/notes.json（用户在左侧「记事本」面板里能直接看到）`,
      ]),
    }
  }

  if (action === 'append') {
    const reference = String(args.id ?? '')
    const { note } = await store.get(reference)
    const addition = String(args.body ?? '')
    if (addition.trim() === '') throw new Error('action=append 需要 body。')
    const merged = `${note.body.replace(/\s+$/, '')}\n\n${addition}`
    const { note: saved } = await store.save({ id: reference, body: merged, tags: args.tags, source: 'agent' })
    return {
      value: { status: 'appended', note: saved },
      content: text('notes · append', [`已追加到 **${saved.title || '无标题'}**（${saved.id}）`, '', `> ${addition.split(/\r?\n/).slice(0, 4).join('\n> ')}`]),
    }
  }

  if (action === 'list') {
    const { notes, total } = await store.list({ query: args.query, tag: args.tag, includeTrash: args.include_trash === true, limit })
    if (notes.length === 0) {
      return { value: { notes: [], total: 0 }, content: text('notes · list', ['记事本里没有匹配的笔记。']) }
    }
    const lines = [`共 ${total} 条${notes.length < total ? `（显示前 ${notes.length} 条）` : ''}：`]
    for (const note of notes) {
      const flags = [note.pinned ? '📌' : '', note.deletedAt !== undefined ? '（回收站）' : ''].filter(Boolean).join(' ')
      lines.push(`- \`${note.id}\`　**${note.title || '无标题'}** ${flags}`)
      lines.push(`  　${when(note)}${note.tags.length > 0 ? '　' + note.tags.map((tag) => `#${tag}`).join(' ') : ''}`)
      lines.push(`  　${excerpt(note.body, args.query)}`)
    }
    return { value: { notes, total }, content: text('notes · list', lines) }
  }

  if (action === 'search') {
    const query = String(args.query ?? '')
    if (query.trim() === '') throw new Error('action=search 需要 query。')
    const { notes, total } = await store.list({ query, limit })
    if (notes.length === 0) {
      return { value: { notes: [], total: 0 }, content: text('notes · search', [`没有找到包含「${query}」的笔记。`]) }
    }
    const lines = [`含「${query}」的笔记 ${total} 条：`]
    for (const note of notes) {
      lines.push(`- \`${note.id}\`　**${note.title || '无标题'}**（${when(note)}）${note.tags.map((tag) => `#${tag}`).join(' ')}`)
      lines.push(`  　${excerpt(note.body, query, 140)}`)
    }
    lines.push('', '要看某条的全文，用 action=get 带上 id。')
    return { value: { notes, total }, content: text('notes · search', lines) }
  }

  if (action === 'get') {
    const { note, trashed } = await store.get(String(args.id ?? ''))
    return {
      value: { note, trashed },
      content: text('notes · get', [
        `**${note.title || '无标题'}**（\`${note.id}\`${trashed ? '，在回收站' : ''}）`,
        `更新时间 ${when(note)}${note.tags.length > 0 ? '　' + note.tags.map((tag) => `#${tag}`).join(' ') : ''}`,
        '',
        note.body,
      ]),
    }
  }

  if (action === 'update') {
    const { note } = await store.update({
      id: args.id,
      pinned: typeof args.pinned === 'boolean' ? args.pinned : undefined,
      tags: Array.isArray(args.tags) ? args.tags : undefined,
      replace: args.replace_tags === true,
    })
    return {
      value: { status: 'updated', note },
      content: text('notes · update', [`已更新 **${note.title || '无标题'}**（${note.id}）`, `标签：${note.tags.map((tag) => `#${tag}`).join(' ') || '（无）'}${note.pinned ? '　📌 置顶' : ''}`]),
    }
  }

  if (action === 'delete') {
    const { deleted, note } = await store.remove(String(args.id ?? ''))
    return {
      value: { status: deleted ? 'trashed' : 'noop', note },
      content: text('notes · delete', [`已把 **${note?.title || args.id}** 移到回收站（可以 restore 恢复）。`]),
    }
  }

  if (action === 'restore') {
    const { restored, note } = await store.restore(String(args.id ?? ''))
    return {
      value: { status: restored ? 'restored' : 'noop', note },
      content: text('notes · restore', [`已恢复 **${note?.title || args.id}**。`]),
    }
  }

  if (action === 'tags') {
    const tags = await store.tags()
    return {
      value: { tags },
      content: text('notes · tags', [tags.length === 0 ? '还没有标签。' : tags.map((entry) => `#${entry.tag}（${entry.count}）`).join('　')]),
    }
  }

  throw new Error(`未知的 action：${action}`)
}

/**
 * Register the notebook tools on a plugin context.
 *
 * `only` restricts them to one session (the notebook assistant); without it
 * they are global. Returns their disposer.
 */
/**
 * Actions that remove a note outright. The board conversation may create and edit,
 * but it does not delete: a question turned into a chat reply is cheap to undo, a
 * vanished note is not.
 */
const DESTRUCTIVE_ACTIONS = new Set(['delete'])

/**
 * Is this call coming from the dashboard conversation?
 *
 * The dashboard's agent may answer, create notes and revise them — that is how a
 * conversation turns into a page without a second trip to the capture box. Deleting
 * stays off the table. The plugin knows which session it created for the board, so
 * the check is exact rather than heuristic.
 */
async function fromBoardSession(store, exec) {
  const sessionId = exec?.agent?.id
  if (typeof sessionId !== 'string' || sessionId === '') return false
  try {
    const link = await store.linkOf('board')
    return link?.sessionId === sessionId
  } catch {
    return false
  }
}

export function registerNotesTools(ctx, store, logger, { only } = {}) {
  const tools = ctx.tools ?? ctx.get?.('tools')
  if (tools === undefined) {
    logger?.warn?.('[notes] tool registry is unavailable: the notes tool is not exposed')
    return () => {}
  }
  const scope = typeof only === 'string' && only !== '' ? only : undefined
  const register = (definition) => {
    const full = scope === undefined ? definition : { ...definition, scope }
    try {
      return tools.register(full)
    } catch (error) {
      // A host that rejects an unknown scope must not lose the tool entirely.
      logger?.warn?.(`[notes] scoped registration fell back to global: ${error?.message ?? error}`)
      return tools.register(definition)
    }
  }

  // The query surface: a projection of the notes plus the event log.
  const database = new NotesDatabase(store, { logger })

  const disposers = [
    ...registerQueryTools(register, store, database, logger),
    register({
      name: 'notes',
      description: DESCRIPTION,
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['add', 'append', 'list', 'get', 'search', 'update', 'delete', 'restore', 'tags'],
            description: '要执行的操作。最常用：用户让你记东西用 add，问"记过什么"用 search。',
          },
          body: { type: 'string', description: 'action=add/append 的正文纯文本。多行用换行符；第一行会成为标题。' },
          id: { type: 'string', description: '笔记 id（get / append / update / delete / restore 必填，可从 list/search 的结果里取）。' },
          tags: { type: 'array', items: { type: 'string' }, description: '标签（不要带 #）。add/append 时追加；update 时默认合并，replace_tags=true 则覆盖。' },
          replace_tags: { type: 'boolean', description: 'action=update：是否用 tags 覆盖原标签而不是合并。' },
          pinned: { type: 'boolean', description: 'action=update：是否置顶。' },
          query: { type: 'string', description: 'action=list/search 的检索词；list 为空时列出全部。' },
          tag: { type: 'string', description: 'action=list：只列出这个标签的笔记。' },
          include_trash: { type: 'boolean', description: 'action=list：是否包括回收站里的笔记。' },
          limit: { type: 'number', description: '最多返回几条，默认 30。' },
        },
        required: ['action'],
      },
      output: {
        schema: OUTPUT_SCHEMA,
        render: (_args, value) => text('`notes` 结果', [JSON.stringify(value, null, 2)]),
      },
      async execute(args, exec) {
        try {
          const input = args ?? {}
          if (DESTRUCTIVE_ACTIONS.has(String(input.action ?? '')) && (await fromBoardSession(store, exec))) {
            throw Object.assign(
              new Error('看板对话不能删除笔记：要删请在「历史」里选中那条再删，那里可以恢复。'),
              { code: 'BOARD_NO_DELETE' },
            )
          }
          const outcome = await run(store, input)
          return outcome.value
        } catch (error) {
          logger?.warn?.(`[notes] tool failed: ${error?.message ?? error}`)
          throw error
        }
      },
    }),
    register({
      name: ENHANCE_TOOL.name,
      description: ENHANCE_TOOL.description,
      parameters: ENHANCE_TOOL.parameters,
      output: {
        schema: OUTPUT_SCHEMA,
        render: (_args, value) => text('`notes_enhance` 结果', [JSON.stringify(value, null, 2)]),
      },
      async execute(args) {
        const outcome = await enhanceInConversation(args ?? {})
        return outcome.value
      },
    }),
  ]

  return () => {
    for (const dispose of disposers.splice(0)) {
      try {
        if (typeof dispose === 'function') dispose()
      } catch {
        /* one failing disposer must not keep the others registered */
      }
    }
    // Release the sqlite handle last: on Windows an open handle keeps the file
    // locked, which would break moving or deleting the notebook.
    database.close()
  }
}


/**
 * The query tools.
 *
 * notes_query runs SQL against the projection (read-only, one statement, capped
 * rows); notes_analyze covers the aggregates; dashboard_chart puts a result on
 * the dashboard so the answer leaves a trace. Together they are what lets the
 * assistant answer questions about content instead of summarising whatever text
 * was pasted into the prompt.
 */
function registerQueryTools(register, store, database, logger) {
  const chartStore = new ChartStore(store)

  return [
    register({
      name: 'notes_query',
      description: [
        "查询记事本的数据库（只读 SQL）。用它回答关于笔记内容、标签、时间、AI 使用的问题。",
        "",
        "可用表：",
        "  notes(id, title, body, source, pinned, chars, created_at, updated_at)",
        "  note_tags(note_id, tag)",
        "  events(id, at, kind, note_id, chars, elapsed_ms, first_token_ms, ok, detail)",
        "  messages(id, at, role, text, action)",
        "",
        "只允许单条 SELECT/WITH；参数用 ? 占位并放进 params，不要拼接字符串。",
        "body 是笔记全文，可以直接 LIKE 搜索；时间字段是 ISO 字符串。",
        "需要图表时改用 notes_analyze，或把结果交给 dashboard_chart。",
      ].join("\n"),
      parameters: {
        type: 'object',
        properties: {
          sql: { type: 'string', description: '单条 SELECT 语句，用 ? 作参数占位。' },
          params: { type: 'array', items: { type: 'string' }, description: '与 ? 顺序对应的参数。' },
          limit: { type: 'number', description: '最多返回多少行，默认 100，上限 500。' },
        },
        required: ['sql'],
      },
      output: {
        schema: OUTPUT_SCHEMA,
        render: (_args, value) => text('notes_query 结果', [JSON.stringify(value, null, 2)]),
      },
      async execute(args) {
        const input = args ?? {}
        await database.ready([])
        // Failures are returned as data, not thrown: the assistant must be able to see
        // what went wrong and say so, instead of guessing around it.
        try {
          const rows = await database.select(String(input.sql ?? ""), input.params ?? [], { limit: input.limit ?? 100 })
          return {
            rows,
            count: rows.length,
            schema: database.schemaText(),
            provenance: { source: 'index.db/events+notes', rows: rows.length, readAt: new Date().toISOString() },
          }
        } catch (error) {
          return {
            rows: [],
            count: 0,
            error: String(error?.message ?? error),
            hint: '查询失败。请把失败原因告诉用户，或改写查询后重试；不要用其它数字替代。',
            schema: database.schemaText(),
          }
        }
      },
    }),

    register({
      name: 'notes_analyze',
      description: [
        "对记事本做预设聚合统计，返回可直接画图的数据。",
        "",
        "kind：",
        "  by_tag    标签使用次数",
        "  by_source 笔记来源",
        "  by_day    按天的新增数量（最近 N 天）",
        "  by_hour   写作时段分布",
        "  lengths   篇幅分布",
        "  terms     高频词（中文按二字词，英文按单词）",
        "  ai_usage  AI 调用次数，按类型",
        "  tokens    每天的真实 token 消耗（input+output 之和，来自 events 表的记账列）",
        "  token_kinds 各功能的真实 token 消耗",
        "  timeline  最近变更的笔记",
        "",
        "chart=true 会附带 chart 规格；persist=true 会直接固定到看板。",
      ].join("\n"),
      parameters: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['by_tag', 'by_source', 'by_day', 'by_hour', 'lengths', 'terms', 'ai_usage', 'tokens', 'token_kinds', 'timeline'],
            description: '要计算的统计类型。',
          },
          limit: { type: 'number', description: '返回多少条，默认 12。' },
          days: { type: 'number', description: 'kind=by_day 默认 30，kind=tokens 默认 7。' },
          chart: { type: 'boolean', description: '是否同时返回 chart 规格。' },
          persist: { type: 'boolean', description: 'true 时把图表固定到看板。' },
        },
        required: ['kind'],
      },
      output: {
        schema: OUTPUT_SCHEMA,
        render: (_args, value) => text('notes_analyze 结果', [JSON.stringify(value, null, 2)]),
      },
      async execute(args) {
        return await analyzeNotes({ store, database, chartStore, logger }, args ?? {})
      },
    }),

    register({
      name: 'dashboard_chart',
      description: [
        "在看板上新增或替换一张图表。用户说“画个图”“放到看板上”时用它。",
        "type 只能是 bar / line / pie / stat；data 是 {label, value, color?} 数组。",
        "color 可选，是这个数据点的 CSS 颜色（#rrggbb / rgb(...) / hsl(...) / var(--dshn-series-N)）；不给就用主题的分类色板。",
        "token 相关图表必须用 notes_analyze 的 tokens / token_kinds，或直接查 events 的 input_tokens/output_tokens；不要用 chars 估算。",
        "data 里的每个数字都必须来自本轮工具结果；拿不到数据时不要画图，直接告诉用户缺什么。",
        "通常先用 notes_query 或 notes_analyze 拿到数据，再调用本工具。",
      ].join("\n"),
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '图表 id；相同 id 会覆盖，省略则新建。' },
          title: { type: 'string', description: '图表标题。' },
          type: { type: 'string', enum: ['bar', 'line', 'pie', 'stat'], description: '图表类型。' },
          source: {
            type: 'string',
            description: '数字来源（例如「notes_query: events 按天分组」「notes_analyze: tokens」），会显示在图表标题下方。',
          },
          data: {
            type: 'array',
            description: '数据点。',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                value: { type: 'number' },
                color: {
                  type: 'string',
                  description:
                    '可选：这个数据点的颜色（#rrggbb / rgb(...) / hsl(...) / var(--dshn-series-N)）。不合法会被忽略。',
                },
              },
              required: ['label', 'value'],
            },
          },
          note: { type: 'string', description: '一句说明，显示在标题旁。' },
        },
        required: ['title', 'type', 'data'],
      },
      output: {
        schema: OUTPUT_SCHEMA,
        render: (_args, value) => text('dashboard_chart 结果', [JSON.stringify(value, null, 2)]),
      },
      async execute(args) {
        const input = args ?? {}
        const chart = {
          id: String(input.id ?? 'tool-' + Date.now().toString(36)),
          title: String(input.title ?? '图表').slice(0, 60),
          type: ['bar', 'line', 'pie', 'stat'].includes(String(input.type)) ? String(input.type) : 'bar',
          data: (Array.isArray(input.data) ? input.data : []).slice(0, 40).map((point) => {
            const color = safeColor(point?.color)
            const row = { label: String(point?.label ?? '').slice(0, 24), value: Number(point?.value) || 0 }
            // Only carry the field when it is usable: an empty string in the file is noise.
            if (color !== '') row.color = color
            return row
          }),
          note: typeof input.note === 'string' ? input.note.slice(0, 200) : '',
          // Where the numbers came from; rendered under the title so a chart can be
          // audited instead of trusted.
          source: typeof input.source === 'string' ? input.source.slice(0, 160) : '',
          savedAt: new Date().toISOString(),
        }
        const charts = await chartStore.save(chart)
        await new EventLog(store).record('chart.saved', { chartId: chart.id })
        return { saved: chart, total: charts.length }
      },
    }),
  ]
}

/**
 * The aggregates behind notes_analyze.
 *
 * SQL for the counting, the term extractor for the words, one shape out: a label
 * series the dashboard can draw and the model can read.
 */
export async function analyzeNotes({ store, database, chartStore, logger }, { kind, limit, days, chart, persist }) {
  const count = Math.min(Math.max(Number(limit) || 12, 1), 60)
  await database.ready([])
  let rows = []
  let title = ''
  let type = 'bar'

  if (kind === 'by_tag') {
    title = '标签使用次数'
    rows = await database.select(
      'SELECT tag AS label, COUNT(*) AS value FROM note_tags GROUP BY tag ORDER BY value DESC, label ASC LIMIT ?',
      [count],
    )
  } else if (kind === 'by_source') {
    title = '笔记来源'
    type = 'pie'
    rows = await database.select(
      'SELECT source AS label, COUNT(*) AS value FROM notes GROUP BY source ORDER BY value DESC',
    )
  } else if (kind === 'by_day') {
    const window = Math.min(Math.max(Number(days) || 30, 1), 180)
    title = '按天新增'
    type = 'line'
    rows = await database.select(
      "SELECT substr(created_at, 6, 5) AS label, COUNT(*) AS value FROM notes WHERE created_at >= date('now', ?) GROUP BY substr(created_at, 1, 10) ORDER BY substr(created_at, 1, 10) ASC",
      ['-' + window + ' days'],
    )
  } else if (kind === 'by_hour') {
    title = '写作时段'
    rows = await database.select(
      'SELECT substr(updated_at, 12, 2) AS label, COUNT(*) AS value FROM notes GROUP BY label ORDER BY label ASC',
    )
  } else if (kind === 'lengths') {
    title = '篇幅分布'
    rows = await database.select(
      "SELECT CASE WHEN chars < 80 THEN '<80' WHEN chars < 200 THEN '80-200' WHEN chars < 500 THEN '200-500' WHEN chars < 1200 THEN '500-1200' ELSE '>1200' END AS label, COUNT(*) AS value FROM notes GROUP BY label ORDER BY MIN(chars)",
    )
  } else if (kind === 'terms') {
    title = '高频词'
    const bodies = await database.select('SELECT body FROM notes LIMIT 500')
    rows = topTerms(bodies.map((row) => row.body), { limit: count })
  } else if (kind === 'ai_usage') {
    title = 'AI 使用'
    rows = await database.select(
      "SELECT kind AS label, COUNT(*) AS value FROM events WHERE kind NOT LIKE 'note.%' GROUP BY kind ORDER BY value DESC LIMIT ?",
      [count],
    )
  } else if (kind === 'tokens') {
    // Real accounting: input+output per day, with cache reads broken out. Never estimate
    // from chars — that is what made the pinned charts disagree with the tiles.
    const window = Math.min(Math.max(Number(days) || 7, 1), 180)
    title = '每日 token 消耗（真实记账）'
    type = 'bar'
    rows = await database.select(
      "SELECT substr(at, 6, 5) AS label, SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)) AS value FROM events WHERE at >= date('now', ?) AND COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0) > 0 GROUP BY substr(at, 1, 10) ORDER BY substr(at, 1, 10) ASC",
      ['-' + window + ' days'],
    )
  } else if (kind === 'token_kinds') {
    // Which actions spend the tokens.
    title = '各功能的 token 消耗（真实记账）'
    rows = await database.select(
      "SELECT kind AS label, SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)) AS value FROM events GROUP BY kind HAVING value > 0 ORDER BY value DESC LIMIT ?",
      [count],
    )
  } else if (kind === 'timeline') {
    title = '最近变更'
    rows = await database.select(
      'SELECT title AS label, chars AS value FROM notes ORDER BY updated_at DESC LIMIT ?',
      [count],
    )
  } else {
    throw Object.assign(new Error('未知的统计类型：' + String(kind)), { code: 'BAD_KIND' })
  }

  const series = rows.map((row) => ({ label: String(row.label ?? ""), value: Number(row.value) || 0 }))
  const result = {
    kind,
    title,
    rows: series,
    provenance: { source: 'index.db', rows: series.length, readAt: new Date().toISOString() },
  }
  // Say what the numbers cannot cover, so a gap is never filled by guessing.
  if (kind === 'tokens' || kind === 'token_kinds') {
    result.caveat = '只统计已记账的调用（input_tokens/output_tokens 有值的记录）；记账上线前的调用没有 token 数据。'
  }
  if (chart === true || persist === true) {
    result.chart = { id: 'analyze-' + kind, title, type, data: series }
    if (persist === true) {
      await chartStore.save({ ...result.chart, id: 'tool-' + kind, savedAt: new Date().toISOString() })
      await new EventLog(store).record('chart.saved', { chartId: 'tool-' + kind })
    }
  }
  void logger
  return result
}
export { ENHANCE_TOOL }
