// Marketing assets for the release: one animated demo (a GIF) and a few stills.
//
// The page is built from the plugin's own renderer and stylesheet, so what the GIF shows is what the
// panel draws — not a hand-made mock. Every frame is deterministic: the page exposes
// `window.demo.seek(t)`, which sets the whole state for time t, and a CDP loop captures each t.
//
// Usage:
//   node tools/marketing.mjs                 # writes exports/marketing/*.html and the frame list
//   node tools/marketing.mjs --capture        # also drives Chrome (port 9222) and writes frames
//   python tools/marketing_gif.py             # frames -> dsh-notes-demo.gif
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const packageDir = join(here, '..')
const outDir = join(packageDir, 'exports', 'marketing')
const fixtures = join(outDir, '_fixture')

// ---------------------------------------------------------------- the plugin's own renderer ---
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
globalThis.window = { __ModuleLoader__: { load: (definition) => { globalThis.__factory = definition.factory } }, addEventListener() {}, removeEventListener() {} }
globalThis.localStorage = { getItem: () => 'auto', setItem() {} }
Object.defineProperty(globalThis, 'navigator', { value: { language: 'zh-CN' }, configurable: true })
globalThis.setInterval = () => 0
globalThis.clearInterval = () => {}
globalThis.__DSH_NOTES_TEST__ = true

await mkdir(fixtures, { recursive: true })
await writeFile(join(fixtures, 'client.mjs'), await readFile(join(packageDir, 'client.js'), 'utf8'), 'utf8')
await import(pathToFileURL(join(fixtures, 'client.mjs')).href)
globalThis.__factory((name) => (name === 'react' ? React : undefined))

const { formatLocally, renderNoteBody, renderMarkdown, plainLine, PreviewBusy, composeFormattedNote } = globalThis.__dshNotesInternals

const escapeHtml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const html = (node) => {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string') return escapeHtml(node)
  if (Array.isArray(node)) return node.map(html).join('')
  const attrs = Object.entries(node.props ?? {})
    // undefined/null/false must not become attributes: React omits them, and writing
    // data-task="undefined" silently hides the bullet marker in the demo.
    .filter(([key, value]) => key !== 'children' && key !== 'key' && value !== undefined && value !== null && value !== false)
    .map(([key, value]) => {
      const name = key === 'className' ? 'class' : key
      return ` ${name}="${escapeHtml(value)}"`
    })
    .join('')
  return `<${node.node}${attrs}>${(node.children ?? []).map(html).join('')}</${node.node}>`
}

// ------------------------------------------------------------------------------- the script ---
const raw = [
  '今天好累',
  '早上开会 9:40 到 11:00 讲了啥记不太清 大概是上线时间',
  '李四说要压测 但机器不够 具体哪天没说',
  '报销 发票 月底前 1280',
  '下周安排',
  '1、上线时间还没定 要看压测',
  '1、压测环境找张三要',
  '1、配色下版再说',
  '— 部署：rollback 脚本没写 王五说先手动回滚',
  '· 缓存：命中率没人统计过 先埋点',
].join('\n')

// What Structure returns (a real shape: title, sections, fixed numbering, dashes as bullets).
const structured = [
  '本周记录：会议、压测与报销',
  '',
  '## 会议',
  '- 早上开会 9:40 到 11:00，记不清细节，大致是上线时间',
  '',
  '## 待办',
  '1. 上线时间还没定，要看压测',
  '2. 压测环境找张三要',
  '3. 配色下版再说',
  '- 部署：rollback 脚本没写，王五说先手动回滚',
].join('\n')

const translatedLines = ['1. Launch date is not decided yet; it depends on the load test', '2. Ask Zhang San for the load-test environment']
/** The two lines the demo selects, keyed the way the renderer keys them. */
const selectedKeys = () =>
  new Set(
    structured
      .split('\n')
      .filter((line) => line.includes('上线时间还没定') || line.includes('压测环境找张三要'))
      .map((line) => plainLine(line)),
  )

// splice the translated span back, exactly like the panel does
const start = raw.indexOf('1、上线时间还没定')
const end = raw.indexOf('1、配色下版再说')
const after = raw.slice(end)
const spliced = raw.slice(0, start) + translatedLines.join('\n') + (after.startsWith('\n') ? '' : '\n') + after
const translatedNote = composeFormattedNote('', formatLocally(spliced))
const marks = new Set(translatedLines.map((line) => plainLine(line)))

// typing states: the format preview is recomputed for each prefix
const typingSteps = []
const stepChars = 6
for (let length = 0; length <= raw.length; length += stepChars) {
  const text = raw.slice(0, length)
  typingSteps.push({
    text,
    preview: text.trim() === '' ? '' : html(renderNoteBody(formatLocally(text))),
    marked: '',
  })
}

