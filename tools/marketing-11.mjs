// Marketing assets for 1.1 — the real workflow, real data, English UI.
//
// Everything on screen comes from the plugin: the note body and the two charts are read from the
// user's own vault, the renderer is formatLocally / renderNoteBody / Chart, and the layout is the
// plugin's stylesheet. The page is a pure function of time (`window.demo.seek(t)`), which is what makes
// the capture deterministic.
//
// Usage:
//   node tools/marketing-11.mjs --capture
//   <python> tools/marketing_gif.py --dir exports/marketing-11
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const packageDir = join(here, '..')
const outDir = join(packageDir, 'exports', 'marketing-11')
const fixtures = join(outDir, '_fixture')
const vault = join(packageDir, '..', 'notes-vault')

// --------------------------------------------------------------------- the plugin's renderer ---
const React = {
  Fragment: Symbol('Fragment'),
  createElement(type, props, ...children) {
    const flat = children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false)
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
  useCallback: (fn) => fn,
  useRef: (initial) => ({ current: initial }),
  Component: class { constructor(props) { this.props = props ?? {}; this.state = {} } setState() {} },
}
const realFetch = globalThis.fetch
globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, data: {} }) })
globalThis.window = { __ModuleLoader__: { load: (d) => { globalThis.__factory = d.factory } }, addEventListener() {}, removeEventListener() {} }
globalThis.localStorage = { getItem: () => 'en', setItem() {} }
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en-US' }, configurable: true })
globalThis.setInterval = () => 0
globalThis.clearInterval = () => {}
globalThis.__DSH_NOTES_TEST__ = true

await mkdir(fixtures, { recursive: true })
await writeFile(join(fixtures, 'client.mjs'), await readFile(join(packageDir, 'client.js'), 'utf8'), 'utf8')
await import(pathToFileURL(join(fixtures, 'client.mjs')).href)
globalThis.__factory((name) => (name === 'react' ? React : undefined))
const { formatLocally, renderNoteBody, PreviewBusy, Chart } = globalThis.__dshNotesInternals

const escapeHtml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const html = (node) => {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string') return escapeHtml(node)
  if (Array.isArray(node)) return node.map(html).join('')
  if (node.node === '#fragment') return (node.children ?? []).map(html).join('')
  const attrs = Object.entries(node.props ?? {})
    .filter(([key, value]) => key !== 'children' && key !== 'key' && value !== undefined && value !== null && value !== false && typeof value !== 'function')
    .map(([key, value]) => {
      // A style object (the chart bars) has to become css text, or every bar loses its width.
      const rendered =
        key === 'style' && typeof value === 'object'
          ? Object.entries(value).map(([prop, val]) => `${prop}:${val}`).join(';')
          : value
      return ` ${key === 'className' ? 'class' : key}="${escapeHtml(rendered)}"`
    })
    .join('')
  return `<${node.node}${attrs}>${(node.children ?? []).map(html).join('')}</${node.node}>`
}

// -------------------------------------------------------------------------- the real content ---
const notes = JSON.parse(await readFile(join(vault, 'notes.json'), 'utf8')).notes
const dashboard = JSON.parse(await readFile(join(vault, 'dashboard.json'), 'utf8'))
const source = (notes.find((note) => String(note.body).startsWith('极简笔记理念')) ?? notes[notes.length - 1]).body
const charts = (dashboard.charts ?? []).slice(0, 2)
const chartHtml = charts.map((chart) => html(Chart({ chart }))).join('')
const noteCount = notes.length
const tagCounts = new Map()
for (const note of notes) for (const tag of note.tags ?? []) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
const topTag = [...tagCounts.entries()].sort((left, right) => right[1] - left[1])[0] ?? ['', 0]
const chartCount = charts.length

const GHOST = '把工具退到背景里，文字才会重新回到前台。'
const NEXT_GHOST = '这也是我把它做成一个安静编辑器的原因。'
const STRUCTURED_RANGE = [
  '- 智能不是主角：它只在你写不出来时出现',
  '- 功能服务于思想：不打断、不抢焦点',
  '- 书写本身要带来快乐',
].join('\n')

