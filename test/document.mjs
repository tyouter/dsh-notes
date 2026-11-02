// Document-level harness.
//
// The earlier tests mostly asserted that certain code strings existed, which is why rendering
// bugs reached the user. This file works the other way round: it feeds real model outputs
// (including the bad ones seen in practice) through the client transforms, renders the tree, and
// asserts on the RENDERED result. It also writes standalone HTML previews to exports/previews/ so
// the layout can be eyeballed without the app.
//
// Run with: node test/document.mjs
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const packageDir = join(here, '..')
const fixtures = join(here, '.document-fixture')
const previewDir = join(packageDir, 'exports', 'previews')

const React = {
  Fragment: Symbol('Fragment'),
  createElement(type, props, ...children) {
    const flat = children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false)
    if (typeof type === 'function') {
      const all = { ...(props ?? {}), children: flat }
      const isClass = typeof type.prototype?.render === 'function'
      return isClass ? new type(all).render() : type(all)
    }
    if (type === React.Fragment) return { node: '#fragment', props: {}, children: flat }
    return { node: type, props: props ?? {}, children: flat }
  },
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => undefined,
  useMemo: (factory) => factory(),
  Component: class Component {
    constructor(props) {
      this.props = props ?? {}
      this.state = {}
    }
    setState(next) {
      this.state = { ...this.state, ...(typeof next === 'function' ? next(this.state) : next) }
    }
  },
  useCallback: (fn) => fn,
  useRef: (initial) => ({ current: initial }),
}

globalThis.fetch = async () => ({ status: 200, json: async () => ({ ok: true, data: {} }) })
globalThis.window = {
  __ModuleLoader__: { load: (definition) => { globalThis.__factory = definition.factory } },
  addEventListener() {},
  removeEventListener() {},
}
globalThis.localStorage = { getItem: () => 'auto' }
Object.defineProperty(globalThis, 'navigator', { value: { language: 'zh-CN' }, configurable: true })
globalThis.setInterval = () => 0
globalThis.clearInterval = () => {}
globalThis.__DSH_NOTES_TEST__ = true

let failures = 0
const check = (label, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${condition ? '' : `  ${detail}`}`)
  if (!condition) failures += 1
}

await mkdir(fixtures, { recursive: true })
await mkdir(previewDir, { recursive: true })
await writeFile(join(fixtures, 'client.mjs'), await readFile(join(packageDir, 'client.js'), 'utf8'), 'utf8')
await import(pathToFileURL(join(fixtures, 'client.mjs')).href)
globalThis.__factory((name) => {
  if (name === 'react') return React
  throw new Error(`unexpected require: ${name}`)
})

const { renderMarkdown, renderNoteBody, renumberByTemplate, splitNoteTitle, preserveMarkup, fidelityReport, fidelityIssues, repairCoverage, assembleIndexedLines, isCovered, typographyIssues } = globalThis.__dshNotesInternals
if (renumberByTemplate === undefined) throw new Error('test seam does not expose the transforms')

// ------------------------------------------------------------------ rendering helpers ---

/** One readable line per rendered block: "marker | text" or "heading | text". */
function outlineOf(tree) {
  const lines = []
  const walk = (node) => {
    if (node === null || node === undefined) return
    if (typeof node === 'string') return
    if (Array.isArray(node)) {
      for (const child of node) walk(child)
      return
    }
    const className = String(node.props?.className ?? '')
    if (className.includes('dshn-md-item')) {
      const children = node.children ?? []
      const marker = textOf(children[0]).trim()
      const body = children.slice(1).map(textOf).join(' ').trim()
      lines.push({ kind: 'item', marker, text: body })
      return
    }
    if (node.node === 'li') {
      lines.push({ kind: 'li', marker: '', text: textOf(node).trim() })
      return
    }
    if (/^h[1-6]$/.test(String(node.node)) || className.includes('dshn-note-title')) {
      const text = textOf(node).trim()
      if (text !== '') lines.push({ kind: 'heading', marker: '', text })
      return
    }
    if (node.node === 'p') {
      const text = textOf(node).trim()
      if (text !== '') lines.push({ kind: 'p', marker: '', text })
      return
    }
    for (const child of node.children ?? []) walk(child)
  }
  walk(tree)
  return lines
}

/** All text inside a node. */
function textOf(node) {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(textOf).join('')
  return (node.children ?? []).map(textOf).join('')
}

/** A standalone HTML page with the plugin's real stylesheet, for eyeballing. */
function htmlOf(tree, title) {
  const styles = STYLES_TEXT ?? ''
  const body = toHtml(tree)
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>${title}</title>
<style>
  :root {
    /* Fallbacks so the page renders outside the app (the app supplies these tokens). */
    --dsw-alias-label-primary: #1b1b1b;
    --dsw-alias-label-secondary: #6b6b6b;
    --dsw-alias-bg-base: #ffffff;
    --dsw-alias-bg-layer-1: #ffffff;
    --dsw-alias-bg-layer-2: #f2f2f2;
    --dsw-alias-border-l1: #e3e3e3;
    --dsw-alias-border-l2: #d0d0d0;
    --dsw-alias-brand-primary: #1f6feb;
    --dshn-heat-0: #ebedf0;
    --dshn-heat-1: #9be9a8;
    --dshn-heat-2: #40c463;
    --dshn-heat-3: #30a14e;
    --dshn-heat-4: #216e39;
    --dshn-r-sm: 6px;
    --dshn-r-md: 10px;
    --dshn-r-lg: 14px;
  }
  body { margin: 0; background: var(--dsw-alias-bg-base); }
  .page { max-width: 760px; margin: 0 auto; padding: 40px 48px; }
</style>
<style>${styles}</style>
</head><body><div class="dshn-root"><div class="page"><div class="dshn-md">${body}</div></div></div></body></html>`
}

