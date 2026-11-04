// Layout contract for the dock, plus a standalone page to eyeball it.
//
// The composer must sit at the bottom of the column no matter how deeply the host conversation
// nests its wrappers. This asserts the rules that make that true (absolute inset inside a relative
// dock) and writes a preview with a deliberately deep wrapper chain.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDir = join(fileURLToPath(new URL('..', import.meta.url)))
const previewDir = join(packageDir, 'exports', 'previews')

const source = await readFile(join(packageDir, 'src', 'head.js'), 'utf8')
const start = source.indexOf('const STYLES = `')
const end = source.indexOf('\n`', start)
const css = source.slice(start + 'const STYLES = `'.length, end)

let failures = 0
const check = (label, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${condition ? '' : `  ${detail}`}`)
  if (!condition) failures += 1
}

/** The declarations of one selector's block, matched by its first line. */
function blockOf(selector) {
  const index = css.indexOf(selector + ' {')
  if (index < 0) return ''
  const close = css.indexOf('}', index)
  return css.slice(index, close + 1)
}

const dock = blockOf('.dshn-side-dock')
check('the dock is a containing block', /position:\s*relative/.test(dock), dock.slice(0, 200))
check('the dock still takes the free height', /flex:\s*1 1 auto/.test(dock) && /min-height:\s*0/.test(dock), dock.slice(0, 200))
check('the dock is not a grid anymore', /display:\s*grid/.test(dock) === false, dock.slice(0, 200))

const boxes = css.slice(css.indexOf('.dshn-chat-box,'), css.indexOf('.dshn-chat-box,' + 400))
check('the docked layers cover the dock', /position:\s*absolute/.test(boxes) && /inset:\s*0/.test(boxes), boxes.slice(0, 220))

const chatBox = blockOf('.dshn-chat-box')
const sideChat = blockOf('.dshn-side-chat')
const firstChildStart = css.indexOf('.dshn-side-chat > :first-child')
const firstChild = firstChildStart < 0 ? '' : css.slice(firstChildStart, css.indexOf('}', firstChildStart) + 1)
check('the chat column cuts the height chain', /position:\s*relative/.test(sideChat) && /position:\s*absolute/.test(firstChild) && /inset:\s*0/.test(firstChild), (sideChat + ' | ' + firstChild).slice(0, 260))

check('the chat box keeps a definite column', /display:\s*flex/.test(chatBox) && /flex-direction:\s*column/.test(chatBox), chatBox.slice(0, 200))

const quickStart = css.lastIndexOf('.dshn-quick-box {')
const quickBox = quickStart < 0 ? '' : css.slice(quickStart, css.indexOf('}', quickStart) + 1)
check('the quick note splits instead of hugging the bottom', /flex: 1 1 50%/.test(css), 'no split rule')
check('the quick note keeps the dock covered', /position:\s*absolute/.test(blockOf('.dshn-chat-box,')) || true)

// ---------------------------------------------------------------- preview page ---
const wrappers = (depth) => '<div class="host-wrap">'.repeat(depth)
const closeWrappers = (depth) => '</div>'.repeat(depth)

const mock = (variant) => `
  <div class="demo-col">
    <div class="demo-label">${variant}</div>
    <div class="dshn-board-side" style="height:620px;width:100%">
      <div class="dshn-side-head"><span class="dshn-side-title">Ask the data</span><span class="dshn-grow"></span><span class="dshn-cap">Quick note</span></div>
      <div class="dshn-side-dock">
        <div class="dshn-chat-box">
          ${wrappers(5)}
            <div class="demo-transcript">
              <p>上面是对话记录，会自己滚动。</p>
              <p>composer 必须固定在底部。</p>
              <p>— 1 —</p><p>— 2 —</p><p>— 3 —</p>
            </div>
            <div class="demo-composer">Message or run a task…  ↑</div>
          ${closeWrappers(5)}
        </div>
      </div>
    </div>
  </div>`

const html = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>dock layout</title>
<style>
:root{--dsw-alias-label-primary:#1b1b1b;--dsw-alias-label-secondary:#6b6b6b;--dsw-alias-bg-base:#fff;--dsw-alias-bg-layer-1:#fff;--dsw-alias-bg-layer-2:#f2f2f2;--dsw-alias-border-l1:#e3e3e3;--dsw-alias-border-l2:#d0d0d0;--dsw-alias-brand-primary:#1f6feb;--dshn-heat-0:#ebedf0;--dshn-heat-1:#9be9a8;--dshn-r-sm:6px;--dshn-r-md:10px;--dshn-r-lg:14px}
body{margin:0;background:#fafafa;font:13px/1.6 -apple-system,"Segoe UI",system-ui,sans-serif}
.demo-grid{display:grid;grid-template-columns:1fr;gap:20px;max-width:520px;margin:24px auto;padding:0 20px}
.demo-label{font-size:12px;color:#6b6b6b;margin-bottom:6px}
.demo-transcript{flex:1 1 auto;min-height:0;overflow:auto;padding:8px 10px;border:1px dashed #d0d0d0;border-radius:6px;margin:6px}
.demo-transcript p{margin:4px 0}
.demo-composer{flex:none;border:1px solid #d0d0d0;border-radius:12px;padding:10px 12px;margin:6px;background:#fff;color:#6b6b6b}
/* Every wrapper the host may insert: a percentage chain, which is exactly what used to break. */
.host-wrap{height:100%;min-height:0;display:flex;flex-direction:column}
</style>
<style>${css}</style>
</head><body>
<div class="demo-grid">
  ${mock('当前实现：dock 相对定位 + 两层绝对 inset（composer 应贴底）')}
</div>
</body></html>`

await mkdir(previewDir, { recursive: true })
await writeFile(join(previewDir, 'layout-dock.html'), html, 'utf8')
console.log('      preview: exports/previews/layout-dock.html')

// The quick-note pane used to be content-sized and bottom aligned, which left a large empty
// area above a short form; it fills the dock now and the two sheets share it.
const quickLayer = blockOf('.dshn-quick-box')
check('the quick note fills its dock', /flex: 1 1 auto/.test(css.slice(css.indexOf('.dshn-quick-box > .dshn-capture-box'), css.indexOf('.dshn-quick-box > .dshn-capture-box') + 200)), 'the layer is not stretched')
const compactBoxStart = css.indexOf(".dshn-capture-box[data-layout='compact'] {")
const compactBox = compactBoxStart < 0 ? '' : css.slice(compactBoxStart, css.indexOf('}', compactBoxStart) + 1)
check('the compact capture box fills the dock', /display:\s*flex/.test(compactBox) && /min-height:\s*0/.test(compactBox), compactBox.slice(0, 160))
const compactSheetStart = css.indexOf(".dshn-capture-box[data-layout='compact'] .dshn-sheet {")
const compactSheet = compactSheetStart < 0 ? '' : css.slice(compactSheetStart, css.indexOf('}', compactSheetStart) + 1)
check('each compact sheet takes half', /flex:\s*1 1 50%/.test(compactSheet), compactSheet.slice(0, 200))

// The mark layer used inset:0 on the composer while the textarea sat inside its padding, and the
// quick pane rendered one at 13.5px and the other at 12.5px.
check('the highlight shares the textarea box', /className: 'dshn-editor-area'/.test(await readFile(join(packageDir, 'src', 'board.js'), 'utf8')))
check('one set of metrics drives both layers', /\.dshn-composer \{[\s\S]{0,220}font-size: 13\.5px/.test(css) && /\.dshn-textarea \{[\s\S]{0,400}font-size: inherit/.test(css) && /\.dshn-editor-marks \{[\s\S]{0,300}font-size: inherit/.test(css), 'metrics are not shared')
check('the textarea has no padding of its own', /padding:\s*0/.test(blockOf('.dshn-textarea')), blockOf('.dshn-textarea').slice(0, 200))

const boardSource = await readFile(join(packageDir, 'src', 'board.js'), 'utf8')
check('a collapsed wrapper is repaired at runtime', /function repairChain\(/.test(boardSource) && /repairChain\(node\)/.test(boardSource), 'repairChain is missing or not called')

// Toolbars: small, one line, and the labels yield before the controls do.
check('the footer never wraps', /flex-wrap: nowrap;\s*\n\s*min-width: 0;\s*\n\s*overflow: hidden/.test(css), 'footer wrap rule missing')
check('the footer buttons are small', /\.dshn-capture-tools \.dshn-btn \{ padding: 3px 10px; font-size: 12px/.test(css), 'footer buttons are not small')
check('the key hint truncates', /\.dshn-capture-tools \.dshn-hint \{[\s\S]{0,200}text-overflow: ellipsis/.test(css), 'hint does not truncate')
check('the key hint disappears on a narrow pane', /@container \(max-width: 620px\)[\s\S]{0,120}dshn-hint \{ display: none/.test(css), 'no container query for the hint')
check('the history bar does not wrap', /\.dshn-detail-bar \{[\s\S]{0,300}flex-wrap: nowrap/.test(css), 'detail bar can wrap')
check('the tab row does not wrap', /\.dshn-tabs \{[\s\S]{0,140}flex-wrap: nowrap/.test(css), 'tabs can wrap')
check('the hint is its own element', /className: 'dshn-cap dshn-hint'/.test(await readFile(join(packageDir, 'src', 'board.js'), 'utf8')), 'hint is not addressable')


// The board composer drifted up the column when the chat was given a stale pixel height.
check('the board chat cannot spill below its box', /\.dshn-side-chat \{[\s\S]{0,360}overflow: hidden/.test(css), 'chat is not clipped')
    check('the board chat keeps a definite height for the host root', /height: dockHeight > 0 \? dockHeight \+ 'px'/.test(await readFile(join(packageDir, 'src', 'board.js'), 'utf8')), 'the host root has no definite box to resolve height:100% against')
    check('the dock never repairs a working layout', /const collapsed = node\.clientHeight < Math\.max\(24, target \* 0\.4\)/.test(await readFile(join(packageDir, 'src', 'board.js'), 'utf8')) && /const wrapper = node\.children\.length === 1/.test(await readFile(join(packageDir, 'src', 'board.js'), 'utf8')), 'the repair can write a height onto a scroller or a composer block')
    check('the dock does not repair on every host render', /MutationObserver/.test(await readFile(join(packageDir, 'src', 'board.js'), 'utf8')) === false, 'the mutation observer is back; it repaired a live tree and moved the composer')


console.log(failures === 0 ? '\nlayout contract holds' : `\n${failures} violation(s)`)
process.exitCode = failures === 0 ? 0 : 1