const baseText = formatLocally(source)
const ghostText = baseText + GHOST
const rangeOf = (text) => {
  const from = text.indexOf('智能不能成为文字的主角')
  if (from < 0) return { start: 0, end: 0 }
  const to = text.indexOf('书写带来快乐') + '书写带来快乐'.length
  const start = text.lastIndexOf('\n', from) + 1
  const breakAt = text.indexOf('\n', to)
  return { start, end: breakAt < 0 ? text.length : breakAt }
}
const range = rangeOf(baseText)
const structuredFullText = baseText.slice(0, range.start) + STRUCTURED_RANGE + baseText.slice(range.end)

const translatedNote = formatLocally(
  [
    'The minimalist notebook',
    '',
    'This is not a new tool. It is a philosophical take on writing: you get the sovereignty of your thinking back by typing, purely.',
    '',
    '- Intelligence is not the protagonist',
    '- Features should serve thought',
    '- Writing itself should be a pleasure',
    '',
    'So the tool only has to do one thing: put the tool in the background, and the text comes back to the foreground.',
  ].join('\n'),
)

const scenes = [
  { key: 'start', from: 0, to: 1.8, chapter: 'Capture', caption: 'Open the panel. The cursor is already in the page.' },
  { key: 'typing', from: 1.8, to: 6.4, chapter: 'Capture', caption: 'Two spaces make a bullet; indentation is the next level.' },
  { key: 'preview', from: 6.4, to: 8.2, chapter: 'Capture', caption: 'The right page is not a preview button — it typesets as you type.' },
  { key: 'ghost', from: 8.2, to: 10.6, chapter: 'Capture', caption: 'Pause for a second: the note answers first, then the model. TAB takes it.' },
  { key: 'select', from: 10.6, to: 12.4, chapter: 'Capture', caption: 'Select a range. Only that range will be rewritten.' },
  { key: 'structuring', from: 12.4, to: 14.4, chapter: 'Capture', caption: 'Structure runs once: one call, progress in the toolbar.' },
  { key: 'structured', from: 14.4, to: 16.6, chapter: 'Capture', caption: 'The draft is the right page. The rest of the note is untouched.' },
  { key: 'applied', from: 16.6, to: 18.2, chapter: 'Capture', caption: 'Apply: only the selected lines change.' },
  { key: 'translating', from: 18.2, to: 20.2, chapter: 'Capture', caption: 'Translate the note from the live preview — one call, whole note.' },
  { key: 'saved', from: 20.2, to: 21.8, chapter: 'Capture', caption: 'Save. What you see on the right is what gets stored.' },
  { key: 'history', from: 21.8, to: 24.6, chapter: 'History', caption: 'The list of notes; open one and read it, or edit in place.' },
  { key: 'editing', from: 24.6, to: 27.2, chapter: 'History', caption: 'Edit reuses the capture page — same two pages, same toolbar.' },
  { key: 'saved-note', from: 27.2, to: 29.2, chapter: 'History', caption: 'Save keeps the note; copy turns it into standard Markdown.' },
  { key: 'board', from: 29.2, to: 33.0, chapter: 'Board', caption: 'One more thing: the board reads the notebook, so notes do not gather dust.' },
]
const total = scenes[scenes.length - 1].to
const frames = Array.from({ length: Math.round(total * 10) }, (_, index) => index / 10)

const markedRange = (text, className) =>
  escapeHtml(text.slice(0, range.start)) +
  `<mark class="${className}">${escapeHtml(text.slice(range.start, range.end))}</mark>` +
  escapeHtml(text.slice(range.end))

