// The mark layer draws behind the textarea, so its plain text must equal the textarea's text exactly
// once. Every "text on text" report so far was a violation of that: a stale suggestion, an accepted
// mark over a selection, a ghost drawn inside a range. This suite pins the invariant, including a
// random sweep.
//
// Run with: node test/mirror.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const packageDir = join(here, '..')
const fixtures = join(packageDir, 'exports', 'mirror-fixture')

const React = {
  Fragment: Symbol('Fragment'),
  createElement(type, props, ...children) {
    const flat = children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false)
    if (typeof type === 'function') {
      const allProps = { ...(props ?? {}), children: flat }
      const isClass = typeof type.prototype?.render === 'function'
      return isClass ? new type(allProps).render() : type(allProps)
    }
    return { node: type, props: props ?? {}, children: flat }
  },
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => undefined,
  useMemo: (factory) => factory(),
  useCallback: (fn) => fn,
  useRef: (initial) => ({ current: initial }),
  Component: class { constructor(props) { this.props = props ?? {} } setState() {} },
}
globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, data: {} }) })
globalThis.window = { __ModuleLoader__: { load: (definition) => { globalThis.__factory = definition.factory } }, addEventListener() {}, removeEventListener() {} }
globalThis.localStorage = { getItem: () => 'auto', setItem() {} }
Object.defineProperty(globalThis, 'navigator', { value: { language: 'zh-CN' }, configurable: true })
globalThis.setInterval = () => 0
globalThis.clearInterval = () => {}
globalThis.__DSH_NOTES_TEST__ = true

mkdirSync(fixtures, { recursive: true })
writeFileSync(join(fixtures, 'client.mjs'), readFileSync(join(packageDir, 'client.js'), 'utf8'), 'utf8')
await import(pathToFileURL(join(fixtures, 'client.mjs')).href)
globalThis.__factory((name) => (name === 'react' ? React : undefined))
const { mirrorSegments } = globalThis.__dshNotesInternals

let failures = 0
const check = (name, ok, detail) => {
  if (ok) {
    console.log(`PASS  ${name}`)
  } else {
    failures += 1
    console.log(`FAIL  ${name}${detail === undefined ? '' : `  ${detail}`}`)
  }
}

/** The text the layer would show under the textarea (marks included, ghost excluded). */
const plain = (segments) => segments.filter((s) => s.kind !== 'ghost').map((s) => s.text).join('')
const all = (segments) => segments.map((s) => s.text).join('')
const ghostOf = (segments) => segments.filter((s) => s.kind === 'ghost').map((s) => s.text).join('')

const draft = '第一行\n- 第二行\n- 第三行\n结尾'

// ---- nothing on screen ----
check('an empty draft draws nothing', mirrorSegments({ draft: '', ghost: null, accepted: null, range: null }).length === 0)
check('a draft with no overlay draws nothing', mirrorSegments({ draft, ghost: null, accepted: null, range: null }).length === 0)

// ---- a range ----
{
  const range = { start: 4, end: 9 }
  const segments = mirrorSegments({ draft, ghost: null, accepted: null, range })
  check('a range keeps the text identical', plain(segments) === draft, JSON.stringify(segments))
  check('a range marks exactly its span', segments.filter((s) => s.kind === 'range').map((s) => s.text).join('') === draft.slice(4, 9))
  check('an empty selection is ignored', mirrorSegments({ draft, ghost: null, accepted: null, range: { start: 5, end: 5 } }).length === 0)
}

// ---- an accepted chunk ----
{
  const accepted = { start: 12, end: 17 }
  const segments = mirrorSegments({ draft, ghost: null, accepted, range: null })
  check('an accepted span keeps the text identical', plain(segments) === draft, JSON.stringify(segments))
  check('an accepted span is drawn as a mark', segments.some((s) => s.kind === 'accepted'))
}

// ---- a suggestion ----
{
  const segments = mirrorSegments({ draft, ghost: { at: draft.length, index: 0, chunks: ['继续写'] }, accepted: null, range: null })
  check('a ghost adds text without moving the draft', plain(segments) === draft, JSON.stringify(segments))
  check('the ghost is drawn once', ghostOf(segments) === '继续写')
  check('a ghost whose chunk index is gone draws nothing', mirrorSegments({ draft, ghost: { at: 3, index: 5, chunks: ['a'] }, accepted: null, range: null }).length === 0)
}