/** Minimal serializer: enough class names for the stylesheet to apply. */
function toHtml(tree) {
  const escape = (value) =>
    String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const walk = (node) => {
    if (node === null || node === undefined) return ''
    if (typeof node === 'string') return escape(node)
    if (Array.isArray(node)) return node.map(walk).join('')
    const className = node.props?.className
    const attrs = className === undefined ? '' : ` class="${escape(className)}"`
    const data =
      node.props?.['data-level'] === undefined ? '' : ` data-level="${escape(node.props['data-level'])}"`
    const extra = data
    return `<${node.node}${attrs}${extra}>${(node.children ?? []).map(walk).join('')}</${node.node}>`
  }
  return walk(tree)
}

// The stylesheet is a module-level template string; lift it out of the bundle for the previews.
const bundle = await readFile(join(packageDir, 'client.js'), 'utf8')
const stylesStart = bundle.indexOf('const STYLES = `')
const stylesEnd = stylesStart < 0 ? -1 : bundle.indexOf('\n`', stylesStart)
const STYLES_TEXT = stylesStart >= 0 && stylesEnd > 0 ? bundle.slice(stylesStart + 'const STYLES = `'.length, stylesEnd) : ''

// ------------------------------------------------------------------------- fixtures ---
//
// Every `modelOutput` here is a shape the real model produced at some point: Roman numerals,
// a flat 1..6 list, a repeated "1." sequence, and one where items were merged onto one line.

const draft = [
  '一、报销',
  '(1) 发票月底前交',
  'a) 金额 1280',
  '二、部署',
  '① rollback 未写',
  '② 日志待发',
].join('\n')

const fixturesList = [
  {
    name: 'roman-numerals',
    note: '真实的罗马数字输出',
    modelOutput: ['I. Reimbursement', '(1) Submit the invoice by the end of the month', 'a) Amount 1280', '', 'II. Deployment', '① rollback not written', '② Logs pending'].join('\n'),
    expect: ['1.', '(1)', 'a)', '2.', '①', '②'],
  },
  {
    name: 'flat-1-to-6',
    note: '被压平成一条序列的输出',
    modelOutput: ['1. Reimbursement', '2. Submit the invoice', '3. Amount 1280', '4. Deployment', '5. rollback not written', '6. Logs pending'].join('\n'),
    expect: ['1.', '(1)', 'a)', '2.', '①', '②'],
  },
  {
    name: 'repeated-1',
    note: '每节都写 1. 的输出',
    modelOutput: ['1. Reimbursement', '1. Submit the invoice', '1. Amount 1280', '1. Deployment', '1. rollback not written', '1. Logs pending'].join('\n'),
    expect: ['1.', '(1)', 'a)', '2.', '①', '②'],
  },
]

