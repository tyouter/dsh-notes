// End-to-end corpus test against the running app.
//
// Ten inputs, from stream-of-thought to carefully typeset Markdown. For each one: structure it with
// the real model, apply the client's repair chain (markup restore → coverage repair), judge it with
// the typography gate, render it, and write an HTML preview so the result can be compared by eye.
//
// Then the same draft goes through indexed translation, to check that line structure survives a
// language change.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const packageDir = 'C:/Users/dwwekfd/OneDrive - Dr. Ing. h.c. F. Porsche AG/Documents/deepseek-harness/default-workspace/dsh-notes'
const previewDir = join(packageDir, 'exports', 'previews', 'corpus')
const fixtureDir = 'C:/Users/dwwekfd/AppData/Local/Temp/nr-corpus-fixture'

// ---------------------------------------------------------------- client-side machinery ---
const React = {
  Fragment: Symbol('Fragment'),
  createElement(type, props, ...children) {
    const flat = children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false)
    if (typeof type === 'function') {
      const all = { ...(props ?? {}), children: flat }
      return new type(all).render()
    }
    if (type === React.Fragment) return { node: '#fragment', props: {}, children: flat }
    return { node: type, props: props ?? {}, children: flat }
  },
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => undefined,
  useMemo: (factory) => factory(),
  Component: class { constructor(props) { this.props = props ?? {}; this.state = {} } setState() {} },
  useCallback: (fn) => fn,
  useRef: (initial) => ({ current: initial }),
}
globalThis.fetch = globalThis.fetch ?? fetch
const realFetch = globalThis.fetch
globalThis.window = { __ModuleLoader__: { load: (d) => { globalThis.__factory = d.factory } }, addEventListener() {}, removeEventListener() {} }
globalThis.localStorage = { getItem: () => 'auto' }
Object.defineProperty(globalThis, 'navigator', { value: { language: 'zh-CN' }, configurable: true })
globalThis.setInterval = () => 0
globalThis.clearInterval = () => {}
globalThis.__DSH_NOTES_TEST__ = true

await mkdir(fixtureDir, { recursive: true })
await mkdir(previewDir, { recursive: true })
await writeFile(join(fixtureDir, 'client.mjs'), await readFile(join(packageDir, 'client.js'), 'utf8'), 'utf8')
await import(pathToFileURL(join(fixtureDir, 'client.mjs')).href)
globalThis.__factory((name) => (name === 'react' ? React : undefined))
const {
  renderMarkdown,
  renderNoteBody,
  preserveMarkup,
  repairCoverage,
  typographyIssues,
  fidelityReport,
  assembleIndexedLines,
} = globalThis.__dshNotesInternals

// The plugin's real stylesheet, so the previews render exactly like the panel.
const bundle = await readFile(join(packageDir, 'client.js'), 'utf8')
const stylesStart = bundle.indexOf('const STYLES = `')
const stylesEnd = stylesStart < 0 ? -1 : bundle.indexOf('\n`', stylesStart)
const STYLES = stylesStart >= 0 && stylesEnd > 0 ? bundle.slice(stylesStart + 'const STYLES = `'.length, stylesEnd) : ''