const stateAt = (t) => {
  const scene = scenes.find((entry) => t >= entry.from && t < entry.to) ?? scenes[scenes.length - 1]
  const progress = Math.min(1, Math.max(0, (t - scene.from) / (scene.to - scene.from)))
  // A short cross-fade when a scene starts, so cuts read as transitions rather than jumps.
  const fade = t - scene.from < 0.22 ? 0.45 + 0.55 * ((t - scene.from) / 0.22) : 1
  const state = {
    screen: 'capture',
    chapter: scene.chapter,
    caption: scene.caption,
    fade,
    left: baseText,
    mirror: escapeHtml(baseText),
    right: html(renderNoteBody(baseText)),
    label: 'Rendered · ' + baseText.length + ' characters',
    busy: '',
    draftBar: false,
    status: '',
    copied: false,
    historyEdit: false,
  }

  switch (scene.key) {
    case 'start':
      state.left = ''
      state.mirror = ''
      state.right = '<div class="dshn-md-empty">Left: you write. Right: it is already set.</div>'
      state.label = 'Rendered'
      break
    case 'typing': {
      const text = formatLocally(baseText.slice(0, Math.floor(progress * baseText.length)))
      state.left = text
      state.mirror = escapeHtml(text)
      state.right = html(renderNoteBody(text))
      state.label = 'Rendered · ' + text.length + ' characters'
      break
    }
    case 'ghost':
      if (progress < 0.5) {
        state.mirror = `${escapeHtml(baseText)}<span class="dshn-ghost">${escapeHtml(GHOST)}</span>`
      } else {
        state.left = ghostText
        state.mirror = `${escapeHtml(baseText)}<mark class="dshn-mark-accepted">${escapeHtml(GHOST)}</mark><span class="dshn-ghost">${escapeHtml(NEXT_GHOST)}</span>`
        state.right = html(renderNoteBody(ghostText))
      }
      break
    case 'select':
      state.mirror = markedRange(baseText, 'dshn-editor-mark')
      break
    case 'structuring':
      state.mirror = markedRange(baseText, 'dshn-editor-mark')
      state.busy = 'Structuring… ' + Math.max(1, Math.ceil(progress * (scene.to - scene.from))) + 's'
      break
    case 'structured':
      state.mirror = markedRange(baseText, 'dshn-preview-mark')
      state.right = html(renderNoteBody(structuredFullText))
      state.label = 'AI draft · selection only'
      state.draftBar = true
      break
    case 'applied':
      state.left = structuredFullText
      state.mirror = escapeHtml(structuredFullText)
      state.right = html(renderNoteBody(structuredFullText))
      break
    case 'translating':
      state.left = structuredFullText
      state.mirror = escapeHtml(structuredFullText)
      state.right = html(renderNoteBody(structuredFullText))
      state.busy = 'Translating… ' + Math.max(1, Math.ceil(progress * (scene.to - scene.from))) + 's'
      state.label = 'Note · translating to English'
      break
    case 'saved':
      state.left = structuredFullText
      state.mirror = escapeHtml(structuredFullText)
      state.right = html(renderNoteBody(translatedNote))
      state.label = 'Saved · English'
      state.status = 'Saved'
      break
    case 'history':
      state.screen = 'history'
      break
    case 'editing':
      state.screen = 'history'
      state.historyEdit = true
      break
    case 'saved-note':
      state.screen = 'history'
      state.historyEdit = true
      state.copied = progress > 0.6
      state.status = 'Copied'
      break
    case 'board':
    default:
      state.screen = 'board'
      break
  }
  return state
}

const states = frames.map((t) => stateAt(t))

const cssSource = await readFile(join(packageDir, 'src', 'head.js'), 'utf8')
const cssStart = cssSource.indexOf('const STYLES = `')
const cssEnd = cssSource.indexOf('\n`', cssStart)
const css = cssSource.slice(cssStart + 'const STYLES = `'.length, cssEnd)
const busyDefault = html(PreviewBusy({ label: 'Structuring… 2s' }))