// ---- combinations: the reported bugs ----
{
  const segments = mirrorSegments({ draft, ghost: { at: 6, index: 0, chunks: ['建议'] }, accepted: null, range: { start: 4, end: 9 } })
  check('a range suppresses the ghost', ghostOf(segments) === '', JSON.stringify(segments))
  check('a range stays identical with a ghost present', plain(segments) === draft)
}
{
  const accepted = { start: 12, end: 17 }
  const segments = mirrorSegments({ draft, ghost: { at: 17, index: 0, chunks: ['下一句'] }, accepted, range: null })
  check('accepted plus ghost keeps the text identical', plain(segments) === draft, JSON.stringify(segments))
  check('accepted plus ghost draws the suggestion once', ghostOf(segments) === '下一句')
}
{
  // A selection outranks an accepted span (the "two highlights" report).
  const segments = mirrorSegments({ draft, ghost: null, accepted: { start: 1, end: 4 }, range: { start: 6, end: 9 } })
  check('a selection outranks the accepted mark', segments.every((s) => s.kind !== 'accepted'))
  check('the text stays identical under a selection', plain(segments) === draft)
}

// ---- stale overlays ----
{
  const short = '短'
  const segments = mirrorSegments({
    draft: short,
    ghost: { at: 40, index: 0, chunks: ['幽灵'] },
    accepted: { start: 10, end: 20 },
    range: { start: 5, end: 9 },
  })
  check('an out-of-range overlay draws nothing', segments.length === 0, JSON.stringify(segments))
  check('a negative offset draws nothing', mirrorSegments({ draft: short, ghost: null, accepted: { start: -2, end: 1 }, range: null }).length === 0)
  check('a NaN offset draws nothing', mirrorSegments({ draft: short, ghost: null, accepted: { start: Number.NaN, end: 1 }, range: null }).length === 0)
  check('an inverted span draws nothing', mirrorSegments({ draft: short, ghost: null, accepted: { start: 1, end: 0 }, range: null }).length === 0)
}

// ---- an exact-fit span and the whole draft ----
{
  const whole = { start: 0, end: draft.length }
  const segments = mirrorSegments({ draft, ghost: null, accepted: whole, range: null })
  check('a span covering the whole draft is fine', plain(segments) === draft)
  check('the mark covers the whole draft', segments.filter((s) => s.kind === 'accepted').map((s) => s.text).join('') === draft)
}

// ---- random sweep: never duplicate, never draw two ghosts, never ghost inside a range ----
let seed = 7
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return seed / 2147483648
}
let fuzzFailures = 0
for (let round = 0; round < 500; round += 1) {
  const length = 1 + Math.floor(random() * 40)
  const body = Array.from({ length }, () => (random() < 0.15 ? '\n' : random() < 0.5 ? '字' : 'a')).join('')
  const span = () => {
    const start = Math.floor(random() * (length + 6)) - 3
    return { start, end: start + Math.floor(random() * 8) }
  }
  const segments = mirrorSegments({
    draft: body,
    ghost: random() < 0.5 ? { at: Math.floor(random() * (length + 4)), index: 0, chunks: ['鬼'] } : null,
    accepted: random() < 0.4 ? span() : null,
    range: random() < 0.4 ? span() : null,
  })
  const expected = segments.length === 0 ? '' : body
  if (plain(segments) !== expected) fuzzFailures += 1
  if (segments.filter((s) => s.kind === 'ghost').length > 1) fuzzFailures += 1
  if (segments.some((s) => s.kind === 'range') && segments.some((s) => s.kind === 'ghost')) fuzzFailures += 1
  if (segments.length > 0 && all(segments).length < body.length) fuzzFailures += 1
}
check('500 random states never duplicate the draft text', fuzzFailures === 0, `${fuzzFailures} failure(s)`)

console.log(failures === 0 ? '\nall mirror checks passed' : `\n${failures} mirror check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