// ------------------------------------------------------------------------- host discovery ---
const candidates = ['http://127.0.0.1:57123', 'http://127.0.0.1:63984', 'http://127.0.0.1:50504', 'http://127.0.0.1:55838']
let api = null
for (const base of candidates) {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1500)
    const response = await realFetch(`${base}/notes/api/charts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      signal: controller.signal,
    })
    clearTimeout(timer)
    // The plugin answers in its own envelope; any JSON from it means this is the right port.
    const payload = await response.json()
    if (payload !== null && typeof payload === 'object' && ('ok' in payload || 'error' in payload)) {
      api = `${base}/notes/api`
      break
    }
  } catch {
    /* try the next port */
  }
}
if (api === null) {
  console.error('no running app found; start DSH or adjust the port list')
  process.exit(1)
}
console.log('host:', api)

// -------------------------------------------------------------------------------- corpus ---
const corpus = [
  {
    id: '01-stream-of-thought',
    kind: '极乱：一串念头，无标点无分行',
    note: '明天要跟李四说下那个接口的事情上次说的字段还没定我觉得应该叫inputoutput然后王五那边kubernetes的rollback脚本一直没写他说要先手动回滚但是到底谁确认也没说另外报销的发票我还没交月底前必须交金额1280别忘了还有配色雾面灰配钛合金应该不错下版再说',
  },
  {
    id: '02-shorthand-fragments',
    kind: '乱：电报体、箭头、缩写、时间戳',
    note: '9:40 站会 - 张三:缓存命中率没测 - 李四:接口 mock 完成 → 待联调 - 我: 文档没写 10:15 发现线上报错 trace id abc123 影响 3 个用户 未知原因 需要查 11:00 结论待定 午饭后再看',
  },
  {
    id: '03-pseudo-markdown',
    kind: '中等：有分行和星号，但不是合法 Markdown',
    note: '周报 * 本周完成：接口联调 * 下周计划：压测 ** 风险：测试环境不稳定 *** 需要支持：机器扩容',
  },
  {
    id: '04-mixed-bullets',
    kind: '中等：项目符号 + 编号混用',
    note: '- 目标：把首 token 压到 1 秒内\n- 手段\n  1. 缓存提示词\n  2) 减少系统提示长度\n    a) 合并规则\n- 验收：3 次测量中位数 < 1s',
  },
  {
    id: '05-tidy-markdown',
    kind: '工整：标准 Markdown，标题/列表/引用齐全',
    note: '# 缓存优化记录\n\n## 背景\n首 token 平均 1.8 秒。\n\n## 结论\n- 命中缓存时 0.4 秒\n- 未命中时 1.6 秒\n\n> 注意：只在同一会话内有效\n\n## 后续\n1. 补测跨会话\n2. 记录到基线',
  },
  {
    id: '06-tidy-outline',
    kind: '工整：多套编号体系、三层嵌套',
    note: '## 议题一：加载性能\n1. 现状\n   (1) 首屏 3–5 秒\n   (2) 命中率未知\n2. 待办\n   a) 埋点 LCP\n   b) 结论下周三\n\n## 议题二：token\n一、已统计 enhance 与 copilot\n   （一）board 轮次未接\n二、字段命名未定\n   ① input/output\n   ② prompt/response',
  },
  {
    id: '07-meeting',
    kind: '会议记录：人名、决定、待办混杂',
    note: '周会 参会 张三 李四 王五请假 议题1 上线时间 结论 下周四 但要看压测结果 议题2 谁负责压测 张三说他们人手不够 我提议李四支援 李四没表态 议题3 报销 发票月底前 金额1280 我还没交',
  },
  {
    id: '08-todos-with-owners',
    kind: '待办清单：负责人/时间/状态混写',
    note: '[ ] 对齐接口 李四 周三前\n[x] 写文档 我 已完成\n[ ] 压测 张三 下周四 依赖机器\n[?] 配色定稿 待定 下版再说\n[ ] 报销发票 我 月底前 1280',
  },
  {
    id: '09-technical',
    kind: '技术笔记：命令、代码、路径、错误',
    note: '构建报错 ETIMEDOUT registry.npmjs.org 超时\n试了 npm ci --prefer-offline 仍然失败\n临时办法：换 registry https://registry.npmmirror.com\n之后要改 .npmrc 的 registry 字段\n另外 CI 缓存目录 ~/.npm 需要保留',
  },
  {
    id: '11-representative',
    kind: '代表样例：极乱段 + 伪 Markdown + 多级编号 + 待办 + 技术 + 中英混排',
    note: [
      '这周事情有点多先记下来免得忘',
      '周一 跟李四对接口 字段还没定 我觉得叫 inputoutput 比较好 但他倾向 promptresponse 还没结论',
      '',
      '周报要点 * 完成接口联调 * 下周压测 ** 风险 环境不稳定 *** 需要机器',
      '',
      '## 议题一：首 token',
      '1. 现状',
      '   (1) 平均 1.8 秒',
      '   (2) 命中缓存 0.4 秒',
      '2. 待办',
      '   a) 埋点 LCP',
      '   b) 结论下周三',
      '',
      '- [ ] 报销发票 月底前 金额 1280',
      '- [x] 写文档',
      '- [?] 配色定稿 下版再说',
      '',
      '构建报错 ETIMEDOUT registry.npmjs.org 超时 临时换 npmmirror 之后要改 .npmrc',
      'README 要重写 包括 quick start 与 migration 具体范围没定',
      'the migration guide should mention Node 18 是底线',
    ].join('\n'),
  },
  {
    id: '10-bilingual-long',
    kind: '长文本：中英混排、多主题、含不确定信息',
    note: 'Release 计划讨论\n1. 版本号 我们倾向 2.4.0 但 API 有 break change 不确定要不要 3.0.0\n2. 时间线 计划 11 月 20 冻结 12 月初发布 但 QA 说资源不够 可能推迟\n3. 风险 依赖的上游 SDK 下个大版本会移除 legacy 接口 我们还在用 具体哪几个接口没清点\n4. 文档 README 需要重写 包括 quick start 与 migration\n5. 下一步 我整理 break change 清单 李四确认 QA 排期\nAdditional note: the migration guide should mention Node 18 是底线',
  },
]

// ---------------------------------------------------------------------------- run it ---
const outlineStats = (step, tree) => {
  let headings = 0
  let items = 0
  let bullets = 0
  const walk = (node) => {
    if (node === null || node === undefined || typeof node === 'string') return
    if (Array.isArray(node)) {
      for (const child of node) walk(child)
      return
    }
    const className = String(node.props?.className ?? '')
    if (/^h[1-6]$/.test(String(node.node))) headings += 1
    if (className.includes('dshn-md-item')) items += 1
    if (node.node === 'li') bullets += 1
    for (const child of node.children ?? []) walk(child)
  }
  walk(tree)
  return { headings, items, bullets }
}

const rows = []
for (const entry of corpus) {
  const started = Date.now()
  let draft = null
  let failure = ''
  try {
    const response = await realFetch(`${api}/enhance`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: entry.note }),
    })
    const payload = await response.json()
    draft = payload?.data?.draft ?? null
    if (!payload?.ok) failure = String(payload?.error?.message ?? 'unknown')
  } catch (error) {
    failure = String(error?.message ?? error)
  }
  const elapsed = Date.now() - started

  if (draft === null) {
    rows.push({ ...entry, failure, elapsed })
    console.log(`${entry.id}  FAILED  ${failure}`)
    continue
  }

  const title = String(draft.title ?? '')
  const bodyRaw = String(draft.body ?? '')
  const repaired = repairCoverage(entry.note, preserveMarkup(entry.note, bodyRaw))
  const issues = typographyIssues(entry.note, repaired, { title })
  const report = fidelityReport(entry.note, repaired, { sameLanguage: true })
  const composed = title.trim() === '' ? repaired : `# ${title}\n\n${repaired}`
  const tree = renderNoteBody(composed)
  const stats = outlineStats('structure', tree)

  // translation, indexed if the host supports it
  let translateMode = 'text'
  let translated = ''
  try {
    const lines = composed.split(/\r?\n/)
    const response = await realFetch(`${api}/translate/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines, target: 'English' }),
    })
    const raw = await response.text()
    const doneFrame = raw.split('\n\n').find((frame) => frame.startsWith('event: done'))
    const errorFrame = raw.split('\n\n').find((frame) => frame.startsWith('event: error'))
    if (doneFrame !== undefined && doneFrame.includes('"lines"')) {
      const payload = JSON.parse(doneFrame.slice(doneFrame.indexOf('data: ') + 6))
      translated = assembleIndexedLines(composed, payload.lines)
      translateMode = 'indexed'
    } else if (doneFrame !== undefined) {
      const payload = JSON.parse(doneFrame.slice(doneFrame.indexOf('data: ') + 6))
      translated = String(payload.text ?? '')
      translateMode = 'text'
    } else if (errorFrame !== undefined) {
      // A host without indexed mode rejects `lines`: retry the old way so translation is still
      // exercised.
      const retry = await realFetch(`${api}/translate/stream`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: composed, target: 'English', keepNumbering: false }),
      })
      const retryRaw = await retry.text()
      const retryDone = retryRaw.split('\n\n').find((frame) => frame.startsWith('event: done'))
      if (retryDone !== undefined) {
        translated = String(JSON.parse(retryDone.slice(retryDone.indexOf('data: ') + 6)).text ?? '')
        translateMode = 'text-fallback'
      } else {
        translateMode = 'error'
      }
    }
  } catch {
    translateMode = 'error'
  }

  const translatedTree = translated.trim() === '' ? null : renderNoteBody(translated)
  const translatedStats = translatedTree === null ? null : outlineStats('translate', translatedTree)

  await writeFile(
    join(previewDir, `${entry.id}.html`),
    htmlPage(entry, bodyRaw, repaired, composed, tree, translated, translatedTree),
    'utf8',
  )

  rows.push({
    id: entry.id,
    kind: entry.kind,
    chars: entry.note.length,
    elapsed,
    issues: issues.length,
    issueText: issues,
    missing: report.missing.length,
    lineDelta: report.lineDelta,
    headings: stats.headings,
    items: stats.items,
    bullets: stats.bullets,
    translateMode,
    translatedLines: translated === '' ? 0 : translated.split(/\r?\n/).length,
    composedLines: composed.split(/\r?\n/).length,
  })
  console.log(
    `${entry.id.padEnd(22)} ${String(entry.note.length).padStart(4)}ch ${String(elapsed).padStart(5)}ms  issues=${issues.length} missing=${report.missing.length} lines=${stats.headings}H/${stats.items}I/${stats.bullets}B  tr=${translateMode} ${translated === '' ? '' : translated.split(/\r?\n/).length + '/' + composed.split(/\r?\n/).length}`,
  )
  if (issues.length > 0) for (const issue of issues) console.log(`    - ${issue}`)
}

await writeFile(join(previewDir, 'index.html'), indexPage(rows), 'utf8')
console.log('\npreviews: exports/previews/corpus/index.html')
const failures = rows.filter((row) => row.failure !== undefined || (row.issues ?? 0) > 0)
console.log(`cases: ${rows.length}  clean: ${rows.length - failures.length}  flagged: ${failures.length}`)

// ------------------------------------------------------------------------------- html ---
function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function toHtml(tree) {
  const walk = (node) => {
    if (node === null || node === undefined) return ''
    if (typeof node === 'string') return escapeHtml(node)
    if (Array.isArray(node)) return node.map(walk).join('')
    const className = node.props?.className
    const attrs = className === undefined ? '' : ` class="${escapeHtml(className)}"`
    const data = node.props?.['data-level'] === undefined ? '' : ` data-level="${escapeHtml(node.props['data-level'])}"`
    return `<${node.node}${attrs}${data}>${(node.children ?? []).map(walk).join('')}</${node.node}>`
  }
  return walk(tree)
}

function pageShell(title, body) { return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
:root{--dsw-alias-label-primary:#1b1b1b;--dsw-alias-label-secondary:#6b6b6b;--dsw-alias-bg-base:#fff;--dsw-alias-bg-layer-1:#fff;--dsw-alias-bg-layer-2:#f2f2f2;--dsw-alias-border-l1:#e3e3e3;--dsw-alias-border-l2:#d0d0d0;--dsw-alias-brand-primary:#1f6feb;--dshn-heat-0:#ebedf0;--dshn-heat-1:#9be9a8;--dshn-heat-2:#40c463;--dshn-heat-3:#30a14e;--dshn-heat-4:#216e39;--dshn-r-sm:6px;--dshn-r-md:10px;--dshn-r-lg:14px}
body{margin:0;background:#fafafa;font:14px/1.65 -apple-system,"Segoe UI",system-ui,sans-serif;color:#1b1b1b}
.sheet{display:grid;grid-template-columns:1fr 1fr;gap:24px;max-width:1500px;margin:0 auto;padding:28px}
.col{background:#fff;border:1px solid #e3e3e3;border-radius:10px;padding:22px 26px;min-width:0}
.col h3{margin:0 0 12px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b6b6b;font-weight:600}
pre.src{white-space:pre-wrap;word-break:break-word;font:12px/1.7 ui-monospace,Consolas,monospace;color:#444;margin:0}
.meta{max-width:1500px;margin:0 auto;padding:18px 28px 0;color:#6b6b6b;font-size:12px}
.badge{display:inline-block;border:1px solid #d0d0d0;border-radius:999px;padding:1px 8px;margin-left:8px}
</style>
<style>${STYLES}</style>
</head><body>${body}</body></html>` }

function htmlPage(entry, raw, repaired, composed, tree, translated, translatedTree) {
  return pageShell(
    entry.id,
    `<div class="meta"><b>${escapeHtml(entry.id)}</b> · ${escapeHtml(entry.kind)} · ${entry.note.length} 字
      <span class="badge">左：原文</span><span class="badge">中：补修后</span><span class="badge">右：成品渲染</span>
      <span class="badge">下：译文</span></div>
     <div class="sheet">
       <div class="col"><h3>原文</h3><pre class="src">${escapeHtml(raw)}</pre>
         <h3 style="margin-top:18px">补修后（markup + coverage）</h3><pre class="src">${escapeHtml(repaired)}</pre></div>
       <div class="col"><h3>成品渲染</h3><div class="dshn-root"><div class="dshn-md">${toHtml(tree)}</div></div></div>
     </div>
     <div class="sheet"><div class="col" style="grid-column:1 / -1"><h3>译文（按行重组）</h3>
       <div class="dshn-root"><div class="dshn-md">${translatedTree === null ? '<p class="src">（未取到译文）</p>' : toHtml(translatedTree)}</div></div></div></div>`,
  )
}

function indexPage(rows) {
  const cells = rows
    .map(
      (row) => `<tr>
        <td><a href="./${row.id}.html">${escapeHtml(row.id)}</a></td>
        <td>${escapeHtml(row.kind ?? '')}</td>
        <td>${row.chars ?? ''}</td>
        <td>${row.elapsed ?? ''}</td>
        <td>${row.failure === undefined ? (row.issues ?? 0) : '失败'}</td>
        <td>${row.missing ?? ''}</td>
        <td>${row.headings ?? ''}/${row.items ?? ''}/${row.bullets ?? ''}</td>
        <td>${row.translateMode ?? ''} ${row.translatedLines ?? ''}/${row.composedLines ?? ''}</td>
      </tr>`,
    )
    .join('\n')
  return pageShell(
    'corpus',
    `<div class="meta"><b>语料测试</b> · 10 组输入 · 结构 → 渲染 → 译文</div>
     <div class="sheet"><div class="col" style="grid-column:1 / -1">
     <table style="width:100%;border-collapse:collapse;font-size:12px">
       <thead><tr style="text-align:left;color:#6b6b6b">
         <th>用例</th><th>类型</th><th>字数</th><th>结构耗时</th><th>缺陷</th><th>缺失行</th><th>标题/条目/列表</th><th>译文 行数</th>
       </tr></thead><tbody>${cells}</tbody></table></div></div>`,
  )
}
