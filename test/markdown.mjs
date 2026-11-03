// Markdown rendering checks for the note body.
// Run with: node test/markdown.mjs
//
// Loads the built client, pulls the renderer out through the test seam, and
// asserts the shapes that were wrong in the UI: raw ** in titles, literal ---,
// bold inside list items.

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const packageDir = join(here, '..')
const fixtures = join(here, '.md-fixture')

const React = {
  Fragment: Symbol('Fragment'),
  createElement(type, props, ...children) {
    const flat = children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false)
    if (typeof type === 'function') {
      const allProps = { ...(props ?? {}), children: flat }
      const isClass = typeof type.prototype?.render === 'function'
      return isClass ? new type(allProps).render() : type(allProps)
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
globalThis.window = { __ModuleLoader__: { load: (definition) => { globalThis.__factory = definition.factory } }, addEventListener() {}, removeEventListener() {} }
globalThis.localStorage = { getItem: () => 'zh' }
Object.defineProperty(globalThis, 'navigator', { value: { language: 'zh-CN' }, configurable: true })
globalThis.setInterval = () => 0
globalThis.clearInterval = () => {}
globalThis.__DSH_NOTES_TEST__ = true

let failures = 0
const check = (label, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${condition ? '' : `  ${detail}`}`)
  if (!condition) failures += 1
}

/** Flatten a rendered tree to a tag/text sequence for assertions. */
function flatten(tree, out = []) {
  if (tree === null || tree === undefined) return out
  if (typeof tree === 'string') {
    out.push(tree)
    return out
  }
  if (typeof tree !== 'object') return out
  if (Array.isArray(tree)) {
    for (const child of tree) flatten(child, out)
    return out
  }
  if (typeof tree.node === 'string' && tree.node !== '#fragment') {
    out.push(`<${tree.node}>`)
    for (const child of tree.children ?? []) flatten(child, out)
    out.push(`</${tree.node}>`)
    return out
  }
  for (const child of tree.children ?? []) flatten(child, out)
  return out
}

const tags = (tree) => flatten(tree).filter((piece) => piece.startsWith('</') || piece.startsWith('<'))
const texts = (tree) => flatten(tree).filter((piece) => !piece.startsWith('<'))

try {
  await mkdir(fixtures, { recursive: true })
  await writeFile(join(fixtures, 'client.mjs'), await readFile(join(packageDir, 'client.js'), 'utf8'), 'utf8')
  await import(pathToFileURL(join(fixtures, 'client.mjs')).href)
  globalThis.__factory((name) => {
    if (name === 'react') return React
    throw new Error(`unexpected require: ${name}`)
  })

  const internals = globalThis.__dshNotesInternals
  if (internals === undefined) throw new Error('test seam did not expose the renderer')
  const { renderMarkdown, stripInline, titleOf, previewOf, looksStructured, composeFormattedNote, splitNoteTitle, renderNoteBody, preserveLabel, sectionLabel, normalizeTranslatedLabel, detectTextLanguage, resolveTranslateTarget, renumberSequence, convertEnumeratorsToArabic, normalizeStrayAsterisks, formatLocally, parseEnumerator, convertEnumerators, renumberByTemplate, outlineLevels, outlineEntries } = internals

  // ---- the markers that showed up raw in the UI ----
  check('stripInline removes bold', stripInline('**目标**') === '目标', stripInline('**目标**'))
  check('stripInline removes inline code', stripInline('用 `notes` 工具') === '用 notes 工具')
  check('stripInline removes a leading heading marker', stripInline('## 待办') === '待办')

  const note = { title: '**目标**', body: '**目标**\n做一个视频。 **待办** - 补文档' }
  check('title is displayed without markers', titleOf(note, { untitled: '无标题' }) === '目标', titleOf(note, { untitled: '无标题' }))
  check('preview is displayed without markers', !previewOf(note).includes('**'), previewOf(note))

  // ---- snippet rules: structural labels out, appendix cut, segments capped ----
  const structured = {
    title: '**目标**',
    body: ['**目标**', '', '做一个视频。', '', '**待办**', '', '- 写脚本', '', '---', '', '## 原始记录', '', '> 原稿'].join('\n'),
  }
  const snippet = previewOf(structured)
  check('snippet drops section labels', !snippet.includes('待办'), snippet)
  check('snippet stops at the appendix rule', !snippet.includes('原稿') && !snippet.includes('原始记录'), snippet)
  check('snippet keeps the content', snippet.includes('做一个视频'), snippet)

  const many = { title: 'T', body: ['T', 'a', 'b', 'c', 'd', 'e'].join('\n') }
  const manySnippet = previewOf(many)
  check('snippet caps at four segments', manySnippet.split(' · ').length <= 4, manySnippet)
  check('capped snippet signals the cut', manySnippet.endsWith('…'), manySnippet)

  const numbered = { title: 'T', body: ['T', '1. 第一件事', '2. 第二件事'].join('\n') }
  check('snippet drops ordered markers', !previewOf(numbered).includes('1.'), previewOf(numbered))
  // ---- body rendering ----
  const body = renderMarkdown(
    ['## 目标', '', '做一个插件开发实战教学视频。', '', '---', '', '## 原始记录', '', '> 做那个视频'].join('\n'),
  )
  const bodyTags = tags(body)
  check('headings become heading elements', bodyTags.includes('<h4>') || bodyTags.includes('<h3>') || bodyTags.includes('<h5>'), bodyTags.join(''))
  check('a --- line becomes a rule', bodyTags.includes('<hr>'), bodyTags.join(''))

// ---- section labels ----
// "一、报销" must head its section instead of being joined into the paragraph below.
const labelled = renderMarkdown(['一、报销', '财务说发票要在月底前交。', '', '三、配色', '雾面灰配钛合金。'].join('\n'))
const labelledTags = tags(labelled)
check('a numbered label gets its own line', labelledTags.filter((tag) => tag === 'I' || tag === '<span>').length > 0, labelledTags.join(''))
check('a numbered label is not swallowed into a paragraph', labelledTags.filter((tag) => tag === '<p>').length === 2, labelledTags.join(''))
check('the label keeps its text', texts(labelled).join('').includes('一、报销'))
check('the body stays a paragraph', labelledTags.includes('<p>'), labelledTags.join(''))
const colonLabel = renderMarkdown('小结：\n今天先到这')
check('a colon label becomes a heading', tags(colonLabel).includes('<h4>'), tags(colonLabel).join(''))
  check('the raw --- never appears as text', !texts(body).some((text) => text.trim() === '---'))
  check('a quote becomes a blockquote', bodyTags.includes('<blockquote>'), bodyTags.join(''))

// ---- inline links ----
const linked = renderMarkdown('见 [文档](https://example.com/docs) 说明')
const linkTags = tags(linked)
check('a link renders as an anchor', linkTags.includes('<a>'), linkTags.join(''))
check('the anchor keeps its href', flatten(linked).some((piece) => piece === '文档'))
check('the raw link syntax is gone', !texts(linked).join('').includes('](http'))
const unsafe = renderMarkdown('[点我](javascript:alert(1))')
check('a javascript: link is not an anchor', !tags(unsafe).includes('<a>'), tags(unsafe).join(''))
check('an unsafe link keeps its text', texts(unsafe).join('').includes('点我'))

// ---- consecutive quotes merge ----
const quoted = renderMarkdown('> 第一句\n> 第二句')
check('consecutive quote lines merge', tags(quoted).filter((tag) => tag === '<blockquote>').length === 1, tags(quoted).join(''))
check('both quote lines survive', texts(quoted).join('').includes('第一句') && texts(quoted).join('').includes('第二句'))

  const bolded = renderMarkdown('待办：**先做接口**，再补文档。')
  const boldTags = tags(bolded)
  check('bold inside a sentence renders as strong', boldTags.includes('<strong>'), boldTags.join(''))
  check('bold markers do not survive as text', !texts(bolded).join('').includes('**'))

  const list = renderMarkdown('- **第一项**\n- 第二项')
  const listTags = tags(list)
  check('bullet list renders as ul/li', listTags.includes('<ul>') && listTags.includes('<li>'), listTags.join(''))
  check('bold inside a list item renders', listTags.includes('<strong>'), listTags.join(''))

  const ordered = renderMarkdown('1. 一\n2. 二')
  // Literal markers, not <ol>: a second ordered list would restart at 1 and the note would
  // show two items numbered 1. The marker is part of the text now.
  check('numbered lines keep their literal markers', texts(ordered).join('|').includes('1.') && texts(ordered).join('|').includes('2.'), texts(ordered).join('|'))
  check('numbered lines are not an ordered list', !tags(ordered).includes('<ol>'), tags(ordered).join(''))

  const label = renderMarkdown('**待办**\n\n- 一')
  check('a bold-only line becomes a sub-heading', tags(label).includes('<h4>'), tags(label).join(''))
  check('its markers do not survive', !texts(label).join('').includes('**'))

  // ---- the history drawer: the switch must be present and labelled ----
  const { HistoryTab } = internals
  const historyTree = HistoryTab({
    t: {
      all: '全部', tags: '标签', search: '搜索', today: '今天', yesterday: '昨天', earlier: '更早',
      empty: '空', emptySearch: '无匹配', selectHint: '选一条', untitled: '无标题', pin: '置顶', unpin: '取消置顶',
      edit: '编辑', cancel: '取消', save: '保存', delete: '删除', restore: '恢复', edited: '已编辑',
      collapseList: '收起列表', expandList: '展开列表', chars: (n) => `${n} 字`,
      sourcePanel: '面板', sourceCommand: '命令', sourceAgent: '助手', sourceAi: 'AI',
    },
    notes: [{ id: 'n1', title: '测试', body: '正文', tags: ['工作'], pinned: false, updatedAt: new Date().toISOString(), source: 'panel' }],
    tags: [{ tag: '工作', count: 1 }],
    total: 1,
    selectedId: 'n1',
    onSelect: () => {},
    refresh: async () => {},
  })
  const drawer = flatten(historyTree).length > 0
  const drawerLabels = texts(historyTree).filter((text) => text === '收起列表' || text === '展开列表')
  check('history renders the drawer switch', drawer && drawerLabels.length > 0, drawerLabels.join(','))
  const listNode = (function find(node) {
    if (node === null || typeof node !== 'object') return undefined
    if (Array.isArray(node)) {
      for (const child of node) {
        const hit = find(child)
        if (hit !== undefined) return hit
      }
      return undefined
    }
    if ((node.props?.className ?? '').split(' ').includes('dshn-list')) return node
    for (const child of node.children ?? []) {
      const hit = find(child)
      if (hit !== undefined) return hit
    }
    return undefined
  })(historyTree)
  check('the list starts expanded', listNode !== undefined && listNode.props['data-collapsed'] === 'false')

  // A first load that has not finished must not read as "no notes".
  const loadingTree = HistoryTab({
    t: {
      all: '全部', tags: '标签', search: '搜索', today: '今天', yesterday: '昨天', earlier: '更早',
      empty: 'EMPTY', emptySearch: 'NO-MATCH', loading: 'LOADING…', selectHint: 'PICK', untitled: '无标题',
      pin: '置顶', unpin: '取消置顶', edit: '编辑', cancel: '取消', save: '保存', delete: '删除', restore: '恢复',
      edited: '已编辑', collapseList: '收起列表', expandList: '展开列表', chars: (n) => String(n),
      sourcePanel: '面板', sourceCommand: '命令', sourceAgent: '助手', sourceAi: 'AI',
    },
    notes: [],
    tags: [],
    total: 0,
    loading: true,
    selectedId: '',
    onSelect: () => {},
    refresh: async () => {},
  })
  const loadingText = JSON.stringify(loadingTree)
  check('history says loading instead of empty', loadingText.includes('LOADING…'))
  check('history does not claim an empty notebook while loading', !loadingText.includes('EMPTY'))

  // Tags are pills, not hash-prefixed text.
  const hashTexts = texts(historyTree).filter((text) => text.trim().startsWith('#'))
  check('tag pills print no hash sign', hashTexts.length === 0, hashTexts.join(','))

  // The drawer switch must not inherit the transparent ghost button styling.
  function findNodes(node, predicate, out = []) {
    if (node === null || typeof node !== 'object') return out
    if (Array.isArray(node)) {
      for (const child of node) findNodes(child, predicate, out)
      return out
    }
    if (predicate(node)) out.push(node)
    for (const child of node.children ?? []) findNodes(child, predicate, out)
    return out
  }
  const drawerNodes = findNodes(historyTree, (node) => (node.props?.className ?? '') === 'dshn-drawer')
  check('drawer switch exists with its own class', drawerNodes.length === 1, String(drawerNodes.length))
  check('drawer switch carries no ghost class', drawerNodes.every((node) => !String(node.props.className).includes('ghost')))

  const task = renderMarkdown('- [x] 已完成\n- [ ] 未完成')
  const taskItems = (task ?? []).flatMap((block) => (block?.children ?? []).filter((child) => child?.node === 'li'))
  check('task list carries its state', taskItems.some((item) => item.props?.['data-task'] === 'true'))

  // ---- auto-render detection ----
  // Structured input renders by itself; plain prose waits for Format.
  check('a heading counts as structured', looksStructured('## 目标\n\n正文') === true)
  check('a bullet list counts as structured', looksStructured('- 一\n- 二') === true)
  check('a numbered list counts as structured', looksStructured('1. 一\n2. 二') === true)
  check('bold counts as structured', looksStructured('这是 **重点**') === true)
  check('plain prose is not structured', looksStructured('明天下午三点跟 A 组对齐接口') === false)
  check('line breaks alone are not structure', looksStructured('第一行\n第二行\n第三行') === false)
  check('empty text is not structured', looksStructured('   ') === false)

  // ---- assembling a formatted note ----
  // The note's first line is its title, so the title belongs in the result; a body
  // that already restates it must not produce a duplicated opening line.
  check(
    'the title leads the formatted note',
    composeFormattedNote('headline', '## test bullet') === 'headline\n\n## test bullet',
    JSON.stringify(composeFormattedNote('headline', '## test bullet')),
  )
  check(
    'a restated title is not duplicated',
    composeFormattedNote('分三部分看', '分三部分看：\n\n- 一') === '分三部分看：\n\n- 一',
  )
  check(
    'a heading form of the title is not duplicated',
    composeFormattedNote('headline', '# headline\n\n- 一') === '# headline\n\n- 一',
  )
  check('no title leaves the body alone', composeFormattedNote('', '- 一') === '- 一')

  // ---- keeping the section label of a replaced span ----
  // The model rewrites "二、部署脚本" into "部署脚本：…", which silently dropped the number.
  check('the label is detected', sectionLabel('二、部署脚本\n正文')?.prefix === '二、', JSON.stringify(sectionLabel('二、部署脚本')))
  check(
    'a rewritten label keeps its number',
    preserveLabel('二、部署脚本\n正文', '部署脚本：回滚与日志待定\n\n- 列表') === '二、 部署脚本：回滚与日志待定\n\n- 列表',
    JSON.stringify(preserveLabel('二、部署脚本\n正文', '部署脚本：回滚与日志待定\n\n- 列表')),
  )
  check(
    'an unrelated proposal gets the label in front',
    preserveLabel('二、部署脚本\n正文', '回滚与日志待定\n\n- 列表') === '二、部署脚本\n\n回滚与日志待定\n\n- 列表',
  )
  check('an already-numbered proposal is untouched', preserveLabel('二、部署脚本', '二、部署脚本\n\n- 列表') === '二、部署脚本\n\n- 列表')
  check('a span without a label is untouched', preserveLabel('昨天改的脚本', '昨天改的脚本，现在。') === '昨天改的脚本，现在。')
  check('a numbered list marker counts as a label', sectionLabel('1. 第一步')?.prefix === '1.')

  // ---- translation keeps the outline style ----
  // A translation rendered 「二、」 as 「II.」, mixing two numbering systems in one note.
  check(
    'a roman enumerator is replaced by the source label',
    normalizeTranslatedLabel('二、部署脚本\n正文', 'II. Deployment Script\n\n- list') === '二、Deployment Script\n\n- list',
    JSON.stringify(normalizeTranslatedLabel('二、部署脚本\n正文', 'II. Deployment Script\n\n- list')),
  )
  check(
    'an arabic enumerator is replaced too',
    normalizeTranslatedLabel('二、部署脚本', '2. Deployment Script').startsWith('二、'),
  )
  check(
    'a translation without an enumerator gets the label back',
    normalizeTranslatedLabel('二、部署脚本', 'Deployment Script\n\n- list') === '二、部署脚本\n\nDeployment Script\n\n- list',
  )
  check(
    'an already-correct label is left alone',
    normalizeTranslatedLabel('二、部署脚本', '二、Deployment Script') === '二、Deployment Script',
  )
  check('a span without a label keeps the translation untouched', normalizeTranslatedLabel('昨天改的脚本', 'II. The script') === 'II. The script')

  // ---- auto target ----
  check('Chinese text is detected', detectTextLanguage('赵六说加载慢 三秒') === 'zh')
  check('English text is detected', detectTextLanguage('The rollback step is not written') === 'en')
  check('a Chinese note translates into English', resolveTranslateTarget('auto', '赵六说加载慢') === 'English')
  check('an English note translates into Chinese', resolveTranslateTarget('auto', 'The script is not done') === '中文（简体）')
  check('an explicit target wins', resolveTranslateTarget('日本語', '赵六说') === '日本語')

  // ---- numbering ----
  const repeated = ['1. Reimbursement', '1. Deployment Script', '1. Color Scheme'].join('\n')
  check('repeated ones are renumbered', renumberSequence(repeated) === ['1. Reimbursement', '2. Deployment Script', '3. Color Scheme'].join('\n'), JSON.stringify(renumberSequence(repeated)))
  check('a roman outline stays roman', renumberSequence(['I. One', 'I. Two'].join('\n')) === ['I. One', 'II. Two'].join('\n'), JSON.stringify(renumberSequence(['I. One', 'I. Two'].join('\n'))))
  check('lines without enumerators are untouched', renumberSequence('plain\nmore') === 'plain\nmore')

// ---- any marker style, not just 一、 ----
for (const [sample, style] of [
  ['一、报销', 'chinese'],
  ['1. Reimbursement', 'arabic'],
  ['(1) Notes', 'arabic'],
  ['1) Notes', 'arabic'],
  ['a) Notes', 'latin'],
  ['I. Notes', 'roman'],
  ['① 备注', 'circled'],
]) {
  const parsed = parseEnumerator(sample)
  check('parses ' + sample, parsed !== null && parsed.style === style, JSON.stringify(parsed))
}
check('a bullet is not a marker', parseEnumerator('- 一条') === null)
// A rewrite that leaves "**  风险" behind must not print literal asterisks.
// The note that exposed it: three lines indented with spaces, meant as a list.
const indentedNote = [
  '极简笔记理念',
  '',
  '这不是一个新的工具，这是一个关于文字的哲学思考。',
  '    智能不能成为文字的主角',
  '    功能应当服务于思想',
  '    书写带来快乐',
  '当我们对书写既有沉浸式的期待，又希望以最小的 effort 获得最佳体验。',
].join('\n')
const indentedOut = formatLocally(indentedNote)
check('an indented line becomes a bullet', /^- 智能不能成为文字的主角$/m.test(indentedOut), JSON.stringify(indentedOut))
check('every indented line becomes its own bullet', (indentedOut.match(/^- /gm) ?? []).length === 3, JSON.stringify(indentedOut))
check('the prose around it is untouched', indentedOut.includes('这不是一个新的工具') && indentedOut.includes('当我们对书写既有沉浸式的期待'), JSON.stringify(indentedOut))
// A wrapped bullet stays one item: the continuation line follows an item.
const wrapped = ['- 第一条很长', '  接着写同一句'].join('\n')
check('a wrapped bullet stays one item', (formatLocally(wrapped).match(/^- /gm) ?? []).length === 1, JSON.stringify(formatLocally(wrapped)))
// Rendering applies the same rule, so an AI draft with indented lines lists them too.
// Indent is nesting: two items written on separate indented lines must not merge, and a deeper
// indent must come out one level down.
const nested = ['正文', '', '- 甲', '  乙', '    丙'].join('\n')
const nestedOut = formatLocally(nested)
const nestedList = renderMarkdown(nestedOut).find((node) => node.node === 'ul')
const depths = (nestedList?.children ?? []).map((item) => item.props?.['data-depth'] ?? '1')
// 极简写: spaces are structure.
const bulletDraft = ['正文', '', '- 甲'].join('\n')
const continued = internals.continueBulletLine(bulletDraft, bulletDraft.length)
check('Enter continues a bullet at the same level', continued?.text.endsWith('\n- '), JSON.stringify(continued))
const burstOne = internals.spaceBurstLine(continued.text, continued.text.length)
check('a space burst goes one level deeper', burstOne?.text.endsWith('\n  - '), JSON.stringify(burstOne))
const burstTwo = internals.spaceBurstLine(burstOne.text, burstOne.text.length)
check('a second burst goes deeper again', burstTwo?.text.endsWith('\n    - '), JSON.stringify(burstTwo))
// Backspace backs out: one level up, and the first level returns the line to prose.
const caretAtMarker = (value) => {
  const start = value.lastIndexOf('\n') + 1
  const marker = value.slice(start).match(/^\s*- /)
  return start + (marker === null ? 0 : marker[0].length)
}
const deepest = ['正文', '', '- 甲', '    - '].join('\n')
const upOne = internals.backspaceLine(deepest, caretAtMarker(deepest))
check('Backspace backs out one level', upOne?.text.endsWith('\n  - '), JSON.stringify(upOne))
const upTwo = internals.backspaceLine(upOne.text, caretAtMarker(upOne.text))
check('Backspace reaches the first level', upTwo?.text.endsWith('\n- '), JSON.stringify(upTwo))
const asProse = internals.backspaceLine(upTwo.text, caretAtMarker(upTwo.text))
check('the last Backspace turns the bullet back into prose', asProse !== null && /\n$/.test(asProse.text), JSON.stringify(asProse))
// Completion: chunks, document-first priority, and no advice to the model to invent.
const chunked = internals.suggestionChunks('先做压测，再定上线时间。然后同步给李四。')
check('a long suggestion is accepted one chunk at a time', chunked.length === 2, JSON.stringify(chunked))
check('the first chunk is a sentence', chunked[0] === '先做压测，再定上线时间。', JSON.stringify(chunked[0]))
const repeatNote = ['## 会议', '产品上线会议 定在周五', '产品上线会议 的议题是压测'].join('\n')
const repeatAt = repeatNote.lastIndexOf('产品上线') + 4
const repeatHit = internals.repetitionSuggestion(repeatNote, repeatAt)
check('the document answers its own repetition first', repeatHit?.source === 'document', JSON.stringify(repeatHit))
check('the repeated phrase continues, not repeats', repeatHit?.text.includes('会议') === true && repeatHit?.matched === '产品上线', JSON.stringify(repeatHit))
// A suggestion must add, not restate: the reported bug was the last bullet appearing twice.
const listNote = ['关注点', '- 什么是鸿蒙座舱', '- 对新车销量的影响力（定性，非定量）'].join('\n')
// Copy as Markdown: standard syntax another agent can parse.
const copySource = ['鸿蒙座舱 6.0', '', '一、什么是座舱', '二、竞品定位', '1、销量影响', '① 压测'].join('\n')
const copied = internals.toStandardMarkdown(copySource)
check('the copy puts a # heading first', copied.split('\n')[0] === '# 鸿蒙座舱 6.0', JSON.stringify(copied))
check('outline numbering becomes 1.', /^1\. 什么是座舱$/m.test(copied) && /^2\. 竞品定位$/m.test(copied) && /^3\. 销量影响$/m.test(copied), JSON.stringify(copied))
check('a circled marker becomes a bullet', /^- 压测$/m.test(copied), JSON.stringify(copied))
check('nesting survives', internals.toStandardMarkdown(['计划', '', '- 一', '  二'].join('\n')).includes('  - 二'))
check('already-standard markdown is untouched', internals.toStandardMarkdown(['标题', '', '1. 甲', '- 乙'].join('\n')) === '# 标题\n\n1. 甲\n- 乙', JSON.stringify(internals.toStandardMarkdown(['标题', '', '1. 甲', '- 乙'].join('\n'))))
check('an empty note copies nothing', internals.toStandardMarkdown('   ') === '')

check('a suggestion that restates a line is rejected', internals.duplicateSuggestion(listNote, '对新车销量的影响力（定性，非定量）'))
check('a suggestion with a marker is rejected too', internals.duplicateSuggestion(listNote, '- 对新车销量的影响力（定性，非定量）'))
check('a suggestion that repeats the whole phrase is rejected', internals.duplicateSuggestion('今天好累。', '今天好累。'))
check('a genuinely new item is allowed', internals.duplicateSuggestion(listNote, '对渠道与库存的影响') === false)
check('a short fragment is allowed', internals.duplicateSuggestion(listNote, '渠道') === false)

check('a note with nothing repeated has no local answer', internals.repetitionSuggestion('今天好累。', 5) === null)

check('Backspace inside the text is left to the browser', internals.backspaceLine('- 甲乙丙', 6) === null)

// Spaces make a bullet the moment they are typed, however slow the taps were.
check('two spaces make a bullet immediately', internals.autoBulletLine('会议\n  ', 5)?.text === '会议\n- ', JSON.stringify(internals.autoBulletLine('会议\n  ', 5)))
check('four spaces make it nested', internals.autoBulletLine('会议\n    ', 7)?.text === '会议\n  - ', JSON.stringify(internals.autoBulletLine('会议\n    ', 7)))
check('the word after the spaces joins the item', internals.autoBulletLine('会议\n  甲', 6)?.text === '会议\n- 甲', JSON.stringify(internals.autoBulletLine('会议\n  甲', 6)))
check('a mid-line double space is not a bullet', internals.autoBulletLine('会议  甲乙', 7) === null)
check('an existing marker is left alone', internals.autoBulletLine('- 甲\n', 5) === null)
check('the caret lands after the marker', internals.autoBulletLine('会议\n  ', 5)?.caret === 5, String(internals.autoBulletLine('会议\n  ', 5)?.caret))

const promoted = internals.spaceBurstLine('正文文字', 0)
check('two spaces promote a prose line to a bullet', promoted?.text === '- 正文文字', JSON.stringify(promoted))

check('a deeper indent is a nested item', depths.join(',') === '1,2,3', JSON.stringify(depths))
check('indented lines never merge into one bullet', (nestedList?.children ?? []).length === 3, JSON.stringify((nestedList?.children ?? []).length))
const twoWords = ['正文', '', '  安安卓', '    喵喵喵'].join('\n')
const twoList = renderMarkdown(formatLocally(twoWords)).find((node) => node.node === 'ul')
check('a second indented line is its own child', (twoList?.children ?? []).length === 2, JSON.stringify((twoList?.children ?? []).map((item) => item.props?.['data-depth'])))

check('the renderer lists indented lines', renderMarkdown(indentedNote).some((node) => node.node === 'ul'), JSON.stringify(renderMarkdown(indentedNote).map((node) => node.node)))

check('a stray star separator becomes a bullet', normalizeStrayAsterisks('** 风险 环境不稳定') === '- 风险 环境不稳定', JSON.stringify(normalizeStrayAsterisks('** 风险 环境不稳定')))
check('three stars do too', normalizeStrayAsterisks('*** 需要机器') === '- 需要机器', JSON.stringify(normalizeStrayAsterisks('*** 需要机器')))
check('bold emphasis is untouched', normalizeStrayAsterisks('**加粗** 后面有字') === '**加粗** 后面有字', JSON.stringify(normalizeStrayAsterisks('**加粗** 后面有字')))
check('a normal bullet is untouched', normalizeStrayAsterisks('- 一条') === '- 一条')

// The preview mirrors the editor selection by marking the selected lines.
const markedTree = renderMarkdown(['一、报销', '- 发票月底前交', '', '另一段'].join('\n'), new Set(['报销', '发票月底前交']))
const marks = []
const walkMarks = (node) => {
  if (node === null || node === undefined || typeof node === 'string') return
  if (Array.isArray(node)) return node.forEach(walkMarks)
  if (String(node.props?.className ?? '').includes('dshn-preview-mark')) marks.push(node)
  ;(node.children ?? []).forEach(walkMarks)
}
walkMarks(markedTree)
// The busy state is a spinner plus a marquee label, not a progress bar.
const busyTree = internals.PreviewBusy({ label: '正在翻译…' })
check('the busy component has a spinner', JSON.stringify(busyTree).includes('dshn-busy-spinner'))
check('a short label is not duplicated', (JSON.stringify(busyTree).match(/正在翻译…/g) ?? []).length === 1, JSON.stringify(busyTree))
const longBusy = internals.PreviewBusy({ label: '正在翻译，这一步可能要等十几秒' })
check('a long label does not duplicate either', (JSON.stringify(longBusy).match(/正在翻译，这一步可能要等十几秒/g) ?? []).length === 1, JSON.stringify(longBusy))

// The first line is displayed as the note's title; selecting it must highlight the title too,
// otherwise the top line looks unselectable even though it is inside the selection.
const titleTree = internals.renderNoteBody(['今天好累', '早上开会 9:40', '', '报销 1280'].join('\n'), new Set(['今天好累']))
const titleBlock = titleTree.children[0]
check('selecting the first line marks the title', String(titleBlock?.props?.className ?? '').includes('dshn-preview-mark'), JSON.stringify(titleBlock))
const plainTitle = internals.renderNoteBody(['今天好累', '早上开会 9:40'].join('\n'), new Set(['报销 1280']))
check('an unrelated selection leaves the title plain', String(plainTitle.children[0]?.props?.className ?? '').includes('dshn-preview-mark') === false, JSON.stringify(plainTitle.children[0]))

check('a marked line renders inside a mark', marks.length === 2, String(marks.length))
check('an unmarked line stays plain', marks.every((node) => !JSON.stringify(node).includes('另一段')), JSON.stringify(marks))

// ---- Format is mechanical: it tidies, it never rewrites ----
check('format: dashes become bullets', formatLocally(['— 报销', '· 部署', '• 配色'].join('\n')) === ['- 报销', '- 部署', '- 配色'].join('\n'), JSON.stringify(formatLocally(['— 报销', '· 部署', '• 配色'].join('\n'))))
check('format: stray stars become bullets', formatLocally('** 风险 环境\n*** 需要机器') === '- 风险 环境\n- 需要机器', JSON.stringify(formatLocally('** 风险 环境\n*** 需要机器')))
check('format: numbering is made continuous', formatLocally(['1. 一', '1. 二', '1. 三'].join('\n')) === ['1. 一', '2. 二', '3. 三'].join('\n'), JSON.stringify(formatLocally(['1. 一', '1. 二', '1. 三'].join('\n'))))
check('format: chinese numbering keeps its style', formatLocally(['一、甲', '一、乙'].join('\n')) === ['一、甲', '二、乙'].join('\n'), JSON.stringify(formatLocally(['一、甲', '一、乙'].join('\n'))))
check('format: blank lines collapse', formatLocally('a\n\n\n\nb') === 'a\n\nb', JSON.stringify(formatLocally('a\n\n\n\nb')))
check('format: a heading gets a blank line before it', formatLocally('# 标题\n正文').startsWith('# 标题'), JSON.stringify(formatLocally('# 标题\n正文')))
check('format: no leading or trailing blank lines', formatLocally('\n\n正文\n\n') === '正文', JSON.stringify(formatLocally('\n\n正文\n\n')))
check('format: trailing spaces go', formatLocally('一行   \n二行') === '一行\n二行', JSON.stringify(formatLocally('一行   \n二行')))
// Laying out an already-tidy note must change nothing — that is what makes the button safe to press twice.
const tidySample = ['# 缓存优化记录', '', '## 背景', '首 token 平均 1.8 秒。', '', '## 结论', '- 命中缓存 0.4 秒', '- 未命中 1.6 秒'].join('\n')
check('format: is idempotent', formatLocally(formatLocally(tidySample)) === formatLocally(tidySample), JSON.stringify(formatLocally(tidySample)))
check('format: a tidy note is untouched', formatLocally(tidySample) === tidySample, JSON.stringify(formatLocally(tidySample)))
check('format: wording is never rewritten', formatLocally('李四说要压测 但机器不够').includes('李四说要压测'), 'wording changed')
check('prose is not a marker', parseEnumerator('2026 年计划') === null)
// People write times and ratios: neither is an outline marker.
check('a time is not a list marker', parseEnumerator('9:40 站会') === null, JSON.stringify(parseEnumerator('9:40 站会')))
check('a ratio is not a list marker', parseEnumerator('1:2 比例') === null, JSON.stringify(parseEnumerator('1:2 比例')))
check('a colon marker still works', parseEnumerator('1: 第一条') !== null, JSON.stringify(parseEnumerator('1: 第一条')))
// Dashes people actually type.
const dashLines = renderMarkdown(["- 横线", "— 长横", "– 短横", "· 中点", "• 圆点"].join("\n"))
const dashItems = (() => {
  const out = []
  const walk = (node) => {
    if (node === null || node === undefined || typeof node === 'string') return
    if (Array.isArray(node)) return node.forEach(walk)
    if (node.node === 'li') out.push(node)
    ;(node.children ?? []).forEach(walk)
  }
  walk(dashLines)
  return out
})()
check('five kinds of dash become list items', dashItems.length === 5, String(dashItems.length))
check('a heading is not an enumerator', parseEnumerator('# 标题') === null)
check(
  'bracketed numbers renumber in place',
  renumberSequence(['(1) a', '(1) b'].join('\n')) === ['(1) a', '(2) b'].join('\n'),
  JSON.stringify(renumberSequence(['(1) a', '(1) b'].join('\n'))),
)
check(
  'lettered markers renumber in place',
  renumberSequence(['a) one', 'a) two'].join('\n')) === ['a) one', 'b) two'].join('\n'),
  JSON.stringify(renumberSequence(['a) one', 'a) two'].join('\n'))),
)
check(
  'circled markers renumber in place',
  renumberSequence(['① a', '① b'].join('\n')) === ['① a', '② b'].join('\n'),
  JSON.stringify(renumberSequence(['① a', '① b'].join('\n'))),
)
check(
  'conversion to Arabic keeps the text',
  convertEnumerators('（一）报销\n(二) 部署', 'arabic') === '1. 报销\n2. 部署',
  JSON.stringify(convertEnumerators('（一）报销\n(二) 部署', 'arabic')),
)
check('conversion leaves bullets alone', convertEnumerators('- 一条', 'arabic') === '- 一条')

// ---- hierarchy survives translation ----
// A flat English list used to be renumbered 1..6, collapsing 一、/(1)/a)/① into one level.
const draftOutline = ['一、报销', '(1) 发票月底前交', 'a) 金额 1280', '二、部署', '① rollback 未写', '② 日志待发'].join('\n')
const flatTranslation = ['1. Reimbursement', '2. Submit invoices', '3. Amount 1280', '4. Deployment', '5. rollback not written', '6. Logs to be sent'].join('\n')
check('the draft has three levels', JSON.stringify(outlineLevels(outlineEntries(draftOutline))) === '[0,1,2,0,1,1]', JSON.stringify(outlineLevels(outlineEntries(draftOutline))))
const rebuilt = renumberByTemplate(draftOutline, flatTranslation, { latin: true })
const rebuiltLines = rebuilt.split('\n')
check('level one keeps Arabic', rebuiltLines[0].startsWith('1. ') && rebuiltLines[3].startsWith('2. '), JSON.stringify(rebuiltLines))
check('level two keeps brackets', rebuiltLines[1].startsWith('(1) '), JSON.stringify(rebuiltLines[1]))
check('level three keeps letters', rebuiltLines[2].startsWith('a) '), JSON.stringify(rebuiltLines[2]))
check('the circled level restarts', rebuiltLines[4].startsWith('①') && rebuiltLines[5].startsWith('②'), JSON.stringify(rebuiltLines.slice(4)))
check('the translation text is preserved', rebuilt.includes('Submit invoices') && rebuilt.includes('Logs to be sent'))
// A count mismatch falls back to a flat renumber rather than guessing.
check('a mismatched outline falls back', renumberByTemplate(draftOutline, '1. only one', { latin: true }) === '1. only one')

  // Chinese markers are converted before renumbering, so an English outline cannot keep 一、.
  check('Chinese markers become Arabic', convertEnumeratorsToArabic('一、报销\n二、部署脚本') === '1. 报销\n2. 部署脚本', JSON.stringify(convertEnumeratorsToArabic('一、报销\n二、部署脚本')))
  check('English lines are untouched by the converter', convertEnumeratorsToArabic('plain text') === 'plain text')
  check(
    'a Chinese outline ends up sequential',
    renumberSequence(convertEnumeratorsToArabic(['三、配色', '三、其他'].join('\n'))) === '1. 配色\n2. 其他',
    JSON.stringify(renumberSequence(convertEnumeratorsToArabic(['三、配色', '三、其他'].join('\n')))),
  )

  // ---- title line gets heading treatment ----
  const split = splitNoteTitle('headline\n\n- 一\n- 二')
  check('the first line becomes the title', split.title === 'headline', JSON.stringify(split))
  check('the rest keeps the body', split.rest.includes('- 一'), JSON.stringify(split))
  const headingSplit = splitNoteTitle('# headline\n\n正文')
  check('heading marks are stripped from the title', headingSplit.title === 'headline', JSON.stringify(headingSplit))
  const ruled = splitNoteTitle('---\n\nheadline\n\n正文')
  check('a leading rule is not the title', ruled.title === 'headline', JSON.stringify(ruled))
  check('the rule stays in the body', ruled.rest.includes('---'), JSON.stringify(ruled))
  const empty = splitNoteTitle('   ')
  // A note that starts with an outline item has no title line to promote.
  const outlineFirst = splitNoteTitle('1. 报销\n(1) 发票月底前交')
  check('an outline first line is not a title', outlineFirst.title === '', JSON.stringify(outlineFirst))
  check('the outline stays in the body', outlineFirst.rest.startsWith('1. 报销'), JSON.stringify(outlineFirst))
  check('an empty note has no title', empty.title === '', JSON.stringify(empty))
  // The rendered note carries the heading element.
  const noteTree = renderNoteBody('headline\n\n- 一')
  check('the rendered note shows a title heading', JSON.stringify(noteTree).includes('dshn-note-title'))
} finally {
  await rm(fixtures, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
