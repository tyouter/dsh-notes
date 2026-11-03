// Marketing assets for 1.1: one scripted page, three scenes, captured frame by frame.
//
// The page is built from the plugin's own renderer and stylesheet, so what the GIF shows is what the
// panel draws. Every frame is a pure function of time (`window.demo.seek(t)`), which is what makes the
// capture deterministic.
//
// Usage:
//   node tools/marketing-11.mjs                 # writes exports/marketing-11/demo.html
//   node tools/marketing-11.mjs --capture       # also captures frames + stills via Chrome (9222)
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
const { formatLocally, renderNoteBody, PreviewBusy, plainLine } = globalThis.__dshNotesInternals

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

// ------------------------------------------------------------------------------- the script ---
// Scene A: 极简写 — spaces become bullets while typing.
const typed = [
  '极简笔记理念',
  '',
  '这不是一个新的工具，这是一个关于文字的哲学思考。',
  '    智能不能成为文字的主角',
  '    功能应当服务于思想',
  '        书写带来快乐',
  '',
  '所以这个工具只需要做一件事，那就是',
]
const ghostText = '把工具退到背景里，文字才会重新回到前台。'
const nextGhost = '这也是我把它做成一个安静编辑器的原因。'

// Scene C: what Structure returns (title, sections, continuous numbering, bullets as bullets).
const structured = [
  '极简笔记理念',
  '',
  '## 立场',
  '- 这不是一个新的工具，这是一个关于文字的哲学思考',
  '',
  '## 三条判断',
  '- 智能不能成为文字的主角',
  '- 功能应当服务于思想',
  '- 书写带来快乐',
].join('\n')

const timeline = {
  typing: [0, 4.0],
  ghost: [4.0, 6.0],
  accepted: [6.0, 7.4],
  structureBusy: [7.4, 9.2],
  structureReveal: [9.2, 11.2],
}

const frames = Array.from({ length: 112 }, (_, index) => index / 10)

const stateAt = (t) => {
  const phase = Object.entries(timeline).find(([, [from, to]]) => t >= from && t < to)?.[0] ?? 'structureReveal'
  const [from, to] = timeline[phase]
  const progress = Math.min(1, Math.max(0, (t - from) / (to - from)))

  if (phase === 'typing') {
    // Type line by line; each finished line is normalised (two spaces become a bullet).
    const perLine = Math.ceil(typed.length / 1)
    const totalChars = typed.join('\n').length
    const typedChars = Math.floor(progress * totalChars)
    let taken = 0
    const lines = []
    for (const line of typed) {
      if (taken >= typedChars) break
      const room = typedChars - taken
      lines.push(line.slice(0, room))
      taken += line.length + 1
    }
    const text = formatLocally(lines.join('\n'))
    return { phase, text, preview: html(renderNoteBody(text)), ghost: '', accepted: null, busy: '', wipe: 1 }
  }
  if (phase === 'ghost') {
    const text = formatLocally(typed.join('\n'))
    return { phase, text, preview: html(renderNoteBody(text)), ghost: ghostText, accepted: null, busy: '', wipe: 1 }
  }
  if (phase === 'accepted') {
    const text = formatLocally(typed.join('\n')) + ghostText
    const accepted = { start: text.length - ghostText.length, end: text.length }
    return { phase, text, preview: html(renderNoteBody(text)), ghost: nextGhost, accepted, busy: '', wipe: 1 }
  }
  if (phase === 'structureBusy') {
    const text = formatLocally(typed.join('\n')) + ghostText
    return {
      phase,
      text,
      preview: html(renderNoteBody(text)),
      ghost: '',
      accepted: null,
      busy: '正在整理… ' + Math.max(1, Math.ceil(progress * (to - from))) + 's',
      wipe: 1,
    }
  }
  const text = structured
  return { phase, text, preview: html(renderNoteBody(formatLocally(text))), ghost: '', accepted: null, busy: '', wipe: progress }
}