for (const fixture of fixturesList) {
  const rebuilt = renumberByTemplate(draft, fixture.modelOutput, { latin: true })
  const tree = renderNoteBody(renumberByTemplate(draft, rebuilt, { latin: true }))
  const outline = outlineOf(tree)
  const markers = outline.filter((line) => line.kind === 'item').map((line) => line.marker)
  check(`${fixture.name}: six outline lines`, markers.length === 6, JSON.stringify(outline))
  check(`${fixture.name}: markers keep the hierarchy`, JSON.stringify(markers) === JSON.stringify(fixture.expect), JSON.stringify(markers))
  check(
    `${fixture.name}: no line holds two markers`,
    outline.every((line) => (line.text.match(/\(?\d+[.)]/g) ?? []).length <= 1),
    JSON.stringify(outline.map((line) => line.text)),
  )
  const file = join(previewDir, `document-${fixture.name}.html`)
  await writeFile(file, htmlOf(tree, fixture.name), 'utf8')
  console.log(`      preview: exports/previews/document-${fixture.name}.html`)
}

// --------------------------------------------- marker retention and line structure ---
// The model returned "## 议题一" as plain text and collapsed a five-line tail into one line.
const withHeadings = ['## 议题一：加载性能', '1. 现状', '## 议题二：token 统计', '一、只统计了 enhance'].join('\n')
const modelDroppedHeadings = ['议题一：加载性能', '1. 现状', '议题二：token 统计', '一、只统计了 enhance'].join('\n')
const restored = preserveMarkup(withHeadings, modelDroppedHeadings)
check('a dropped heading level is restored', restored.startsWith('## 议题一：加载性能'), JSON.stringify(restored.split('\n')[0]))
check('the second heading is restored too', restored.split('\n')[2] === '## 议题二：token 统计', JSON.stringify(restored.split('\n')))
check('content is untouched by the restore', restored.split('\n')[1] === '1. 现状' && restored.split('\n')[3] === '一、只统计了 enhance')

const withQuote = ['> 原话：别硬套模板', '- 侧栏宽度 400'].join('\n')
check('a dropped quote bar is restored', preserveMarkup(withQuote, '原话：别硬套模板').startsWith('> '))
check('a dropped bullet is restored', preserveMarkup(withQuote, '侧栏宽度 400').startsWith('- '))
check('an already-marked line is left alone', preserveMarkup(withHeadings, '## 议题一：加载性能') === '## 议题一：加载性能')

// One newline is one line: the tail keeps five lines instead of collapsing into one.
const tail = ['下周安排：', '周二对齐接口', '周三出 demo', '周四评审', '要点'].join('\n')
const tailTree = renderMarkdown(tail)
const countNodes = (node, name) => {
  if (node === null || node === undefined || typeof node === 'string') return 0
  if (Array.isArray(node)) return node.reduce((sum, child) => sum + countNodes(child, name), 0)
  const self = node.node === name ? 1 : 0
  return self + (node.children ?? []).reduce((sum, child) => sum + countNodes(child, name), 0)
}
const tailBreaks = countNodes(tailTree, 'br')
// The label line heads the block, so the four remaining lines need three breaks.
check('a plain list of lines keeps its breaks', tailBreaks === 3, String(tailBreaks))
await writeFile(join(previewDir, 'document-line-breaks.html'), htmlOf(tailTree, 'line breaks'), 'utf8')
console.log('      preview: exports/previews/document-line-breaks.html')

// ---------------------------------------------------------------- fidelity of a rewrite ---
// The mechanism, exercised with the shape that actually regressed: a five-line tail collapsed
// into one line and a heading turned into plain text.
const fidelitySource = ['## 待整理', '下周安排：', '周二对齐接口', '周三出 demo', '周四评审', '要点'].join('\n')
const collapsed = ['待整理', '下周二对齐接口 周三出 demo 周四评审 要点'].join('\n')
const collapsedReport = fidelityReport(fidelitySource, collapsed, { sameLanguage: true })
check('fidelity: a collapsed tail is reported', fidelityIssues(collapsedReport), JSON.stringify(collapsedReport))
check('fidelity: the lost lines are named', collapsedReport.missing.length >= 1, JSON.stringify(collapsedReport.missing))
check('fidelity: the line collapse is measured', collapsedReport.lineDelta === -4, String(collapsedReport.lineDelta))