// ------------------------------------------------------------------------------ the timeline ---
// seconds: typing -> structure busy -> structure reveal -> selection -> translate busy -> reveal
const timeline = {
  typing: [0, 3.4],
  structureClick: [3.4, 3.9],
  structureBusy: [3.9, 6.1],
  structureReveal: [6.1, 8.0],
  selecting: [8.0, 9.2],
  translateClick: [9.2, 9.7],
  translateBusy: [9.7, 11.9],
  translateReveal: [11.9, 13.6],
}

const frameCount = 136 // 13.6 s at 10 fps
const frames = Array.from({ length: frameCount }, (_, index) => index / 10)

const stateTable = frames.map((t) => {
  const phase = Object.entries(timeline).find(([, [from, to]]) => t >= from && t < to)?.[0] ?? 'translateReveal'
  const [from, to] = timeline[phase]
  const progress = Math.min(1, Math.max(0, (t - from) / (to - from)))

  if (phase === 'typing') {
    const index = Math.min(typingSteps.length - 1, Math.floor(progress * typingSteps.length))
    return { ...typingSteps[index], phase, progress, seconds: 0, wipe: 1 }
  }
  if (phase === 'structureClick') {
    return { text: raw, preview: html(renderNoteBody(formatLocally(raw))), phase, progress, seconds: 0, wipe: 1, pressed: progress > 0.35 }
  }
  if (phase === 'structureBusy') {
    return {
      text: raw,
      preview: html(renderNoteBody(formatLocally(raw))),
      phase,
      progress,
      seconds: Math.max(1, Math.ceil(progress * (to - from))),
      wipe: 1,
    }
  }
  if (phase === 'structureReveal') {
    return { text: structured, preview: html(renderNoteBody(formatLocally(structured))), phase, progress, seconds: 0, wipe: progress }
  }
  if (phase === 'selecting') {
    const selectProgress = Math.min(1, progress * 1.6)
    return {
      text: structured,
      preview: html(renderNoteBody(formatLocally(structured), selectProgress > 0.5 ? selectedKeys() : undefined)),
      phase,
      progress,
      seconds: 0,
      wipe: 1,
      selection: selectProgress,
    }
  }
  if (phase === 'translateClick' || phase === 'translateBusy') {
    const selected = selectedKeys()
    return {
      text: structured,
      preview: html(renderNoteBody(formatLocally(structured), selected)),
      phase,
      progress,
      seconds: phase === 'translateClick' ? 0 : Math.max(1, Math.ceil(progress * (to - from))),
      wipe: 1,
      pressed: phase === 'translateClick' && progress > 0.35,
      selection: 1,
    }
  }
  return {
    text: transcribed(spliced),
    preview: html(renderNoteBody(translatedNote, marks)),
    phase,
    progress,
    seconds: 0,
    wipe: progress,
    selection: 1,
  }
})

function transcribed(text) {
  return text
}

// ------------------------------------------------------------------------------------- page ---
const source = await readFile(join(packageDir, 'src', 'head.js'), 'utf8')
const cssStart = source.indexOf('const STYLES = `')
const cssEnd = source.indexOf('\n`', cssStart)
const css = source.slice(cssStart + 'const STYLES = `'.length, cssEnd)

const busyDefault = html(PreviewBusy({ label: '正在整理… 3s' }))