const historyListHtml = notes
  .slice(0, 6)
  .map((note, index) => {
    const lines = String(note.body).split('\n')
    const title = (lines[0] ?? '').slice(0, 34)
    const rest = lines.slice(1).join(' ').trim() || title
    return `<button class="dshn-item" ${index === 0 ? 'data-active="true"' : ''}>
      <span class="dshn-item-top"><span class="dshn-item-title">${escapeHtml(title)}</span></span>
      <span class="dshn-item-preview">${escapeHtml(rest.slice(0, 72))}</span>
      <span class="dshn-item-meta"><span class="dshn-dot" data-source="${escapeHtml(note.source ?? 'panel')}"></span><span>${index === 0 ? 'Today' : 'Yesterday'}</span></span>
    </button>`
  })
  .join('')

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>dsh-notes 1.1</title>
<style>
:root{--dsw-alias-label-primary:#1b1b1b;--dsw-alias-label-secondary:#6b6b6b;--dsw-alias-bg-base:#fff;--dsw-alias-bg-layer-1:#fff;--dsw-alias-bg-layer-2:#f2f2f2;--dsw-alias-border-l1:#e3e3e3;--dsw-alias-border-l2:#d0d0d0;--dsw-alias-brand-primary:#1f6feb;--dsw-alias-state-success-primary:#2ea043;--dsw-alias-state-error-primary:#cf222e;--dshn-heat-0:#ebedf0;--dshn-heat-1:#9be9a8;--dshn-r-sm:6px;--dshn-r-md:10px;--dshn-r-lg:14px}
html,body{margin:0;background:var(--dsw-alias-bg-base);font:13.5px/1.7 -apple-system,"Segoe UI",system-ui,sans-serif;color:var(--dsw-alias-label-primary)}
.stage{width:1180px;padding:14px 20px 10px;transition:opacity .18s ease}
.tabs{display:flex;gap:14px;font-size:12.5px;color:var(--dsw-alias-label-secondary);border-bottom:1px solid var(--dsw-alias-border-l1);padding-bottom:8px;margin-bottom:10px}
.tabs b{color:var(--dsw-alias-label-primary);font-weight:600;border-bottom:2px solid var(--dsw-alias-label-primary);padding-bottom:8px;margin-bottom:-9px}
.sheets{display:flex;gap:26px;position:relative}
.sheet{flex:1 1 0;min-width:0;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dshn-r-md);padding:14px 16px;display:flex;flex-direction:column;gap:10px;background:var(--dsw-alias-bg-layer-1);height:420px}
.sheet-label{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.tools{display:flex;gap:6px;align-items:center;margin-top:auto;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1);font-size:12px;color:var(--dsw-alias-label-secondary)}
.tools .grow{flex:1 1 auto}
.btn{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:inherit;border-radius:var(--dshn-r-sm);padding:4px 12px;font:inherit;font-size:12px}
.btn.primary{background:#1b1b1b;border-color:#1b1b1b;color:#fff;font-weight:600;padding:5px 16px}
.btn.ghost{border-color:transparent;background:transparent}
.lang{border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dshn-r-sm);padding:4px 8px;background:#fff;font:inherit;font-size:12px}
.caption{font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:8px;min-height:18px}
.handle{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:18px;height:44px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:#fff;display:grid;place-items:center;color:var(--dsw-alias-label-secondary);box-shadow:0 1px 3px rgb(0 0 0 / 8%);font-size:11px}
.screen{display:none}
.screen[data-on="true"]{display:block}
.boards{display:flex;gap:16px;height:430px}
.chartcol{flex:1 1 0;display:flex;flex-direction:column;gap:10px;min-width:0;overflow:hidden}
.chatcol{flex:0 0 380px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dshn-r-md);padding:12px 14px;background:#fff;display:flex;flex-direction:column;gap:8px}
.q{font-size:12px;color:var(--dsw-alias-label-secondary)}
.a{font-size:13px;line-height:1.7}
.hist{display:flex;gap:14px;height:430px}
.hist-list{flex:0 0 300px;border-right:1px solid var(--dsw-alias-border-l1);padding-right:12px;display:flex;flex-direction:column;gap:6px;overflow:hidden}
.hist-main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column}
</style>
<style>${css}</style>
</head><body>
<div class="stage" id="stage">
  <div class="tabs" id="tabs"><b id="tab-capture">Capture</b><span id="tab-history">History ${noteCount}</span><span id="tab-board">Board</span></div>

  <section class="screen" id="screen-capture" data-on="true">
    <div class="sheets">
      <div class="sheet" data-role="source">
        <div class="sheet-label">Source</div>
        <div class="dshn-composer" style="flex:1 1 auto;min-height:0">
          <div class="dshn-editor-area" style="flex:1 1 auto;min-height:0">
            <div class="dshn-editor-marks" id="mirror" aria-hidden="true"></div>
            <textarea class="dshn-textarea" id="editor" spellcheck="false" style="min-height:0;height:100%"></textarea>
          </div>
        </div>
        <div class="tools"><span id="chars">0 characters</span><span id="status"></span><span class="grow"></span>
          <button class="btn" id="structure">✦ Structure</button>
          <button class="btn ghost" id="cancel">Cancel</button>
          <button class="btn primary" id="save">Save</button>
        </div>
      </div>
      <div class="sheet" data-role="render">
        <div class="sheet-label" id="render-label">Rendered</div>
        <div class="dshn-page-render" id="preview" style="flex:1 1 auto;min-height:0;overflow:hidden"></div>
        <div class="tools">
          <span id="busy" style="display:none">${busyDefault}</span>
          <select class="lang"><option>Auto</option><option selected>English</option><option>Deutsch</option></select>
          <span class="grow"></span>
          <button class="btn" id="draft-translate" style="display:none">Translate</button>
          <button class="btn" id="draft-apply" style="display:none">Apply</button>
          <button class="btn" id="note-translate">Translate</button>
        </div>
      </div>
      <div class="handle">›</div>
    </div>
  </section>

  <section class="screen" id="screen-history">
    <div class="hist">
      <div class="hist-list">${historyListHtml}</div>
      <div class="hist-main" id="hist-main"></div>
    </div>
  </section>

  <section class="screen" id="screen-board">
    <div class="boards">
      <div class="chartcol"><div class="dshn-chart-grid" style="grid-template-columns:1fr;gap:10px">${chartHtml}</div></div>
      <div class="chatcol">
        <div class="q">What have I been writing about for the last three weeks?</div>
        <div class="a">「${topTag[0]}」 appears on ${topTag[1]} of the ${noteCount} notes — the thread you keep coming back to. ${chartCount} charts are pinned to this board.</div>
      </div>
    </div>
  </section>

  <div class="caption" id="caption"></div>
</div>
<script>
  const states = ${JSON.stringify(states)}
  const noteHtml = ${JSON.stringify(html(renderNoteBody(baseText)))}
  const stage = document.getElementById('stage')
  const screens = { capture: document.getElementById('screen-capture'), history: document.getElementById('screen-history'), board: document.getElementById('screen-board') }
  const tabs = { capture: document.getElementById('tab-capture'), history: document.getElementById('tab-history'), board: document.getElementById('tab-board') }
  const editor = document.getElementById('editor')
  const mirror = document.getElementById('mirror')
  const preview = document.getElementById('preview')
  const busy = document.getElementById('busy')
  const chars = document.getElementById('chars')
  const status = document.getElementById('status')
  const label = document.getElementById('render-label')
  const caption = document.getElementById('caption')
  const draftApply = document.getElementById('draft-apply')
  const draftTranslate = document.getElementById('draft-translate')
  const noteTranslate = document.getElementById('note-translate')
  const histMain = document.getElementById('hist-main')

  const copyIcon = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg>'
  const tickIcon = '<svg class="dshn-copy-check" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5 10-11"/></svg>'

  const historyMarkup = (edit, copied) => {
    const actions = '<div class="dshn-detail-actions">' +
      '<button class="dshn-icon-btn" title="Pin">◈</button>' +
      '<button class="dshn-icon-btn" data-copied="' + String(copied) + '" title="Copy as Markdown">' + (copied ? tickIcon : copyIcon) + '</button>' +
      '<button class="dshn-btn primary dshn-detail-edit">Edit</button>' +
      '<button class="dshn-icon-btn dshn-danger" title="Move to trash">✕</button>' +
      '</div>'
    const body = edit
      ? '<div class="dshn-detail-scroll"><div class="dshn-detail-body"><div class="dshn-composer" style="min-height:0"><div class="dshn-editor-area" style="min-height:0"><textarea class="dshn-textarea" style="min-height:0;height:220px" spellcheck="false"></textarea></div></div></div></div>'
      : '<div class="dshn-detail-scroll"><div class="dshn-detail-body">' + noteHtml + '</div><div class="dshn-foot"><span>Edited Today</span><span>' + ${JSON.stringify(noteCount)} + '</span></div></div>'
    return '<div class="dshn-detail"><div class="dshn-detail-bar"><span class="dshn-detail-title">极简笔记理念</span><span class="dshn-grow"></span>' + actions + '</div>' + body + '</div>'
  }

  window.demo = {
    seek(t) {
      const state = states[Math.min(states.length - 1, Math.max(0, Math.round(t * 10)))]
      stage.style.opacity = String(state.fade ?? 1)
      for (const key of Object.keys(screens)) screens[key].dataset.on = String(key === state.screen)
      for (const key of Object.keys(tabs)) {
        tabs[key].style.color = key === state.screen ? '#1b1b1b' : '#6b6b6b'
        tabs[key].style.borderBottom = key === state.screen ? '2px solid #1b1b1b' : 'none'
      }
      if (state.screen === 'capture') {
        editor.value = state.left ?? ''
        chars.textContent = (state.left ?? '').length + ' characters'
        mirror.innerHTML = state.mirror ?? ''
        preview.innerHTML = state.right ?? ''
        busy.style.display = !state.busy ? 'none' : 'inline-flex'
        if (state.busy) {
          const node = busy.querySelector('.dshn-busy-label')
          if (node !== null) node.textContent = state.busy
        }
        label.textContent = state.label
        draftApply.style.display = state.draftBar ? 'inline-block' : 'none'
        draftTranslate.style.display = state.draftBar ? 'inline-block' : 'none'
        noteTranslate.style.display = state.draftBar ? 'none' : 'inline-block'
      }
      if (state.screen === 'history') histMain.innerHTML = historyMarkup(state.historyEdit === true, state.copied === true)
      status.textContent = state.status ?? ''
      caption.textContent = state.caption ?? ''
    },
  }
  window.demo.seek(0)
</script>
</body></html>`

await mkdir(outDir, { recursive: true })
const pagePath = join(outDir, 'demo.html')
await writeFile(pagePath, page, 'utf8')
await writeFile(join(outDir, 'frames.json'), JSON.stringify(frames), 'utf8')
console.log('page:', pagePath)
console.log('frames:', frames.length, '| duration:', frames[frames.length - 1], 's', '| notes:', noteCount, '| charts:', chartCount)

if (process.argv.includes('--capture')) {
  const base = 'http://127.0.0.1:9222'
  const created = await realFetch(`${base}/json/new?${encodeURIComponent(pathToFileURL(pagePath).href)}`, { method: 'PUT' })
  const target = await created.json()
  if (target?.webSocketDebuggerUrl === undefined) {
    console.error('CDP target has no websocket url')
    process.exit(1)
  }
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id !== undefined && pending.has(message.id)) {
      pending.get(message.id)(message)
      pending.delete(message.id)
    }
  })
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve)
    socket.addEventListener('error', reject)
  })
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const messageId = ++id
      pending.set(messageId, resolve)
      socket.send(JSON.stringify({ id: messageId, method, params }))
    })

  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1212, height: 600, deviceScaleFactor: 1, mobile: false })
  await new Promise((resolve) => setTimeout(resolve, 600))

  const clip = { x: 0, y: 0, width: 1212, height: 600, scale: 1 }
  const framesDir = join(outDir, 'frames')
  await mkdir(framesDir, { recursive: true })
  for (const [index, t] of frames.entries()) {
    await send('Runtime.evaluate', { expression: `window.demo.seek(${t})` })
    const shot = await send('Page.captureScreenshot', { format: 'png', clip })
    await writeFile(join(framesDir, `f${String(index).padStart(3, '0')}.png`), Buffer.from(shot.result.data, 'base64'))
  }

  const stills = {
    '01-write-now': 3.6,
    '02-suggestion': 9.4,
    '03-structure-range': 15.6,
    '04-apply-translate': 19.2,
    '05-history-copy': 28.4,
    '06-board': 31.0,
  }
  await mkdir(join(outDir, 'stills'), { recursive: true })
  for (const [name, t] of Object.entries(stills)) {
    await send('Runtime.evaluate', { expression: `window.demo.seek(${t})` })
    const shot = await send('Page.captureScreenshot', { format: 'png', clip })
    await writeFile(join(outDir, 'stills', `${name}.png`), Buffer.from(shot.result.data, 'base64'))
  }

  await realFetch(`${base}/json/close/${target.id}`)
  socket.close()
  console.log('captured', frames.length, 'frames + ' + Object.keys(stills).length + ' stills')
}
