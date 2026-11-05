// Render-check the browser half without a browser.
// Run with: node test/render.mjs
//
// Loads client.js the way the page does, registers the plugin against a stub
// slot service, and renders the components with a minimal React. Proves the slot
// wiring and that the panel shell renders its tab bar and capture pane. It does
// not prove appearance, nor drive the native Conversation (needs the real host).

import { readFileSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { NoteStore } from '../lib/store.js'

const here = dirname(fileURLToPath(import.meta.url))
const packageDir = join(here, '..')
const vault = join(here, '.render-vault')
const fixtures = join(here, '.render-fixture')

const store = new NoteStore({ ctx: { get: () => undefined }, config: { notesPath: vault } })
const calls = []
globalThis.fetch = async (raw) => {
  calls.push(String(raw))
  const url = new URL(raw, 'http://local')
  if (url.pathname.endsWith('/list')) {
    const data = { ...(await store.list({})), tags: await store.tags(), location: store.location() }
    return { status: 200, json: async () => ({ ok: true, data }) }
  }
  return { status: 200, json: async () => ({ ok: true, data: {} }) }
}

// ---- minimal React: one render = one tree; hooks start fresh --------------

let values = []
let cursor = 0

const React = {
  Fragment: Symbol('Fragment'),
  createElement(type, props, ...children) {
    const flat = children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false)
    if (typeof type === 'function') {
      const saved = cursor
      const allProps = { ...(props ?? {}), children: flat }
      // A class component must be constructed, not called.
      const isClass = typeof type.prototype?.render === 'function'
      const inner = isClass ? new type(allProps).render() : type(allProps)
      cursor = saved
      return inner
    }
    if (type === React.Fragment) return { node: '#fragment', props: {}, children: flat }
    return { node: type, props: props ?? {}, children: flat }
  },
  useState(initial) {
    const at = cursor++
    if (!(at in values)) values[at] = typeof initial === 'function' ? initial() : initial
    return [values[at], (next) => (values[at] = typeof next === 'function' ? next(values[at]) : next)]
  },
  useEffect(effect) {
    return effect()
  },
  useMemo(factory) {
    return factory()
  },
  useCallback(fn) {
    return (...args) => fn(...args)
  },
  Component: class Component {
    constructor(props) {
      this.props = props ?? {}
      this.state = {}
    }
    setState(next) {
      this.state = { ...this.state, ...(typeof next === 'function' ? next(this.state) : next) }
    }
  },
  useRef(initial) {
    return { current: initial }
  },
}

function render(component, props = {}) {
  values = []
  cursor = 0
  return component(props)
}

function findAll(tree, className, found = []) {
  if (tree === null || typeof tree !== 'object') return found
  if (Array.isArray(tree)) {
    for (const item of tree) findAll(item, className, found)
    return found
  }
  if ((tree.props?.className ?? '').split(' ').includes(className)) found.push(tree)
  for (const child of tree.children ?? []) findAll(child, className, found)
  return found
}

// ---- browser globals --------------------------------------------------------

let factory
globalThis.window = {
  __ModuleLoader__: { load: (definition) => { factory = definition.factory } },
  addEventListener() {},
  removeEventListener() {},
}
globalThis.localStorage = { getItem: () => 'zh' }
Object.defineProperty(globalThis, 'navigator', { value: { language: 'zh-CN' }, configurable: true })
globalThis.setInterval = () => 0
globalThis.clearInterval = () => {}
// Ask the client to expose its internals for this test only.
globalThis.__DSH_NOTES_TEST__ = true

