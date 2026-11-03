// Marketing assets for 1.1: one scripted page, the whole workflow, captured frame by frame.
//
// The page is built from the plugin's own renderer (formatLocally, renderNoteBody, PreviewBusy) and
// stylesheet, so what the GIF shows is what the panel draws. Every frame is a pure function of time
// (`window.demo.seek(t)`), which is what makes the capture deterministic.
//
// The script is the product story, not a feature list: start writing → it typesets → a pause gets a
// suggestion → select a range and structure only that range → apply → translate → save → the board.
//
// Usage:
//   node tools/marketing-11.mjs                # writes exports/marketing-11/demo.html
//   node tools/marketing-11.mjs --capture      # also captures frames + stills via Chrome (9222)
//   <python> tools/marketing_gif.py --dir exports/marketing-11
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const packageDir = join(here, '..')
const outDir = join(packageDir, 'exports', 'marketing-11')
const fixtures = join(outDir, '_fixture')

// --------------------------------------------------------------------- the plugin's renderer ---
const React = {
  Fragment: Symbol('Fragment'),
  createElement(type, props, ...children) {
    const flat = children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false)
    if (typeof type === 'function') return new type({ ...(props ?? {}), children: flat }).render()
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
globalThis.localStorage = { getItem: () => 'zh', setItem() {} }
Object.defineProperty(globalThis, 'navigator', { value: { language: 'zh-CN' }, configurable: true })
globalThis.setInterval = () => 0
globalThis.clearInterval = () => {}
globalThis.__DSH_NOTES_TEST__ = true

await mkdir(fixtures, { recursive: true })
await writeFile(join(fixtures, 'client.mjs'), await readFile(join(packageDir, 'client.js'), 'utf8'), 'utf8')
await import(pathToFileURL(join(fixtures, 'client.mjs')).href)
globalThis.__factory((name) => (name === 'react' ? React : undefined))
const { formatLocally, renderNoteBody, PreviewBusy } = globalThis.__dshNotesInternals

const escapeHtml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const html = (node) => {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string') return escapeHtml(node)
  if (Array.isArray(node)) return node.map(html).join('')
  if (node.node === '#fragment') return (node.children ?? []).map(html).join('')
  const attrs = Object.entries(node.props ?? {})
    .filter(([key, value]) => key !== 'children' && key !== 'key' && value !== undefined && value !== null && value !== false && typeof value !== 'function')
    .map(([key, value]) => ` ${key === 'className' ? 'class' : key}="${escapeHtml(value)}"`)
    .join('')
  return `<${node.node}${attrs}>${(node.children ?? []).map(html).join('')}</${node.node}>`
}

// ------------------------------------------------------------------------- the story script ---
const TYPED = [
  '极简笔记理念',
  '',
  '这不是一个新的工具，这是一个关于文字的哲学思考。',
  '    智能不能成为文字的主角',
  '    功能应当服务于思想',
  '        书写带来快乐',
  '',
  '所以这个工具只需要做一件事，那就是',
]

const GHOST = '把工具退到背景里，文字才会重新回到前台。'
const NEXT_GHOST = '这也是我把它做成一个安静编辑器的原因。'

const STRUCTURED_RANGE = [
  '- 智能不是主角：它只在你写不出来时出现',
  '- 功能服务于思想：不打断、不抢焦点',
  '- 书写本身要带来快乐',
].join('\n')

const TRANSLATED = [
  'Minimalist notes',
  '',
  'This is not a new tool; it is a philosophical take on writing.',
  '- Intelligence is not the protagonist: it appears only when you are stuck',
  '- Features serve thought: no interruptions, no stealing focus',
  '- Writing itself should be a pleasure',
  '',
  'So the tool only has to do one thing: put the tool in the background, and the text comes back to the foreground.',
].join('\n')

const BOARD_ANSWER =
  '这 12 条笔记里，写作节奏集中在 9–11 点；「压测」出现 9 次，是最近三周的主线，其中 3 条还没有结论。'

const scenes = [
  { key: 'start', from: 0, to: 2.0, caption: '打开就是一页纸：没有模板，也没有要先学的工具栏。' },
  { key: 'typing', from: 2.0, to: 6.0, caption: '两个空格就是项目符号，再缩进就是下一级。' },
  { key: 'preview', from: 6.0, to: 8.0, caption: '右边不是预览按钮——它一直在替你排版。' },
  { key: 'ghost', from: 8.0, to: 10.2, caption: '停手一秒，它就接着你写；TAB 采纳，一次 Backspace 收回。' },
  { key: 'select', from: 10.2, to: 12.0, caption: '选中一段：只有这一段会被处理。' },
  { key: 'structuring', from: 12.0, to: 14.2, caption: '结构化只花一次调用，进度留在工具栏里。' },
  { key: 'structured', from: 14.2, to: 16.2, caption: '结果只落在选中的那几行，旁边还能继续写。' },
  { key: 'applied', from: 16.2, to: 18.0, caption: '应用回笔记：没选中的部分一个字没动。' },
  { key: 'translating', from: 18.0, to: 20.0, caption: '整篇或选区，翻成你要的语言。' },
  { key: 'saved', from: 20.0, to: 21.6, caption: '保存，就是把右边这一页存下来。' },
  { key: 'board', from: 21.6, to: 25.2, caption: 'One more thing：看板让这些笔记不再落灰。' },
]

const total = scenes[scenes.length - 1].to
const frames = Array.from({ length: Math.round(total * 10) }, (_, index) => index / 10)

const baseText = formatLocally(TYPED.join('\n'))
const ghostText = baseText + GHOST

const rangeOf = (text) => {
  const from = text.indexOf('智能不能成为文字的主角')
  const to = text.indexOf('书写带来快乐') + '书写带来快乐'.length
  const start = text.lastIndexOf('\n', from) + 1
  const breakAt = text.indexOf('\n', to)
  return { start, end: breakAt < 0 ? text.length : breakAt }
}

const structuredFullText = (() => {
  const range = rangeOf(baseText)
  return baseText.slice(0, range.start) + STRUCTURED_RANGE + baseText.slice(range.end)
})()

const typedTextAt = (progress) => formatLocally(TYPED.join('\n').slice(0, Math.floor(progress * TYPED.join('\n').length)))

const marked = (text, range, className) =>
  escapeHtml(text.slice(0, range.start)) +
  `<mark class="${className}">${escapeHtml(text.slice(range.start, range.end))}</mark>` +
  escapeHtml(text.slice(range.end))

const stateAt = (t) => {
  const scene = scenes.find((entry) => t >= entry.from && t < entry.to) ?? scenes[scenes.length - 1]
  const progress = Math.min(1, Math.max(0, (t - scene.from) / (scene.to - scene.from)))
  const range = rangeOf(baseText)
  const state = { scene: scene.key, caption: scene.caption, left: '', mirror: '', right: '', label: '排版结果', busy: '', applyBar: false, status: '', board: false }

  switch (scene.key) {
    case 'start':
      state.right = '<div class="dshn-md-empty">左页写，右页读。</div>'
      break
    case 'typing': {
      const text = typedTextAt(progress)
      state.left = text
      state.mirror = escapeHtml(text)
      state.right = html(renderNoteBody(text))
      break
    }
    case 'preview':
      state.left = baseText
      state.mirror = escapeHtml(baseText)
      state.right = html(renderNoteBody(baseText))
      break
    case 'ghost': {
      if (progress < 0.55) {
        state.left = baseText
        state.mirror = `${escapeHtml(baseText)}<span class="dshn-ghost">${escapeHtml(GHOST)}</span>`
        state.right = html(renderNoteBody(baseText))
      } else {
        state.left = ghostText
        state.mirror = `${escapeHtml(baseText)}<mark class="dshn-mark-accepted">${escapeHtml(GHOST)}</mark><span class="dshn-ghost">${escapeHtml(NEXT_GHOST)}</span>`
        state.right = html(renderNoteBody(ghostText))
      }
      break
    }
    case 'select':
      state.left = baseText
      state.mirror = marked(baseText, range, 'dshn-editor-mark')
      state.right = html(renderNoteBody(baseText))
      break
    case 'structuring':
      state.left = baseText
      state.mirror = marked(baseText, range, 'dshn-editor-mark')
      state.right = html(renderNoteBody(baseText))
      state.busy = '正在整理… ' + Math.max(1, Math.ceil(progress * (scene.to - scene.from))) + 's'
      break
    case 'structured': {
      // The draft is the right page; the source still holds the original, with the range tinted so the
      // eye connects the two.
      state.left = baseText
      state.mirror =
        escapeHtml(baseText.slice(0, range.start)) +
        `<mark class="dshn-preview-mark">${escapeHtml(baseText.slice(range.start, range.end))}</mark>` +
        escapeHtml(baseText.slice(range.end))
      state.right = html(renderNoteBody(structuredFullText))
      state.label = 'AI 草稿 · 只改选区'
      state.applyBar = true
      break
    }
    case 'applied':
      state.left = structuredFullText
      state.mirror = escapeHtml(structuredFullText)
      state.right = html(renderNoteBody(structuredFullText))
      break
    case 'translating':
      state.left = structuredFullText
      state.mirror = escapeHtml(structuredFullText)
      state.right = html(renderNoteBody(structuredFullText))
      state.busy = '正在翻译… ' + Math.max(1, Math.ceil(progress * (scene.to - scene.from))) + 's'
      state.label = '正在译成 English'
      break
    case 'saved':
      state.left = structuredFullText
      state.mirror = escapeHtml(structuredFullText)
      state.right = html(renderNoteBody(TRANSLATED))
      state.label = '已保存 · English'
      state.status = '已保存'
      break
    case 'board':
    default:
      state.board = true
      state.label = '看板'
      break
  }
  return state
}

const states = frames.map((t) => stateAt(t))

const cssSource = await readFile(join(packageDir, 'src', 'head.js'), 'utf8')
const cssStart = cssSource.indexOf('const STYLES = `')
const cssEnd = cssSource.indexOf('\n`', cssStart)
const css = cssSource.slice(cssStart + 'const STYLES = `'.length, cssEnd)

const busyDefault = html(PreviewBusy({ label: '正在整理… 2s' }))

const page = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>dsh-notes 1.1</title>
<style>
:root{--dsw-alias-label-primary:#1b1b1b;--dsw-alias-label-secondary:#6b6b6b;--dsw-alias-bg-base:#fff;--dsw-alias-bg-layer-1:#fff;--dsw-alias-bg-layer-2:#f2f2f2;--dsw-alias-border-l1:#e3e3e3;--dsw-alias-border-l2:#d0d0d0;--dsw-alias-brand-primary:#1f6feb;--dsw-alias-state-success-primary:#2ea043;--dsw-alias-state-error-primary:#cf222e;--dshn-heat-0:#ebedf0;--dshn-heat-1:#9be9a8;--dshn-r-sm:6px;--dshn-r-md:10px;--dshn-r-lg:14px}
html,body{margin:0;background:var(--dsw-alias-bg-base);font:13.5px/1.7 -apple-system,"Segoe UI",system-ui,sans-serif;color:var(--dsw-alias-label-primary)}
.stage{width:1180px;padding:16px 20px 12px}
.tabs{display:flex;gap:14px;font-size:12.5px;color:var(--dsw-alias-label-secondary);border-bottom:1px solid var(--dsw-alias-border-l1);padding-bottom:8px;margin-bottom:12px}
.tabs b{color:var(--dsw-alias-label-primary);font-weight:600;border-bottom:2px solid var(--dsw-alias-label-primary);padding-bottom:8px;margin-bottom:-9px}
.sheets{display:flex;gap:26px;position:relative}
.sheet{flex:1 1 0;min-width:0;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dshn-r-md);padding:14px 16px;display:flex;flex-direction:column;gap:10px;background:var(--dsw-alias-bg-layer-1);height:430px}
.sheet-label{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.tools{display:flex;gap:6px;align-items:center;margin-top:auto;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1);font-size:12px;color:var(--dsw-alias-label-secondary)}
.tools .grow{flex:1 1 auto}
.btn{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:inherit;border-radius:var(--dshn-r-sm);padding:4px 12px;font:inherit;font-size:12px}
.btn.primary{background:#1b1b1b;border-color:#1b1b1b;color:#fff;font-weight:600;padding:5px 16px}
.btn.ghost{border-color:transparent;background:transparent}
.lang{border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dshn-r-sm);padding:4px 8px;background:#fff;font:inherit;font-size:12px}
.caption{font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:10px;min-height:18px}
.handle{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:18px;height:44px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:#fff;display:grid;place-items:center;color:var(--dsw-alias-label-secondary);box-shadow:0 1px 3px rgb(0 0 0 / 8%);font-size:11px}
.board{display:none;gap:18px;height:430px}
.statgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;align-content:start;flex:1 1 0}
.stat{border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dshn-r-md);padding:12px 14px;background:#fff}
.stat b{display:block;font-size:22px;line-height:1.2}
.stat span{font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.chat{flex:1 1 0;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dshn-r-md);padding:12px 14px;background:#fff;display:flex;flex-direction:column;gap:8px}
.q{font-size:12px;color:var(--dsw-alias-label-secondary)}
.a{font-size:13px;line-height:1.7}
</style>
<style>${css}</style>
</head><body>
<div class="stage">
  <div class="tabs" id="tabs"><b id="tab-capture">Capture</b><span id="tab-history">History 12</span><span id="tab-board">Board</span></div>
  <div class="sheets" id="sheets">
    <div class="sheet" data-role="source">
      <div class="sheet-label">Source · 极简写</div>
      <div class="dshn-composer" style="flex:1 1 auto;min-height:0">
        <div class="dshn-editor-area" style="flex:1 1 auto;min-height:0">
          <div class="dshn-editor-marks" id="mirror" aria-hidden="true"></div>
          <textarea class="dshn-textarea" id="editor" spellcheck="false" style="min-height:0;height:100%"></textarea>
        </div>
      </div>
      <div class="tools"><span id="chars">0 字</span><span id="status"></span><span class="grow"></span>
        <button class="btn" id="structure">✦ 结构化</button>
        <button class="btn ghost" id="cancel">取消</button>
        <button class="btn primary" id="save">保存</button>
      </div>
    </div>
    <div class="sheet" data-role="render">
      <div class="sheet-label" id="render-label">排版结果</div>
      <div class="dshn-page-render" id="preview" style="flex:1 1 auto;min-height:0;overflow:hidden;clip-path:inset(0 0 0 0)"></div>
      <div class="tools">
        <span id="busy" style="display:none">${busyDefault}</span>
        <select class="lang" id="lang"><option>跟随原文</option><option>English</option><option>Deutsch</option></select>
        <span class="grow"></span>
        <button class="btn" id="apply" style="display:none">应用</button>
        <button class="btn" id="translate">翻译</button>
      </div>
    </div>
    <div class="handle">›</div>
  </div>
  <div class="board" id="board">
    <div class="statgrid">
      <div class="stat"><b>12</b><span>条笔记</span></div>
      <div class="stat"><b>9</b><span>次 AI 调用</span></div>
      <div class="stat"><b>9–11am</b><span>你的写作高峰</span></div>
    </div>
    <div class="chat">
      <div class="q">最近三周我一直在写什么？</div>
      <div class="a" id="answer"></div>
    </div>
  </div>
  <div class="caption" id="caption"></div>
</div>
<script>
  const states = ${JSON.stringify(states)}
  const answer = ${JSON.stringify(BOARD_ANSWER)}
  const editor = document.getElementById('editor')
  const mirror = document.getElementById('mirror')
  const preview = document.getElementById('preview')
  const busy = document.getElementById('busy')
  const chars = document.getElementById('chars')
  const status = document.getElementById('status')
  const label = document.getElementById('render-label')
  const caption = document.getElementById('caption')
  const apply = document.getElementById('apply')
  const sheets = document.getElementById('sheets')
  const board = document.getElementById('board')
  const tabs = {
    capture: document.getElementById('tab-capture'),
    history: document.getElementById('tab-history'),
    board: document.getElementById('tab-board'),
  }

  window.demo = {
    seek(t) {
      const state = states[Math.min(states.length - 1, Math.max(0, Math.round(t * 10)))]
      const onBoard = state.board === true
      sheets.style.display = onBoard ? 'none' : 'flex'
      board.style.display = onBoard ? 'flex' : 'none'
      document.getElementById('answer').textContent = onBoard ? answer : ''
      editor.value = state.left ?? ''
      chars.textContent = (state.left ?? '').length + ' 字'
      mirror.innerHTML = state.mirror ?? ''
      preview.innerHTML = state.right ?? ''
      preview.style.clipPath = 'inset(0 ' + Math.round((1 - (state.wipe ?? 1)) * 100) + '% 0 0)'
      busy.style.display = state.busy === '' || state.busy === undefined ? 'none' : 'inline-flex'
      if (state.busy !== '' && state.busy !== undefined) {
        const node = busy.querySelector('.dshn-busy-label')
        if (node !== null) node.textContent = state.busy
      }
      status.textContent = state.status ?? ''
      label.textContent = state.label ?? '排版结果'
      caption.textContent = state.caption ?? ''
      apply.style.display = state.applyBar === true ? 'inline-block' : 'none'
      tabs.capture.style.borderBottom = onBoard ? 'none' : '2px solid #1b1b1b'
      tabs.board.style.borderBottom = onBoard ? '2px solid #1b1b1b' : 'none'
      tabs.capture.style.color = onBoard ? '#6b6b6b' : '#1b1b1b'
      tabs.board.style.color = onBoard ? '#1b1b1b' : '#6b6b6b'
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
console.log('frames:', frames.length, '| duration:', frames[frames.length - 1], 's')

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
    '01-write-now': 3.4,
    '02-pause-and-tab': 9.2,
    '03-structure-range': 15.0,
    '04-apply-translate': 19.0,
    '05-board': 23.4,
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