const faithful = ['## 待整理', '下周安排：', '周二对齐接口', '周三出 demo', '周四评审', '要点'].join('\n')
check('fidelity: a faithful rewrite is quiet', fidelityIssues(fidelityReport(fidelitySource, faithful, { sameLanguage: true })) === false)

// A translation is allowed to change the words; only the shape is compared.
const translatedTail = ['To organise', 'Next week:', 'Tuesday: align the interface', 'Wednesday: demo', 'Thursday: review', 'Key points'].join('\n')
const translatedReport = fidelityReport(fidelitySource, translatedTail, { sameLanguage: false })
check('fidelity: a translation is not judged on words', translatedReport.missing.length === 0, JSON.stringify(translatedReport.missing))
check('fidelity: a translation keeps its line count', translatedReport.lineDelta === 0, String(translatedReport.lineDelta))

// Losing lines in a translation is still a shape regression.
const translatedCollapsed = ['To organise', 'Tuesday align the interface Wednesday demo Thursday review'].join('\n')
check(
  'fidelity: a collapsed translation is reported',
  fidelityReport(fidelitySource, translatedCollapsed, { sameLanguage: false }).lineDelta === -4,
  String(fidelityReport(fidelitySource, translatedCollapsed, { sameLanguage: false }).lineDelta),
)

// ------------------------------------------------------------ preventing loss outright ---
// 1. Coverage repair: a rewrite that dropped a line gets it back, in place.
const repairSource = ['## 待整理', '下周安排：', '周二对齐接口', '周三出 demo', '周四评审', '要点'].join('\n')
const lossyRewrite = ['## 待整理', '下周安排：', '周二对齐接口 周三出 demo', '', '要点'].join('\n')
const repaired = repairCoverage(repairSource, lossyRewrite)
const repairedLines = repaired.split('\n').map((line) => line.trim()).filter((line) => line !== '')
for (const line of ['周二对齐接口', '周三出 demo', '周四评审', '要点']) {
  check('no-loss: ' + line + ' survives', repairedLines.some((entry) => entry.includes(line)), JSON.stringify(repairedLines))
}
check('no-loss: the repair adds no invented text', repairedLines.every((entry) => repairSource.includes(entry) || '周二对齐接口 周三出 demo'.includes(entry)), JSON.stringify(repairedLines))

const untouched = repairCoverage(repairSource, repairSource)
check('no-loss: a faithful rewrite is left alone', untouched === repairSource, JSON.stringify(untouched))

// 2. Index-aligned assembly: the draft's newlines decide the output's newlines.
const draftLines = ['一、报销', '', '(1) 发票月底前交', '(2) 金额 1280'].join('\n')
const translations = ['1. Reimbursement', '', '(1) Submit the invoice', '(2) Amount 1280']
const assembled = assembleIndexedLines(draftLines, translations)
check('no-loss: assembly keeps every line', assembled.split('\n').length === draftLines.split('\n').length, JSON.stringify(assembled))
check('no-loss: blank lines survive', assembled.split('\n')[1] === '', JSON.stringify(assembled))
check('no-loss: translations are used', assembled.includes('Reimbursement') && assembled.includes('Amount 1280'))

// A missing translation degrades to the source line instead of disappearing.
const partial = ['1. Reimbursement', '', null, null]
const assembledPartial = assembleIndexedLines(draftLines, partial)
check('no-loss: a missing line falls back to the source', assembledPartial.includes('(1) 发票月底前交'), JSON.stringify(assembledPartial))
check('no-loss: nothing is dropped by a partial answer', assembledPartial.split('\n').length === 4, JSON.stringify(assembledPartial))