let failures = 0
function check(label, condition, detail = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${condition ? '' : `  ${detail}`}`)
  if (!condition) failures += 1
}

const registrations = []

try {
  await store.save({ body: 'first note\nsecond line', tags: ['work'] })
  await store.save({ body: 'a thought from yesterday', source: 'agent' })

  await mkdir(fixtures, { recursive: true })
  await writeFile(join(fixtures, 'client.mjs'), await readFile(join(packageDir, 'client.js'), 'utf8'), 'utf8')
  await import(pathToFileURL(join(fixtures, 'client.mjs')).href)

  const plugin = factory((name) => {
    if (name === 'react') return React
    throw new Error(`unexpected require: ${name}`)
  })
  plugin.apply({
    get: () => undefined,
    sessions: null,
    slots: {
      inject: (_key, callback) => callback(),
      register: (options, component) => {
        registrations.push({ options, component })
        return () => {}
      },
    },
  })

  const ids = registrations.map((entry) => `${entry.options.name}#${entry.options.id ?? entry.options.key}`)
  console.log(`      registrations: ${ids.join(', ')}`)
  check('sidebar icon', ids.includes('sidebar.panellist#notes'))
  check('main panel', ids.includes('main#notes'))
  check(
    'panel declares its board conversation child',
    registrations.some(
      (entry) => entry.options.name === 'main' && entry.options.children?.['notes.board.conversation'] !== undefined,
    ),
  )
  check('embedded conversation surface is registered', ids.includes('notes.board.conversation#undefined'))

  // The occupant must be the surface: only it calls renderFactorySlot. Rendering
  // it with a fake factory is the behavioural way to tell the two apart.
  const surfaceEntry = registrations.find((entry) => entry.options.name === 'notes.board.conversation')
  const factoryCalls = []
  if (surfaceEntry !== undefined) {
    render(surfaceEntry.component, {
      renderFactorySlot: (key) => {
        factoryCalls.push(key)
        return { node: 'div', props: { className: 'fake-factory' }, children: [] }
      },
      renderSlot: () => ({ node: 'div', props: { className: 'fake-view' }, children: [] }),
    })
  }
  check('the conversation slot hosts the surface', factoryCalls.includes('conversation.content'), factoryCalls.join(','))
  // Capture lives in the panel now: the composer icon, the shortcut and the
  // floating card were all removed on purpose.
  check('no composer capture icon', !ids.includes('conversation.input.right#notes-capture'))
  check('no Alt+N shortcut slot', !ids.includes('conversation.composer.dock#notes-shortcut'))
  check('no floating capture card', !ids.includes('shell.overlay#notes-capture-card'))
  check('no popup capture surface', registrations.every((entry) => entry.options.name !== 'shell.overlay'))

  const byKey = (key) => registrations.find((entry) => (entry.options.id ?? entry.options.key) === key).component
  const mainPanel = () => registrations.find((entry) => entry.options.name === 'main').component

  const shell = render(mainPanel(), { children: [] })
  check('panel shell renders a root', findAll(shell, 'dshn-root').length === 1)
  check('three tabs render', findAll(shell, 'dshn-tab').length === 3, String(findAll(shell, 'dshn-tab').length))
  check('capture pane is the default', findAll(shell, 'dshn-capture-pane').length === 1)
  check('capture box renders', findAll(shell, 'dshn-composer').length === 1)
  check('the capture tab requests the page layout', findAll(shell, 'dshn-capture-box')[0]?.props['data-layout'] === 'page')
  check('history is not on the home tab', findAll(shell, 'dshn-history').length === 0)
  check('the data plane was called', calls.some((url) => url.includes('/notes/api/list')))

  // The structuring card sits BELOW the composer, so the box never moves.
  const capturePane = findAll(shell, 'dshn-capture-pane')[0]
  const order = []
  const walk = (node) => {
    if (node === null || typeof node !== 'object') return
    const classes = (node.props?.className ?? '').split(' ')
    for (const name of ['dshn-composer', 'dshn-enhance']) if (classes.includes(name)) order.push(name)
    for (const child of node.children ?? []) walk(child)
  }
  walk(capturePane)
  check('the capture pane emits its composer', order.includes('dshn-composer'), order.join(','))
  // The structuring result renders in the preview page (asserted further down).
  const source = await readFile(join(packageDir, 'src', 'board.js'), 'utf8')

  // The dashboard: tabs, tiles, charts and its chat column.
  const internals = globalThis.__dshNotesInternals
  check('test seam exposes the dashboard', internals !== undefined && typeof internals.DashboardTab === 'function')
  if (typeof internals?.DashboardTab === 'function') {
    const board = render(internals.DashboardTab, {
      t: {
        statNotes: '笔记', statTags: '标签', statChars: '总字数', statStreak: '连续天数',
        statActiveDays: '30 天活跃', statAiCalls: 'AI 调用',
        chartCreated: '新增', chartTags: '标签', chartSources: '来源', chartLengths: '篇幅',
        chartHours: '时段', chartAi: 'AI',
        boardTempCharts: '临时', boardPinnedCharts: '已固定', boardChatTitle: '问数据',
        boardChatHint: '提示', boardChatPlaceholder: '问题', boardChatHintKeys: '回车',
        boardAvgFirst: '首字', ask: '提问', thinking: '思考中…',
      },
      notes: [],
      total: 0,
      onSelectNote: () => {},
    })
    check('dashboard renders its chrome', findAll(board, 'dshn-board').length === 1)
    // Six activity tiles plus the two token tiles.
    check('dashboard renders stat tiles', findAll(board, 'dshn-tile').length === 8, String(findAll(board, 'dshn-tile').length))
    check('dashboard renders charts', findAll(board, 'dshn-chart').length >= 6, String(findAll(board, 'dshn-chart').length))
    check('dashboard has a chat column', findAll(board, 'dshn-board-side').length === 1)
    check('the board has a drag divider', findAll(board, 'dshn-side-resizer').length === 1)
    if (typeof internals?.clampSideWidth === 'function') {
      check('width clamps from below', internals.clampSideWidth(10) === internals.SIDE_WIDTH_MIN, String(internals.clampSideWidth(10)))
      check('width clamps from above', internals.clampSideWidth(9999) === internals.SIDE_WIDTH_MAX, String(internals.clampSideWidth(9999)))
      check('width passes through in range', internals.clampSideWidth(420) === 420, String(internals.clampSideWidth(420)))
      check('the default sits inside the limits', internals.SIDE_WIDTH_DEFAULT > internals.SIDE_WIDTH_MIN && internals.SIDE_WIDTH_DEFAULT < internals.SIDE_WIDTH_MAX)
    }

    // With a session bound and the provider injected, the column hosts the
    // framework conversation instead of the "not injected" hint.
    const bound = render(internals.DashboardTab, {
      t: {
        statNotes: 'n', statTags: 't', statChars: 'c', statStreak: 's', statActiveDays: 'a', statAiCalls: 'ai',
        chartCreated: 'x', chartCalendar: 'y', chartTags: 'z', chartSources: 'p', chartTerms: 'q',
        chartLengths: 'l', chartAi: 'm', boardPinnedCharts: 'pin', boardChatTitle: 'ask',
        boardNoHost: 'NO-HOST', boardStarting: 'starting', boardNotReady: 'not-ready',
        boardFailed: 'FAILED:', boardRetry: 'retry', boardReadOnly: 'RO', aiStart: 'start',
      },
      notes: [],
      total: 0,
      onSelectNote: () => {},
      sessionReference: { ready: Promise.resolve() },
      SessionProvider: (inner) => ({ node: 'div', props: { className: 'fake-provider' }, children: inner.children }),
      renderSlot: (name) => ({ node: 'div', props: { className: 'fake-slot', 'data-slot': name }, children: [] }),
    })
    check('the board hosts the native conversation', findAll(bound, 'fake-provider').length === 1)
    check('the board has a dock for the conversation', findAll(bound, 'dshn-side-dock').length === 1)

    // The AI-usage chart maps action kinds to labels; a missing label table used
    // to crash the board only when that series was non-empty.
    if (typeof internals?.aiUsageSeries === 'function') {
      const series = internals.aiUsageSeries([{ label: 'translate', value: 3 }, { label: 'unknown.kind', value: 1 }])
      check('ai usage maps a known kind to its label', series[0]?.label === '翻译', JSON.stringify(series))
      check('ai usage keeps an unknown kind readable', series[1]?.label === 'unknown.kind', JSON.stringify(series))
      check('ai usage keeps the counts', series[0]?.value === 3 && series[1]?.value === 1)
      check('ai usage tolerates no data', internals.aiUsageSeries(undefined).length === 0)
    }
    check('the board offers a quick-note button', findAll(bound, 'dshn-quick-btn').length === 1)
    check('the quick-note pane starts closed', findAll(bound, 'dshn-quick').length === 0)
    check('the board renders the declared child slot', findAll(bound, 'fake-slot').some((node) => node.props['data-slot'] === 'notes.board.conversation'))
    check('the board does not show the no-host hint', !JSON.stringify(bound).includes('NO-HOST'))

    // A failure explains itself and offers a retry — never an invitation to
    // "start" a conversation that should simply be there.
    const failed = render(internals.DashboardTab, {
      t: {
        statNotes: 'n', statTags: 't', statChars: 'c', statStreak: 's', statActiveDays: 'a', statAiCalls: 'ai',
        chartCreated: 'x', chartCalendar: 'y', chartTags: 'z', chartSources: 'p', chartTerms: 'q',
        chartLengths: 'l', chartAi: 'm', boardPinnedCharts: 'pin', boardChatTitle: 'ask',
        boardNoHost: 'NO-HOST', boardStarting: 'opening', boardFailed: 'FAILED:', boardRetry: 'retry',
        boardReadOnly: 'RO', aiStart: 'start',
      },
      notes: [], total: 0, onSelectNote: () => {},
      sessionReference: undefined, starting: false, sessionError: 'boom',
      SessionProvider: (inner) => ({ node: 'div', props: { className: 'fake-provider' }, children: inner.children }),
      renderSlot: () => ({ node: 'div', props: { className: 'fake-slot' }, children: [] }),
      openSession: async () => {},
    })
    check('a failure names itself', JSON.stringify(failed).includes('FAILED:'), 'no failure text')
    check('a failure offers a retry', JSON.stringify(failed).includes('retry'))
    // The header was trimmed on request: no latency figure, no read-only line.
    check('the header drops the latency figure', !JSON.stringify(bound).includes('首字'))
    check('the header drops the read-only line', !JSON.stringify(bound).includes('RO'))
    // The matrix needs a year of days, which the harness does not fetch, so it
    // is asserted on the renderer directly.
    if (typeof internals?.Heatmap === 'function') {
      const days = []
      for (let offset = 370; offset >= 0; offset -= 1) {
        const day = new Date()
        day.setDate(day.getDate() - offset)
        days.push({ label: day.toISOString().slice(0, 10), value: offset % 4 })
      }
      const matrix = render(internals.Heatmap, { data: days })
      check('the matrix renders', findAll(matrix, 'dshn-heat').length === 1)
      check('the matrix has a legend', findAll(matrix, 'dshn-heat-legend').length === 1)
      check('one cell per day', findAll(matrix, 'dshn-heat-cell').length >= days.length, String(findAll(matrix, 'dshn-heat-cell').length))
      check('the matrix labels the weekdays', findAll(matrix, 'dshn-heat-day').length === 7)
      // Only the week grid: the legend is built from the same cell class.
      const gridOf = (tree) => {
        const weeks = findAll(tree, 'dshn-heat-weeks')[0]
        return weeks === undefined ? [] : findAll(weeks, 'dshn-heat-cell')
      }
      const levels = new Set(gridOf(matrix).map((cell) => cell.props['data-level']))
      check('the matrix quantises intensity', levels.size >= 3, [...levels].join(','))

      // GitHub's palette, and the rule that a uniformly quiet notebook does not
      // paint every day in the darkest green.
      const source = readFileSync(join(packageDir, 'src', 'head.js'), 'utf8')
      check('the matrix uses the GitHub ramp', source.includes('--dshn-heat-4: #216e39'), 'missing light palette')
      check('the matrix has a dark ramp', source.includes('--dshn-heat-4: #39d353'), 'missing dark palette')
      const flatMatrix = render(internals.Heatmap, {
        data: days.map((day) => ({ label: day.label, value: day.value > 0 ? 1 : 0 })),
      })
      const flatLevels = new Set(gridOf(flatMatrix).map((cell) => cell.props['data-level']))
      check('a uniform notebook uses one shade', !flatLevels.has('4'), [...flatLevels].join(','))
      check('the darkest shade is reserved for the busiest days', levels.has('4'), [...levels].join(','))
      const empty = render(internals.Heatmap, { data: [] })
      check('an empty matrix says so', findAll(empty, 'dshn-heat').length === 0)
    }
  }

  // The AI draft card follows the layout: below on the page, above in the column.
  if (typeof internals?.CaptureBox === 'function') {
    const captureProps = {
      t: {
        composePlaceholder: 'p', enhance: 'e', enhancing: 'ing', enhanceHint: 'h', enhanceFailed: 'f',
        enhanceSlow: (n) => String(n), enhanceTitle: 'title', enhanceSub: 'sub', enhanceTags: 'tags',
        enhanceNotes: 'notes', enhanceKeepSource: 'keep', enhanceSave: 'save', enhanceDiscard: 'discard',
        chars: (n) => String(n), save: 'save', saving: 'saving', saved: 'saved', cancel: 'cancel',
        enhanceOpenSession: 'open', savedIn: 'in',
      },
      onSaved: async () => {},
    }
    const box = render(internals.CaptureBox, captureProps)
check('the capture box has no Format action', findAll(box, 'dshn-btn').some((node) => String(node.props.className).includes('format')) === false)
    // 记录 page: source left, preview right. Board quick note: preview above the input.
    const sheetsOf = (tree) => findAll(tree, 'dshn-sheet')
    // 记录 passes layout:'page'; the board's quick note passes nothing at all, which was the bug:
    // the ordering test supplied 'compact' explicitly and never covered the real call.
    const withDraft = { ...captureProps, initial: '正文一段' }
    const pageBox = render(internals.CaptureBox, { ...withDraft, layout: 'page' })
    const quickBox = render(internals.CaptureBox, { ...withDraft })
    const pageSheets = sheetsOf(pageBox).map((node) => node.props['data-role'])
    const quickSheets = sheetsOf(quickBox).map((node) => node.props['data-role'])
    check('the page keeps the source first', pageSheets[0] === 'source', JSON.stringify(pageSheets))
    check('a capture box with no layout previews first', quickSheets[0] === 'render', JSON.stringify(quickSheets))
    check('both panes render both sheets', pageSheets.length >= 2 && quickSheets.length >= 2, JSON.stringify([pageSheets, quickSheets]))
    check('the capture box is a live editor', findAll(box, 'dshn-composer')[0]?.props['data-structured'] === 'false')
    // Plain text shows no mirror; structured text renders one beside the source.
    const plainBox = render(internals.CaptureBox, { ...captureProps, layout: 'page' })

    // The mirror is emitted by the same component and gated by the detector; the
    // detector itself is covered in the markup test.
    const boardSource = await readFile(join(packageDir, 'src', 'board.js'), 'utf8')
    check('plain input has a rendered mirror', /const laidOut = formatLocally\(draft\)/.test(boardSource))
    check('the capture box can emit a rendered mirror', boardSource.includes("className: 'dshn-page-render'"))
    // Language control lives on the structuring card, not in the toolbar.
    check('the toolbar no longer offers a language picker', boardSource.includes('title: t.targetLang') === false)
    check('translate lives on the structuring toolbar', /runTranslate\(\)/.test(boardSource) && /renderTools[\s\S]{0,2600}runTranslate\(\)/.test(boardSource))
    check('the draft card offers a translate target', boardSource.includes('t.translateAuto'))
    check('the translate target defaults to mutual ZH<->EN', boardSource.includes("entry.id === 'auto' ? t.translateAuto"))

    // Format: a proposal in the render area, not a rewrite of the source.
    check('format no longer prepends a title line', boardSource.includes("title + '\\n\\n' + body") === false)
check('the preview is not stored as a proposal', boardSource.includes('setFormatted(') === false)
    check('there is no format proposal to apply', boardSource.includes('applyFormatted') === false)
    check('a selection is remembered', boardSource.includes('selectionStart'))
    check('a proposal splices into the document', boardSource.includes('renderProposalDocument'))
    // Regression: splicing twice duplicated the whole document inside the tinted block.
check('the layout preview is computed locally', /const laidOut = formatLocally\(draft\)/.test(boardSource))

    // A ranged proposal keeps the source label only: the model title repeated it.
    // Format no longer calls the model: it lays the span out locally, so it cannot invent a title.
    check('a ranged structure has no separate title', /title: range === null \? rawTitle : ''/.test(boardSource))
    check('the preview does not recompose', /const structureText = enhance === null \? '' : enhance\.body/.test(boardSource))
    check('applying does not recompose', /const text = enhance\.body/.test(boardSource))

    // Translation numbering follows the scope.
    check('translate refuses to run without a draft', /const runTranslate = async \(\) => \{\s*if \(enhance === null/.test(boardSource))
    check('a partial translation keeps the source numbering', /if \(partial\) return normalizeTranslatedLabel\(spanText, raw\)/.test(boardSource))
    check('a whole translation rebuilds from the draft template', /renumberByTemplate\(enhance\.draftText \?\? enhance\.body, raw, \{ latin: latinTarget \}\)/.test(boardSource))
    check('the label shows translation progress', boardSource.includes('translateSeconds'))
    check('a whole-note translation keeps its levels', boardSource.includes('renumberByTemplate'))
    check('the target follows the source language', boardSource.includes('resolveTranslateTarget('))
    check('the translation streams while rendering', boardSource.includes("if (event === 'delta')") && boardSource.includes('lastPaint'))
    // Structure never translates; Translate works on the structuring result when present.
    check('translation reads the structuring draft', /const sourceText = enhance\.body\.trim\(\)/.test(boardSource))
check('the preview can translate the note itself', /const runPreviewTranslate = async/.test(boardSource))
    check(
      'translate falls back when the host rejects lines',
      /rejectedIndexed/.test(boardSource) && /useIndexed = false/.test(boardSource) && /text: sourceText/.test(boardSource),
    )
    check('a translation replaces the draft body', /setEnhance\(\{ \.\.\.enhance, title: '', body: assembled \}/.test(boardSource))
    // Translation is a proposal on the source, not on a structuring result.
    // Structure never translates; Translate works on the structuring result when present.
    check('translation is not a separate proposal', boardSource.includes("kind: 'translate'") === false)
    check('the preview label says whether layout changed', /layoutChanged \? t\.formattedPreview : t\.rendered/.test(boardSource))

// Regression: the picker leaked into Structure, so an English target produced an English
// title above a Chinese body.
    // The call carries the text and the scope; the target language belongs to Translate only.
    check('structure sends no target language', /streamEvents\('\/enhance\/stream', \{ text, scope \}/.test(boardSource) && /enhance\/stream[\s\S]{0,80}language/.test(boardSource) === false)
    check('structure is the only structuring caller', (boardSource.match(/streamEvents\('\/enhance\/stream'/g) ?? []).length === 1)
check('the picker feeds both translate flows', (boardSource.match(/resolveTranslateTarget\(/g) ?? []).length >= 2)
    check('the client states whether to keep numbering', boardSource.includes('keepNumbering: partial'))
    check('translation uses its own route', boardSource.includes("'/translate/stream'"))
    // The wrapper words of the copilot prompt used to be translated along with the note.
    check('translation does not go through the structuring prompt', boardSource.includes("action: 'translate'") === false)
    const chatSource = await readFile(join(packageDir, 'lib', 'chat.js'), 'utf8')
    check('the translate prompt has no wrapper labels', /streamTranslate[\s\S]{0,1600}只输出译文本身|streamTranslate[\s\S]{0,1600}逐行翻译/.test(chatSource))
check('the layout preview is rendered whole', /renderNoteBody\(laidOut, markSet\)/.test(boardSource))
    check('the rewritten span is tinted in the preview', boardSource.includes("className: 'dshn-proposal-mark'"))
    const headCss = await readFile(join(packageDir, 'src', 'head.js'), 'utf8')
    check('the preview tint uses the same green as the source', /\.dshn-proposal-mark \{[^}]*background: var\(--dshn-heat-1\)/s.test(headCss))
    check('the preview tint has no border', /\.dshn-proposal-mark \{[^}]*border:/s.test(headCss) === false)
    check('the preview never scrolls sideways', /\[data-role='render'\] \.dshn-page-render \{[^}]*overflow-x: hidden/s.test(headCss))
    check('the tint does not bleed sideways', /\.dshn-proposal-mark \{[^}]*margin: 2px 0/s.test(headCss))
    check('the proposal has no tinted box', boardSource.includes("className: 'dshn-format-mark'") === false)
    check('the source still marks the range', boardSource.includes("className: 'dshn-editor-mark'") === true)
check('the preview label distinguishes changed layout', boardSource.includes('t.formattedPreview'))

    // The preview lives beside the source, so both are visible at once.
    const headString = () => headCss
const headSource = await readFile(join(packageDir, 'src', 'head.js'), 'utf8')
    check('the page flags a split layout', boardSource.includes("'data-split': showRender ? 'true' : 'false'"))
    check('the sheets sit side by side', /\.dshn-sheets \{[^}]*flex-direction: row/s.test(headSource))
    check('both sheets share one basis', headSource.includes('flex: 0 1 820px'))
    check('the source sheet carries the toolbar', headSource.includes("[data-role='source'] .dshn-capture-tools"))
    check('narrow windows stack the sheets', /\.dshn-sheets \{[^}]*flex-direction: column/s.test(headSource.split('@media (max-width: 1180px)')[1] ?? ''))
    check('a sheet is emitted for the source', boardSource.includes("'data-role': 'source'"))
    check('a sheet is emitted for the preview', boardSource.includes("'data-role': 'render'"))
    // Structure reuses the preview page: rendered result, toolbar in the same footer.
    check('structure renders into the preview page', boardSource.includes('structureText'))
    check('the preview page carries a toolbar', boardSource.includes("'data-role': 'render' }, renderNode, renderTools"))
    check('the source page and preview page share the footer style', /\[data-role='render'\] \.dshn-capture-tools/s.test(headSource))
    check('the draft card is gone', boardSource.includes('dshn-enhance') === false)

    // Structure respects the selection exactly like Format does.
    check('one helper defines the selected range', boardSource.includes('const editorRange = () =>'))
    check('structure uses the shared range', /const runEnhance = async \(\) => \{[\s\S]{0,420}editorRange\(\)/.test(boardSource))
check('the live preview needs no range', boardSource.includes('const runFormat') === false)
    check('the selected span is highlighted', boardSource.includes("className: 'dshn-editor-mark'"))
    check('the preview translates the selection', /const span = range === null \? draft : draft\.slice\(range\.start, range\.end\)/.test(boardSource))
    check('the preview applies a translation to the selected span', /spliceRange\(draft, start, end, preview\.text\)/.test(boardSource))
    check('the selection marks the preview lines', /linesInRange\(draft, selected\.start, selected\.end\)/.test(boardSource))
    // A highlighter stroke in the palette's light green, not an underline.
    check('the mark uses the light green palette', /\] \.dshn-editor-mark \{[^}]*background: var\(--dshn-heat-1\)/s.test(headSource) || /\.dshn-editor-mark \{[^}]*background: var\(--dshn-heat-1\)/s.test(headSource))
    check('the mark is not an underline', /\.dshn-editor-mark \{[^}]*border-bottom/s.test(headSource) === false)
    // The preview states the scope in characters, so it can be checked against the counter.
    check('the preview reports the sent size', boardSource.includes('sentChars'))
    check('the highlight clears with the selection', /activeRange =\s*[\s\S]{0,320}null/.test(boardSource))
    check('a structuring result remembers its range', boardSource.includes('range,'))
    check('a structuring result can be applied', boardSource.includes('applyEnhance'))
    check('apply replaces only the selected span', /draft\.slice\(0, enhance\.range\.start\)/.test(boardSource))
    check('the structure button names its scope', boardSource.includes('t.structureSelection'))
    // The band reported "未出现" on translations, where words are meant to change.
    check('no fidelity band is rendered', /dshn-fidelity'/.test(boardSource) === false, 'the band is still rendered')
    // Progress is motion, not half-written Markdown.
    check('deltas are not painted', (boardSource.match(/setEnhance\(\{ \.\.\.enhance, title: '', body: buffer \}\)/g) ?? []).length === 0)
    // The page kept rendering the document while a call was running; a busy page lost the text
    // the reveal was supposed to replace.
    check('the document is not replaced while a call runs', /: busy !== ''\s*\?\s*h\(\s*'div',\s*\{\s*className: 'dshn-page-render'/.test(boardSource) === false)
check('the busy chip replaces the translate button', /translating\s*\?\s*busyChip\('translate'\)/.test(await readFile(join(packageDir, 'src', 'board.js'), 'utf8')))
    check('only one busy chip is rendered', (String(boardSource).match(/busyChip\(/g) ?? []).length === 2, 'expected one per toolbar')
    check('the reveal animation is keyed', /key: 'draft-' \+ wipe/.test(boardSource) && /key: 'page-' \+ wipe/.test(boardSource))
    check('the selection translate splices the whole note', /spliceRange\(draft, preview\.range\.start, preview\.range\.end, preview\.text\)/.test(boardSource))
    check('the splice is laid out before rendering', /const previewLayout = preview === null \? '' : formatLocally\(previewSpliced\)/.test(boardSource))
    check('a structuring failure stays visible', boardSource.includes('enhanceError !== \'\'') && boardSource.includes("className: 'dshn-err'"))
    check('the failure keeps the preview page open', /const hasContent =[\s\S]{0,200}enhanceError !== ''/.test(boardSource) && /const showRender = hasContent && previewOpen/.test(boardSource))
    check('an empty draft shows no preview page', /const showRender = hasContent && previewOpen/.test(boardSource))
    check('the preview can be put away by hand', /previewOpen/.test(boardSource) && /dshn-preview-handle/.test(boardSource) && /aria-expanded': String\(previewOpen\)/.test(boardSource))
    check('the handle sits on the seam, not in the toolbar', /\.dshn-preview-handle \{[^}]*position: absolute/.test(headCss) && /data-role': 'preview-toggle'/.test(boardSource) === false)
    check('Structure opens the pane', /setPreviewOpen\(true\)[\s\S]{0,260}\/\/ Same rule as Format/.test(boardSource))
    check('a hidden preview keeps its column', /data-hidden': 'true'/.test(boardSource) && /\[data-hidden='true'\]/.test(headCss))
    check('hiding does not stretch the editor', /\[data-mode='single'\] \.dshn-sheet \{ flex: 1 1 auto; max-width: none/.test(headCss) === false)

    check('a lone sheet takes the row', /data-mode': showRender \? 'split' : 'single'/.test(boardSource) && /data-mode='single'\] \.dshn-sheet/.test(headCss))
    // Both pages end on the same line, and the preview scrolls inside its own page.
    const sheetRule = headSource.slice(headSource.indexOf("[data-layout='page'] .dshn-sheet {"))
    check('a page has a definite height', /height: min\(78vh, 980px\)/.test(sheetRule.slice(0, 400)))
    check('the preview page scrolls', /\[data-role='render'\] \.dshn-page-render \{[^}]*overflow-y: auto/s.test(headSource))
    check('the preview fills its page', /\[data-role='render'\] \.dshn-page-render \{[^}]*flex: 1 1 auto/s.test(headSource))
    // The old inline-mirror rule capped the preview at 42vh; the page layout must reset it.
    check('the page preview is not capped', /\[data-role='render'\] \.dshn-page-render \{[^}]*max-height: none/s.test(headSource))
    check('the page preview has no top offset', /\[data-role='render'\] \.dshn-page-render \{[^}]*margin-top: 0/s.test(headSource))
    check('no permanent storage line is printed', boardSource.includes('t.savedIn +') === false)
    check('the sheets stretch to one height', /\.dshn-sheets \{[^}]*align-items: stretch/s.test(headSource))
    check('the preview only appears with content', boardSource.includes('const showRender ='))
check('the preview always mirrors the draft', /draft\.trim\(\) !== '' \|\|/.test(boardSource))
    check('the capture box starts compact unless asked for a page', findAll(box, 'dshn-capture-box')[0]?.props['data-layout'] === 'compact')
    const asPage = render(internals.CaptureBox, { ...captureProps, layout: 'page' })
    check('the 记录 tab gets the page layout', findAll(asPage, 'dshn-capture-box')[0]?.props['data-layout'] === 'page')
    // The switch lives in the shared toolbar, so the history editor (same box, page layout) has it too.
    check('the switch is in the shared toolbar', findAll(asPage, 'dshn-switch').length === 1, String(findAll(asPage, 'dshn-switch').length))
    check('the switch is in the compact toolbar as well', findAll(box, 'dshn-switch').length === 1, String(findAll(box, 'dshn-switch').length))
    check('one preference store for both', (headSource.match(/notes\.autoWrite/g) ?? []).length === 1 && /storedAutoWrite/.test(boardSource))
    // Editing a note mounts the same capture components: no second editor, no sidebar.
    const captureSource = await readFile(join(packageDir, 'src', 'board.js'), 'utf8')
    const panelSource = await readFile(join(packageDir, 'src', 'panel.js'), 'utf8')
    check('editing reuses the capture box', /initial: selected\.body/.test(panelSource) && /noteId: selected\.id/.test(panelSource), 'panel.js does not bind the capture box')
    check('the capture box can edit an existing note', captureSource.includes("put('/note/' + encodeURIComponent(props.noteId)"))
    check('the capture box skips the create call when bound', captureSource.includes('props.noteId === undefined'))
    check('cancel can leave a bound editor', captureSource.includes('props.onCancel'))
    check('no copilot sidebar remains', /CopilotSidebar|dshn-copilot/.test(captureSource) === false && /CopilotSidebar/.test(panelSource) === false)
    // Saving stores the laid-out text on every path (create, edit, structured, quick note), so the
    // right page is a promise and reopening a note shows exactly what was saved.
    const saveSites = boardSource.match(/post\('\/note'|put\('\/note/g) ?? []
    check('every save path stores the laid-out text', /{ body,/.test(boardSource) && /body: draft/.test(boardSource) === false, 'a save still sends the raw draft')
    check('the quick note is formatted too', /const body = formatLocally\(quickText\)\.trim\(\)/.test(boardSource))
    check('the structured save formats its body', /const structured = formatLocally\(enhance\.body\)\.trim\(\)/.test(boardSource))
    check('editing keeps the stored text on screen', /setDraft\(body\)/.test(boardSource))
    // History ergonomics: a draggable column, two-line cards, and the width remembered.
    check('the note list can be widened', /dshn-splitter/.test(panelSource) && /--dshn-list-width/.test(panelSource))
    check('the list width is remembered', /dshn\.history\.listWidth/.test(panelSource))
    check('cards clamp to two lines', /line-clamp: 2/.test(headCss) && /-webkit-line-clamp: 2/.test(headCss))
    // Completion: a 1s pause while typing, TAB takes a chunk, the chunk stays selected.
    // 极简写: spaces are checked on input, not only inside a fast-burst handler.
    // The history detail bar: title left, a quiet action group right.
    // Collapsing the drawer must hand the width to the detail column, not keep a blank strip.
    check('the collapsed drawer frees its width', /\.dshn-list\[data-collapsed="true"\] \{[^}]*width: 0/.test(headCss) && /data-collapsed="true"\] \.dshn-list \{ width: auto/.test(headCss) === false)

    // Copy as Markdown, beside Edit: the note goes to an agent with standard syntax.
    check('the copy button sits next to Edit', /copyMarkdown/.test(panelSource) && /toStandardMarkdown/.test(panelSource) && /t\.copyMarkdown/.test(panelSource))
    // The blurred/duplicated text under a line: a ghost drawn inside a range. A range is not a
    // continuation, so the suggestion goes away when one exists.
    check('a range ends the suggestion', (boardSource.match(/if \(end > start\) dismissGhost\(\)/g) ?? []).length === 3)
    check('structuring clears the suggestion', /const runEnhance = async \(\) => \{[\s\S]{0,260}dismissGhost\(\)/.test(boardSource))

    // One highlight at a time: the author's selection outranks the span TAB inserted earlier.
    // The range branch returns before the accepted branch: one highlight, and it is the author's.
    check('the selection wins over the accepted mark', /const liveRange = fits\(range\) && range\.end > range\.start \? range : null/.test(headSource) && headSource.indexOf('if (liveRange !== null)' ) < headSource.indexOf('if (liveAccepted !== null)'))
    check('selecting text ends the accepted span', /if \(end > start && accepted !== null && \(accepted\.start !== start \|\| accepted\.end !== end\)\) setAccepted\(null\)/.test(boardSource))

    // The blurred double text: an overlay left over from a cleared draft painted over the placeholder.
    // An overlay whose offsets do not fit the text is not drawn (the blurred double characters).
    check('a stale overlay is not painted', /const fits = \(span\) =>[\s\S]{0,300}span\.end <= text\.length/.test(headSource))
    check('the mirror asks the model for what to draw', /mirrorSegments\(\{ draft, ghost, accepted, range: activeRange \}\)/.test(boardSource))
    check('saving clears every overlay', /const clearOverlays = \(\) => \{/.test(boardSource) && (boardSource.match(/clearOverlays\(\)\s*\n\s*setDraft/g) ?? []).length >= 1)

    check('copying shows a tick', /dshn-copy-check/.test(panelSource) && /copied\s*\n\s*\? h\(/.test(panelSource))
    check('the tick pops, with a reduced-motion exit', /@keyframes dshn-copy-pop/.test(headCss) && /prefers-reduced-motion: reduce[\s\S]{0,120}dshn-copy-check \{ animation: none/.test(headCss))

    check('copying says it worked', /setCopied\(true\)/.test(panelSource) && /1000|1400/.test(panelSource) && /data-copied/.test(panelSource))

    check('the detail actions sit on the right', /dshn-detail-actions/.test(panelSource) && /dshn-grow/.test(panelSource.slice(panelSource.indexOf('dshn-detail-bar'), panelSource.indexOf('dshn-detail-bar') + 1200)))
    check('the bar is a flex row', /\.dshn-detail-bar \{[^}]*display: flex/.test(headCss) && /\.dshn-detail-bar \{[^}]*align-items: center/.test(headCss))
    check('pin and delete are icon buttons with labels', /dshn-icon-btn/.test(panelSource) && /aria-label/.test(panelSource.slice(panelSource.indexOf('dshn-icon-btn') - 400, panelSource.indexOf('dshn-icon-btn') + 900)))
    check('edit is the only primary action', /dshn-btn primary dshn-detail-edit/.test(panelSource))
    check('the quiet style skips the primary button', /\.dshn-detail-bar \.dshn-btn:not\(\.primary\)/.test(headCss))
    check('the delete icon only reddens on hover', /\.dshn-icon-btn\.dshn-danger:hover/.test(headCss))

    check('a slow double tap still makes a bullet', /autoBulletLine\(value, caret\)/.test(boardSource))
    check('the burst window tolerates a real double tap', /< 400\)/.test(boardSource))

    // Auto-write: a switch in the capture toolbar, green when suggestions are live.
    check('the toolbar has an auto-write switch', /dshn-switch/.test(boardSource) && /role: 'switch'/.test(boardSource) && /aria-checked/.test(boardSource))
    check('the switch turns green when on', /\.dshn-switch\[data-on="true"\] \.dshn-switch-track \{ background: var\(--dsw-alias-state-success-primary\)/.test(headCss))
    check('the preference survives a reload', /notes\.autoWrite/.test(headString()) && /storedAutoWrite/.test(boardSource))
    check('auto-write off means no timer', /if \(autoWrite === false\) return/.test(boardSource) && /scheduleCompletion/.test(boardSource))

    // Staleness: opening the plugin or switching tabs must read the notebook, not wait for the poll.
    check('a tab switch refreshes', /useEffect\(\(\) => \{\n\s*void refresh\(\)\n\s*\}, \[tab, refresh\]\)/.test(panelSource))
    check('the window regaining focus refreshes', /addEventListener\('focus', onFocus\)/.test(panelSource))
    check('the page becoming visible refreshes', /addEventListener\('visibilitychange', onVisible\)/.test(panelSource))
    check('the store reloads when the files change', /async isStale\(\)/.test(await readFile(join(packageDir, 'lib', 'store.js'), 'utf8')))

    check('completion waits for a pause', /1000\)/.test(boardSource) && /scheduleCompletion/.test(boardSource))
    check('completion fires wherever the caret stopped', /atSentenceBoundary/.test(boardSource) === false && /Typing is what stops/.test(boardSource))
    check('TAB takes one chunk', /acceptGhostChunk\(\)/.test(boardSource) && /event\.key === 'Tab'/.test(boardSource))
    // Enter finishes the line: the mark goes, the caret moves, the next ask happens there.
    check('Enter accepts the chunk and moves on', /setAccepted\(null\)\n\s*setGhost\(null\)\n\s*const next = continueBulletLine/.test(boardSource))
    check('the next suggestion is asked at the new caret', /commitLine\(next\)\) scheduleCompletion\(next\.caret\)/.test(boardSource))
    check('a moved caret drops a stale suggestion', /const followCaret = \(caret\) => \{/.test(boardSource) && /followCaret\(event\.target\.selectionStart/.test(boardSource))
    check('Backspace only undoes a chunk the caret is inside', /caret >= accepted\.start && caret <= accepted\.end/.test(boardSource))

    // A chunk is placed through insertChunkAt (a marker must not land mid-sentence), and the
    // accepted span it reports is what Backspace removes.
    check('the inserted chunk can be undone in one key', /const placed = insertChunkAt\(value, at, chunk\)/.test(boardSource) && /const end = placed\.end/.test(boardSource) && /accepted\.start\) \+ value\.slice\(accepted\.end\)/.test(boardSource))
    check('an accepted chunk is drawn with the plugin mark', /dshn-mark-accepted/.test(boardSource) && /\.dshn-mark-accepted \{/.test(headCss))
    check('TAB never leaves the editor', /if \(event\.key === 'Tab'\) \{\s*\n\s*\/\/ TAB belongs to completion/.test(boardSource) && /event\.preventDefault\(\)/.test(boardSource))
    check('TAB with the switch off spends nothing', /if \(autoWrite === false\) return/.test(boardSource))
    check('pausing after an accept asks again', /setGhost\(null\)\n\s*scheduleCompletion\(end\)/.test(boardSource))
    check('the ghost is styled as a suggestion', /\.dshn-ghost \{/.test(headCss))

    // A point colour reaches the inline style of the bar, the pie arc and the stat number.
    check('the bar fill takes the point colour', /background: chartColor\(row, ''\)/.test(boardSource))
    check('the pie arc takes the point colour', /stroke: chartColor\(row,/.test(boardSource))
    check('the line takes the first point colour', /stroke: chartColor\(rows\[0\],/.test(boardSource))
    check('the stat number takes the point colour', /color: chartColor\(first, ''\)/.test(boardSource))
    check('the colour resolver only accepts safe shapes', /function chartColor\(point, fallback\)/.test(headSource) && /rgba\|hsl\|hsla/.test(headSource))

    check('the actions are readable buttons', /\.dshn-capture-tools \.dshn-btn \{ padding: 3px 10px; font-size: 12px/.test(headCss) && /\.dshn-capture-tools \.dshn-btn,[\s\S]{0,80}white-space: nowrap/.test(headCss))

    check('all four save paths remain', saveSites.length === 4, String(saveSites.length))
  }

} finally {
  await rm(vault, { recursive: true, force: true })
  await rm(fixtures, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
