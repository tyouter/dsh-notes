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
      const series = internals.aiUsageSeries([{ label: 'copilot.polish', value: 3 }, { label: 'unknown.kind', value: 1 }])
      check('ai usage maps a known kind to its label', series[0]?.label === '润色', JSON.stringify(series))
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
    check('the capture box is a live editor', findAll(box, 'dshn-composer')[0]?.props['data-structured'] === 'false')
    // Plain text shows no mirror; structured text renders one beside the source.
    const plainBox = render(internals.CaptureBox, { ...captureProps, layout: 'page' })
    check('plain input has no rendered mirror', findAll(plainBox, 'dshn-page-render').length === 0)

    // The mirror is emitted by the same component and gated by the detector; the
    // detector itself is covered in the markup test.
    const boardSource = await readFile(join(packageDir, 'src', 'board.js'), 'utf8')
    check('the capture box can emit a rendered mirror', boardSource.includes("className: 'dshn-page-render'"))
    // Language control lives on the structuring card, not in the toolbar.
    check('the toolbar no longer offers a language picker', boardSource.includes('title: t.targetLang') === false)
    check('translate lives on the structuring toolbar', /renderTools[\s\S]{0,1200}runTranslate\(\)/.test(boardSource))
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
    check('there is no source-translation path', /const sourceText = enhance\.body\.trim\(\)/.test(boardSource) && (boardSource.match(/const sourceText =/g) ?? []).length === 1)
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
check('structure sends no target language', boardSource.includes("streamEvents('/enhance/stream', { text }"))
check('structure is the only structuring caller', (boardSource.match(/streamEvents\('\/enhance\/stream', \{ text \}/g) ?? []).length === 1)
check('the picker is only read by translate', (boardSource.match(/TARGET_LANGUAGES\.find/g) ?? []).length === 1)
    check('the client states whether to keep numbering', boardSource.includes('keepNumbering: partial'))
    check('translation uses its own route', boardSource.includes("'/translate/stream'"))
    // The wrapper words of the copilot prompt used to be translated along with the note.
    check('translation no longer goes through the copilot prompt', boardSource.includes("action: 'translate'") === false)
    const chatSource = await readFile(join(packageDir, 'lib', 'chat.js'), 'utf8')
    check('the translate prompt has no wrapper labels', /streamTranslate[\s\S]{0,1600}只输出译文本身|streamTranslate[\s\S]{0,1600}逐行翻译/.test(chatSource))
check('the layout preview is rendered whole', /renderNoteBody\(laidOut\)/.test(boardSource))
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
    check('structure uses the shared range', /const runEnhance = async \(\) => \{[\s\S]{0,220}editorRange\(\)/.test(boardSource))
check('the live preview needs no range', boardSource.includes('const runFormat') === false)
    check('the selected span is highlighted', boardSource.includes("className: 'dshn-editor-mark'"))
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
    check('a structuring failure stays visible', boardSource.includes('enhanceError !== \'\'') && boardSource.includes("className: 'dshn-err'"))
    check('the failure keeps the preview page open', /const showRender =[\s\S]{0,400}enhanceError !== ''/.test(boardSource))
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
  }

  // The copilot beside an open note.
  if (typeof internals?.CopilotSidebar === 'function') {
    const copilot = render(internals.CopilotSidebar, {
      t: {
        copilotTitle: 'Copilot', copilotHide: '收', copilotShow: '展',
        copilotComplete: '续写', copilotPolish: '润色', copilotTranslate: '翻译',
        copilotExpand: '展开', copilotSummarize: '摘要', copilotAsk: '提问',
        copilotAskPlaceholder: '问…', copilotHint: '提示', copilotSelectionHint: '只处理选中',
        copilotWholeHint: '处理整篇', copilotSelection: (n) => n + ' 字', copilotWhole: '整篇',
        copilotClear: '清空', copilotAppend: '加到文末', copilotReplaceSelection: '替换选中',
        copilotReplaceAll: '替换全文', thinking: '思考中…',
      },
      note: { id: 'n1', title: 'T', body: '正文内容' },
      editing: false,
      draft: '',
      selectionRef: { current: { start: 0, end: 0 } },
      onApply: () => {},
    })
    check('copilot renders its actions', findAll(copilot, 'dshn-btn').length >= 5, String(findAll(copilot, 'dshn-btn').length))
    check('copilot reports the whole-note scope', findAll(copilot, 'dshn-copilot').length === 1)

    // With a selection, the replace-selection button becomes usable.
    const withSelection = render(internals.CopilotSidebar, {
      t: {
        copilotTitle: 'Copilot', copilotHide: '收', copilotShow: '展',
        copilotComplete: '续写', copilotPolish: '润色', copilotTranslate: '翻译',
        copilotExpand: '展开', copilotSummarize: '摘要', copilotAsk: '提问',
        copilotAskPlaceholder: '问…', copilotHint: '提示', copilotSelectionHint: '只处理选中',
        copilotWholeHint: '处理整篇', copilotSelection: (n) => n + ' 字', copilotWhole: '整篇',
        copilotClear: '清空', copilotAppend: '加到文末', copilotReplaceSelection: '替换选中',
        copilotReplaceAll: '替换全文', thinking: '思考中…',
      },
      note: { id: 'n1', title: 'T', body: '正文内容' },
      editing: true,
      draft: '正文内容',
      selectionRef: { current: { start: 0, end: 2 } },
      onApply: () => {},
    })
    check('copilot reflects a selection', findAll(withSelection, 'dshn-copilot').length === 1)
  }
} finally {
  await rm(vault, { recursive: true, force: true })
  await rm(fixtures, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