// A model that merges two items into one line cannot shorten the result.
const merged = ['1. Reimbursement', '', '(1) Submit the invoice (2) Amount 1280', null]
check(
  'no-loss: a merged answer cannot collapse the document',
  assembleIndexedLines(draftLines, merged).split('\n').length === 4,
  JSON.stringify(assembleIndexedLines(draftLines, merged)),
)
check('no-loss: coverage sees a paraphrase as covered', isCovered('周二对齐接口', comparableOf('周二 对齐接口，把细节定下来')) === true)
function comparableOf(value) {
  return String(value).replace(/[\s*_`~>#+•]+/g, '').toLowerCase()
}

// ------------------------------------------------------- the typography gate ---
// Structure must output a professional document. These are the defects it is judged on, and each
// message is written so it can be sent straight back to the model for one repair pass.
const gateSource = ['## 待整理', '下周安排：', '周二对齐接口', '周三出 demo', '周四评审'].join('\n')

check('typography: a clean rewrite has no issues', typographyIssues(gateSource, gateSource, { title: '待整理' }).length === 0, JSON.stringify(typographyIssues(gateSource, gateSource, { title: '待整理' })))

const mergedLines = ['## 待整理', '周二对齐接口 周三出 demo', '周四评审'].join('\n')
check('typography: merged lines are reported', typographyIssues(gateSource, mergedLines, {}).length >= 1, JSON.stringify(typographyIssues(gateSource, mergedLines, {})))

const twoMarkersOneLine = ['## 待整理', '1. 周二对齐接口 2. 周三出 demo', '3. 周四评审'].join('\n')
const doubleIssue = typographyIssues(gateSource, twoMarkersOneLine, {})
check('typography: two markers on one line are reported', doubleIssue.some((issue) => issue.includes('合并')), JSON.stringify(doubleIssue))

const meta = ['以下是整理后的笔记：', '## 待整理', '周二对齐接口', '周三出 demo', '周四评审'].join('\n')
check('typography: meta commentary is reported', typographyIssues(gateSource, meta, {}).some((issue) => issue.includes('不要输出')), JSON.stringify(typographyIssues(gateSource, meta, {})))

const repeatedTitle = ['## 待整理', '待整理', '周二对齐接口', '周三出 demo', '周四评审'].join('\n')
check('typography: a repeated title is reported', typographyIssues(gateSource, repeatedTitle, { title: '待整理' }).some((issue) => issue.includes('重复')), JSON.stringify(typographyIssues(gateSource, repeatedTitle, { title: '待整理' })))

const dropped = ['## 待整理', '周二对齐接口', '周三出 demo'].join('\n')
const droppedIssues = typographyIssues(gateSource, dropped, {})
check('typography: dropped content is reported with the text', droppedIssues.some((issue) => issue.includes('周四评审')), JSON.stringify(droppedIssues))
check('typography: a shortfall is reported as lines', droppedIssues.some((issue) => issue.includes('少了')), JSON.stringify(droppedIssues))

// ---- task markers ----
// Notes use more than [ ] and [x]: "[?]" means undecided and must not render as literal text.
const tasks = ['- [ ] 报销发票', '- [x] 写文档', '- [?] 配色定稿', '- [~] 压测进行中'].join('\n')
const taskTree = renderMarkdown(tasks)
const findList = (node) => {
  if (node === null || node === undefined || typeof node === 'string') return null
  if (Array.isArray(node)) { for (const child of node) { const hit = findList(child); if (hit !== null) return hit } return null }
  const className = String(node.props?.className ?? '')
  if (className.includes('dshn-md-list')) return node
  for (const child of node.children ?? []) { const hit = findList(child); if (hit !== null) return hit }
  return null
}
const list = findList(taskTree)
const marks = (list?.children ?? []).map((item) => String(item.props?.['data-task']))
check('task markers: four items are found', marks.length === 4, JSON.stringify(marks))
check('task markers: open and done are recognised', marks[0] === 'false' && marks[1] === 'true', JSON.stringify(marks))
check('task markers: undecided and in-progress are pending', marks[2] === 'pending' && marks[3] === 'pending', JSON.stringify(marks))
check('task markers: the bracket token is not shown', (list?.children ?? []).every((item) => !JSON.stringify(item).includes('[?]')), JSON.stringify(list))

// A note that starts with an outline item must not grow a title.
const sourceOutline = ['1. 报销', '(1) 发票月底前交', '① 备注'].join('\n')
const split = splitNoteTitle(sourceOutline)
check('an outline-first note has no invented title', split.title === '', JSON.stringify(split))

// A plain note keeps its title and its paragraphs.
const prose = ['周五会议记录', '', '会上没有结论。', '', '下周继续。'].join('\n')
const proseTree = renderNoteBody(prose)
const proseOutline = outlineOf(proseTree)
check('a prose note keeps one heading', proseOutline.filter((line) => line.kind === 'heading').length === 1, JSON.stringify(proseOutline))
check('a prose note keeps its paragraphs', proseOutline.filter((line) => line.kind === 'p').length === 2, JSON.stringify(proseOutline))
await writeFile(join(previewDir, 'document-prose.html'), htmlOf(proseTree, 'prose'), 'utf8')

// A mixed note: headings, an outline, bullets and a rule — the shape must survive rendering.
const mixed = ['工作记录', '', '## 本周', '', '一、报销', '(1) 发票', 'a) 金额', '', '- 一条独立要点', '', '---', '', '下周继续'].join('\n')
const mixedOutline = outlineOf(renderMarkdown(mixed))
check('a mixed note keeps its outline count', mixedOutline.filter((line) => line.kind === 'item').length === 3, JSON.stringify(mixedOutline))
check('a mixed note keeps bullets as list items', mixedOutline.some((line) => line.kind === 'li'), JSON.stringify(mixedOutline))
await writeFile(join(previewDir, 'document-mixed.html'), htmlOf(renderMarkdown(mixed), 'mixed'), 'utf8')

try {
  await rm(fixtures, { recursive: true, force: true })
} catch {
  /* best effort */
}

// ------------------------------------------------------------- the complex sample ---
// One document that exercises every marker style, headings, a quote, bullets with a
// continuation line, a rule and a pseudo-markdown tail.
const complex = [
  '# 11 月 3 日 周会纪要',
  '',
  '## 与会者',
  '张三、李四、赵六（王五请假，理由未说明）',
  '',
  '## 议题一：加载性能',
  '1. 现状',
  '   (1) 首屏 3–5 秒，凭印象，未实测',
  '   (2) 缓存命中率没人统计过',
  '2. 待办',
  '   a) 埋点：LCP、TTFB',
  '   b) 结论下周三前给',
  '',
  '## 议题二：token 统计',
  '一、只统计了 enhance 与 copilot',
  '   （一）board 会话的轮次还没接',
  '二、字段命名未定',
  '   ① input/output',
  '   ② prompt/response',
  '',
  '## 待确认',
  '> 原话：**别为了看起来结构化硬套模板**',
  '> 这句要原样保留',
  '',
  '- 侧栏宽度默认 400，是否写进文档',
  '  续行：写进「界面约定」一章',
  '- 导出功能先不做，等需求确认',
  '',
  '## 说明',
  '`looksStructured()` 只看 Markdown 标记；详见 [接口说明](https://example.com/doc)。',
  '',
  '---',
  '',
  '## 待整理（伪 Markdown）',
  '下周安排：',
  '周二对齐接口',
  '周三出 demo',
  '周四评审',
  '要点',
  '• 首 token 压到 1 秒内',
  '• 侧栏宽度可拖',
].join('\n')

const complexTree = renderMarkdown(complex)
const complexOutline = outlineOf(complexTree)
const itemLines = complexOutline.filter((line) => line.kind === 'item')
check('complex: every marker style gets a line', itemLines.length === 11, JSON.stringify(complexOutline.map((l) => l.kind)))
check(
  'complex: the marker sequence is preserved',
  JSON.stringify(itemLines.map((line) => line.marker)) ===
    JSON.stringify(['1.', '(1)', '(2)', '2.', 'a)', 'b)', '一、', '（一）', '二、', '①', '②']),
  JSON.stringify(itemLines.map((line) => line.marker)),
)
check('complex: headings stay headings', complexOutline.filter((line) => line.kind === 'heading').length >= 6, String(complexOutline.filter((line) => line.kind === 'heading').length))
check('complex: bullets stay a list', complexOutline.some((line) => line.kind === 'li'), JSON.stringify(complexOutline.map((l) => l.kind)))
check('complex: a quote and a rule survive', complexTree.some((node) => node.node === 'blockquote') && complexTree.some((node) => node.node === 'hr'))
check('complex: no line holds two markers', complexOutline.every((line) => (line.text.match(/\(?\d+[.)]/g) ?? []).length <= 1), JSON.stringify(complexOutline.map((l) => l.text)))
await writeFile(join(previewDir, 'document-complex.html'), htmlOf(complexTree, 'complex'), 'utf8')
console.log('      preview: exports/previews/document-complex.html')


console.log(failures === 0 ? '\nall document checks passed' : `\n${failures} check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