const page = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>dsh-notes demo</title>
<style>
:root{--dsw-alias-label-primary:#1b1b1b;--dsw-alias-label-secondary:#6b6b6b;--dsw-alias-bg-base:#ffffff;--dsw-alias-bg-layer-1:#ffffff;--dsw-alias-bg-layer-2:#f2f2f2;--dsw-alias-border-l1:#e3e3e3;--dsw-alias-border-l2:#d0d0d0;--dsw-alias-brand-primary:#1f6feb;--dsw-alias-state-success-primary:#2ea043;--dsw-alias-state-error-primary:#cf222e;--dshn-heat-0:#ebedf0;--dshn-heat-1:#9be9a8;--dshn-heat-2:#40c463;--dshn-heat-3:#30a14e;--dshn-heat-4:#216e39;--dshn-r-sm:6px;--dshn-r-md:10px;--dshn-r-lg:14px}
html,body{margin:0;background:var(--dsw-alias-bg-base);font:13px/1.6 -apple-system,"Segoe UI",system-ui,sans-serif;color:var(--dsw-alias-label-primary)}
.stage{width:900px;padding:20px 22px 16px}
.tabs{display:flex;gap:14px;font-size:12.5px;color:var(--dsw-alias-label-secondary);border-bottom:1px solid var(--dsw-alias-border-l1);padding-bottom:8px;margin-bottom:12px}
.tabs b{color:var(--dsw-alias-label-primary);font-weight:600;border-bottom:2px solid var(--dsw-alias-label-primary);padding-bottom:8px;margin-bottom:-9px}
.panes{display:flex;gap:14px;align-items:stretch}
.pane{flex:1 1 50%;min-width:0;min-height:546px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dshn-r-md);padding:12px;display:flex;flex-direction:column;gap:8px;background:var(--dsw-alias-bg-layer-1)}
.pane-label{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.tools{display:flex;gap:6px;align-items:center;margin-top:auto;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1);font-size:12px;color:var(--dsw-alias-label-secondary)}
.tools .grow{flex:1 1 auto}
.btn{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:inherit;border-radius:var(--dshn-r-sm);padding:3px 10px;font:inherit;font-size:12px}
.btn.primary{background:#1b1b1b;border-color:#1b1b1b;color:#fff}
.btn.pressed{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.hint{font-size:11px;color:var(--dsw-alias-label-secondary);height:14px}
.caption{font-size:11.5px;color:var(--dsw-alias-label-secondary);margin-top:10px;min-height:16px}
/* the reveal: the same motion the panel uses */
.wipe{animation:none;clip-path:inset(0 0 0 0)}
/* Demo scale: the pane is a marketing frame, so the note is tuned to fit it whole. */
.stage .dshn-md { font-size: 12.5px; line-height: 1.65 }
.stage .dshn-md-h { margin: 12px 0 5px; font-size: 15px }
.stage .dshn-note-title { font-size: 19px; margin-bottom: 6px }
.stage .dshn-md-p { margin: 0 0 8px }
.stage .dshn-md-item { margin: 1px 0 }
.stage .dshn-textarea { font-size: 12.5px; line-height: 1.7 }
</style>
<style>${css}</style>
</head><body>
<div class="stage">
  <div class="tabs"><b>Capture</b><span>History 8</span><span>Board</span></div>
  <div class="panes">
    <div class="pane">
      <div class="pane-label">Source</div>
      <div class="dshn-composer">
        <div class="dshn-editor-area">
          <div class="dshn-editor-marks" id="marks" aria-hidden="true"></div>
          <textarea class="dshn-textarea" id="editor" spellcheck="false" style="min-height:300px"></textarea>
        </div>
      </div>
      <div class="tools"><span id="chars">0 characters</span><span class="grow"></span>
        <button class="btn" id="structure">✦ Structure</button>
        <button class="btn" id="cancel">Cancel</button>
        <button class="btn primary" id="save">Save</button>
      </div>
    </div>
    <div class="pane">
      <div class="pane-label" id="render-label">Rendered</div>
      <div class="dshn-page-render wipe" id="preview" style="flex:1 1 auto;min-height:0;overflow:hidden"></div>
      <div class="tools">
        <span>Auto (Chinese → English) ▾</span>
        <span id="busy" style="display:none">${busyDefault}</span>
        <button class="btn" id="translate">Translate selection</button>
        <span class="grow"></span>
        <button class="btn" id="apply">Apply</button>
      </div>
    </div>
  </div>
  <div class="caption" id="caption"></div>
</div>
<script>
  const states = ${JSON.stringify(stateTable)}
  const editor = document.getElementById('editor')
  const marks = document.getElementById('marks')
  const preview = document.getElementById('preview')
  const busy = document.getElementById('busy')
  const translate = document.getElementById('translate')
  const structure = document.getElementById('structure')
  const label = document.getElementById('render-label')
  const caption = document.getElementById('caption')
  const chars = document.getElementById('chars')

  const captions = {
    typing: 'Type once. The right page is already the typeset result — no button.',
    structureClick: 'Structure is the only AI step.',
    structureBusy: 'Working: a spinner and seconds in the toolbar, the note stays readable.',
    structureReveal: 'The rewrite lands in place, revealed like ink.',
    selecting: 'Select a span: the same lines light up on the right.',
    translateClick: 'Translate the selection — or the whole note.',
    translateBusy: 'Working again; the document does not move.',
    translateReveal: 'Only the selected lines change, and nothing else is lost.',
  }

  window.demo = {
    seek(t) {
      const state = states[Math.min(states.length - 1, Math.max(0, Math.round(t * 10)))]
      editor.value = state.text
      chars.textContent = state.text.length + ' characters'

      // selection: native in the textarea, mirrored in the overlay
      const selected = state.selection ?? 0
      if (selected > 0.5) {
        // After the translation lands the selected lines are English: mark those instead, and clear
        // the native selection (nothing is being chosen any more).
        const applied = state.phase === 'translateReveal'
        const firstNeedle = applied ? 'Launch date is not decided' : '上线时间还没定'
        const lastNeedle = applied ? 'load-test environment' : '压测环境找张三要'
        // Match the line, not its numbering: the draft rewrites "1、" as "1.".
        const LF = String.fromCharCode(10)
        const lineStart = (source, needle) => {
          const at = source.indexOf(needle)
          return at < 0 ? -1 : source.lastIndexOf(LF, at) + 1
        }
        const from = lineStart(state.text, firstNeedle)
        const second = lineStart(state.text, lastNeedle)
        const breakAt = second < 0 ? -1 : state.text.indexOf(LF, second)
        const to = second < 0 ? state.text.length : breakAt < 0 ? state.text.length : breakAt
        if (applied) editor.setSelectionRange(0, 0)
        else if (from >= 0) editor.setSelectionRange(from, to)
        const esc = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        marks.innerHTML =
          esc(state.text.slice(0, from)) +
          '<mark class="dshn-editor-mark">' + esc(state.text.slice(from, to)) + '</mark>' +
          esc(state.text.slice(to))
      } else {
        editor.setSelectionRange(0, 0)
        marks.textContent = ''
      }

      preview.innerHTML = state.preview
      preview.style.clipPath = 'inset(0 ' + Math.round((1 - (state.wipe ?? 1)) * 100) + '% 0 0)'
      preview.style.opacity = state.wipe === 0 ? '0' : String(0.35 + 0.65 * (state.wipe ?? 1))

      const working = state.phase === 'structureBusy' || state.phase === 'translateBusy'
      busy.style.display = working ? 'inline-flex' : 'none'
      if (working) {
        const text = (state.phase === 'translateBusy' ? '正在翻译' : '正在整理') + '… ' + state.seconds + 's'
        busy.firstElementChild.querySelector('.dshn-busy-label').textContent = text
      }
      translate.style.display = working ? 'none' : 'inline-flex'
      if (state.phase === 'structureBusy') translate.textContent = 'Translate selection'

      structure.classList.toggle('pressed', state.pressed === true && state.phase === 'structureClick')
      translate.classList.toggle('pressed', state.pressed === true && state.phase === 'translateClick')

      label.textContent = state.phase === 'typing' ? 'Formatted · live'
        : state.phase.startsWith('structure') ? 'AI draft · 82 characters'
        : state.phase.startsWith('translate') ? 'Translated selection'
        : 'Formatted · live'
      caption.textContent = captions[state.phase] ?? ''
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
  const rawTarget = await created.text()
  let target
  try {
    target = JSON.parse(rawTarget)
  } catch {
    console.error('CDP returned non-JSON:', rawTarget.slice(0, 200))
    process.exit(1)
  }
  if (target?.webSocketDebuggerUrl === undefined) {
    console.error('CDP target has no websocket url:', rawTarget.slice(0, 300))
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
  await send('Emulation.setDeviceMetricsOverride', { width: 944, height: 672, deviceScaleFactor: 1, mobile: false })
  await new Promise((resolve) => setTimeout(resolve, 600))

  const clip = { x: 0, y: 0, width: 944, height: 672, scale: 1 }
  const framesDir = join(outDir, 'frames')
  await mkdir(framesDir, { recursive: true })
  for (const [index, t] of frames.entries()) {
    await send('Runtime.evaluate', { expression: `window.demo.seek(${t})` })
    const shot = await send('Page.captureScreenshot', { format: 'png', clip })
    await writeFile(join(framesDir, `f${String(index).padStart(3, '0')}.png`), Buffer.from(shot.result.data, 'base64'))
  }

  // stills from the same states
  const stills = { '01-format-live': 3.3, '02-structure-reveal': 7.6, '03-translate-busy': 11.0, '04-translated': 13.4 }
  await mkdir(join(outDir, 'stills'), { recursive: true })
  for (const [name, t] of Object.entries(stills)) {
    await send('Runtime.evaluate', { expression: `window.demo.seek(${t})` })
    const shot = await send('Page.captureScreenshot', { format: 'png', clip })
    await writeFile(join(outDir, 'stills', `${name}.png`), Buffer.from(shot.result.data, 'base64'))
  }

  await realFetch(`${base}/json/close/${target.id}`)
  socket.close()
  console.log('captured', frames.length, 'frames + 4 stills into exports/marketing/')
}