const states = frames.map((t) => {
  const state = stateAt(t)
  // the mirror shows the accepted span in the same green the panel uses
  const escaped = escapeHtml(state.text)
  if (state.accepted === null) {
    state.mirror = escaped + (state.ghost === '' ? '' : `<span class="dshn-ghost">${escapeHtml(state.ghost)}</span>`)
  } else {
    const before = escapeHtml(state.text.slice(0, state.accepted.start))
    const middle = escapeHtml(state.text.slice(state.accepted.start, state.accepted.end))
    const after = escapeHtml(state.text.slice(state.accepted.end))
    state.mirror =
      before +
      `<mark class="dshn-mark-accepted">${middle}</mark>` +
      after +
      (state.ghost === '' ? '' : `<span class="dshn-ghost">${escapeHtml(state.ghost)}</span>`)
  }
  return state
})

const cssSource = await readFile(join(packageDir, 'src', 'head.js'), 'utf8')
const cssStart = cssSource.indexOf('const STYLES = `')
const cssEnd = cssSource.indexOf('\n`', cssStart)
const css = cssSource.slice(cssStart + 'const STYLES = `'.length, cssEnd)

const busyDefault = html(PreviewBusy({ label: '正在整理… 2s' }))

const page = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>dsh-notes 1.1 demo</title>
<style>
:root{--dsw-alias-label-primary:#1b1b1b;--dsw-alias-label-secondary:#6b6b6b;--dsw-alias-bg-base:#fff;--dsw-alias-bg-layer-1:#fff;--dsw-alias-bg-layer-2:#f2f2f2;--dsw-alias-border-l1:#e3e3e3;--dsw-alias-border-l2:#d0d0d0;--dsw-alias-brand-primary:#1f6feb;--dsw-alias-state-success-primary:#2ea043;--dsw-alias-state-error-primary:#cf222e;--dshn-heat-0:#ebedf0;--dshn-heat-1:#9be9a8;--dshn-r-sm:6px;--dshn-r-md:10px;--dshn-r-lg:14px}
html,body{margin:0;background:var(--dsw-alias-bg-base);font:13.5px/1.7 -apple-system,"Segoe UI",system-ui,sans-serif;color:var(--dsw-alias-label-primary)}
.stage{width:1180px;padding:18px 20px 14px}
.tabs{display:flex;gap:14px;font-size:12.5px;color:var(--dsw-alias-label-secondary);border-bottom:1px solid var(--dsw-alias-border-l1);padding-bottom:8px;margin-bottom:12px}
.tabs b{color:var(--dsw-alias-label-primary);font-weight:600;border-bottom:2px solid var(--dsw-alias-label-primary);padding-bottom:8px;margin-bottom:-9px}
.sheets{display:flex;gap:26px;position:relative}
.sheet{flex:1 1 0;min-width:0;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dshn-r-md);padding:14px 16px;display:flex;flex-direction:column;gap:10px;background:var(--dsw-alias-bg-layer-1);height:470px}
.sheet-label{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.tools{display:flex;gap:6px;align-items:center;margin-top:auto;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1);font-size:12px;color:var(--dsw-alias-label-secondary)}
.tools .grow{flex:1 1 auto}
.btn{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:inherit;border-radius:var(--dshn-r-sm);padding:4px 12px;font:inherit;font-size:12px}
.btn.primary{background:#1b1b1b;border-color:#1b1b1b;color:#fff;font-weight:600;padding:5px 16px}
.caption{font-size:11.5px;color:var(--dsw-alias-label-secondary);margin-top:10px;min-height:16px}
.handle{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:18px;height:44px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:#fff;display:grid;place-items:center;color:var(--dsw-alias-label-secondary);box-shadow:0 1px 3px rgb(0 0 0 / 8%);font-size:11px}
</style>
<style>${css}</style>
</head><body>
<div class="stage">
  <div class="tabs"><b>Capture</b><span>History 12</span><span>Board</span></div>
  <div class="sheets">
    <div class="sheet" data-role="source">
      <div class="sheet-label">Source · 极简写</div>
      <div class="dshn-composer" style="flex:1 1 auto;min-height:0">
        <div class="dshn-editor-area" style="flex:1 1 auto;min-height:0">
          <div class="dshn-editor-marks" id="mirror" aria-hidden="true"></div>
          <textarea class="dshn-textarea" id="editor" spellcheck="false" style="min-height:0;height:100%"></textarea>
        </div>
      </div>
      <div class="tools"><span id="chars">0 字</span><span class="grow"></span>
        <button class="btn" id="structure">✦ 结构化</button>
        <button class="btn" id="cancel">取消</button>
        <button class="btn primary" id="save">保存</button>
      </div>
    </div>
    <div class="sheet" data-role="render">
      <div class="sheet-label" id="render-label">排版结果</div>
      <div class="dshn-page-render" id="preview" style="flex:1 1 auto;min-height:0;overflow:hidden;clip-path:inset(0 0 0 0)"></div>
      <div class="tools"><span id="busy" style="display:none">${busyDefault}</span><span class="grow"></span>
        <button class="btn" id="translate">翻译选区</button>
      </div>
    </div>
    <div class="handle">›</div>
  </div>
  <div class="caption" id="caption"></div>
</div>
<script>
  const states = ${JSON.stringify(states)}
  const editor = document.getElementById('editor')
  const mirror = document.getElementById('mirror')
  const preview = document.getElementById('preview')
  const busy = document.getElementById('busy')
  const chars = document.getElementById('chars')
  const label = document.getElementById('render-label')
  const caption = document.getElementById('caption')

  const captions = {
    typing: '两个空格就是项目符号；再缩进就是下一级。',
    ghost: '停手 1 秒：笔记自己的话先答，其次才是模型。',
    accepted: 'TAB 采纳，绿标还在；一次 Backspace 就能收回。',
    structureBusy: '结构化只在需要时出手，进度在工具栏。',
    structureReveal: '结果落回同一页：标题、小节、连续编号。',
  }

  window.demo = {
    seek(t) {
      const state = states[Math.min(states.length - 1, Math.max(0, Math.round(t * 10)))]
      editor.value = state.text
      chars.textContent = state.text.length + ' 字'
      mirror.innerHTML = state.mirror
      preview.innerHTML = state.preview
      preview.style.clipPath = 'inset(0 ' + Math.round((1 - (state.wipe ?? 1)) * 100) + '% 0 0)'
      busy.style.display = state.busy === '' ? 'none' : 'inline-flex'
      if (state.busy !== '') {
        const node = busy.querySelector('.dshn-busy-label')
        if (node !== null) node.textContent = state.busy
      }
      label.textContent = state.phase.startsWith('structure') ? 'AI 草稿 · 结构化结果' : '排版结果'
      caption.textContent = captions[state.phase] ?? ''
      document.getElementById('structure').style.outline = state.phase === 'structureBusy' ? '2px solid #1f6feb' : 'none'
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1212, height: 640, deviceScaleFactor: 1, mobile: false })
  await new Promise((resolve) => setTimeout(resolve, 600))

  const clip = { x: 0, y: 0, width: 1212, height: 640, scale: 1 }
  const framesDir = join(outDir, 'frames')
  await mkdir(framesDir, { recursive: true })
  for (const [index, t] of frames.entries()) {
    await send('Runtime.evaluate', { expression: `window.demo.seek(${t})` })
    const shot = await send('Page.captureScreenshot', { format: 'png', clip })
    await writeFile(join(framesDir, `f${String(index).padStart(3, '0')}.png`), Buffer.from(shot.result.data, 'base64'))
  }

  const stills = {
    '01-spaces-are-structure': 3.6,
    '02-suggestion': 5.2,
    '03-accepted': 6.9,
    '04-structured': 10.8,
  }
  await mkdir(join(outDir, 'stills'), { recursive: true })
  for (const [name, t] of Object.entries(stills)) {
    await send('Runtime.evaluate', { expression: `window.demo.seek(${t})` })
    const shot = await send('Page.captureScreenshot', { format: 'png', clip })
    await writeFile(join(outDir, 'stills', `${name}.png`), Buffer.from(shot.result.data, 'base64'))
  }

  await realFetch(`${base}/json/close/${target.id}`)
  socket.close()
  console.log('captured', frames.length, 'frames + 4 stills')
}
