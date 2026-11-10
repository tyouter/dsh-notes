// Typing regression tests: the 极简写 keyboard flows, simulated slowly.
//
// Run with: node test/typing.mjs
//
// The space bug that shipped at 18:40 was invisible to the unit checks, because they called the pure
// functions directly and never asked "what happens if the two taps are 300ms apart?". This file
// simulates the editor the way a person types: every character is an input, Enter is handled before
// the newline exists, and a slow tap is just... slow. Nothing here depends on wall-clock timing.

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const packageDir = join(here, '..')
const fixtures = join(here, '.typing-fixture')

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
  useCallback: (fn) => fn,
  useRef: (initial) => ({ current: initial }),
  Component: class Component {
    constructor(props) {
      this.props = props ?? {}
      this.state = {}
    }
    setState() {}
  },
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

await mkdir(fixtures, { recursive: true })
await writeFile(join(fixtures, 'client.mjs'), await readFile(join(packageDir, 'client.js'), 'utf8'), 'utf8')
await import(pathToFileURL(join(fixtures, 'client.mjs')).href)
globalThis.__factory((name) => {
  if (name === 'react') return React
  throw new Error(`unexpected require: ${name}`)
})

const internals = globalThis.__dshNotesInternals
const { autoBulletLine, continueBulletLine, spaceBurstLine, backspaceLine, suggestionChunks, repetitionSuggestion } = internals

/**
 * A tiny editor: one string plus a caret.
 *
 * `type` follows the real input path — insert characters, then let the input rule normalise the
 * line. There is no timing here on purpose: the fix was to stop depending on how fast keys are hit.
 */
function editor(initial = '') {
  let text = initial
  return {
    get text() {
      return text
    },
    type(chars) {
      text += chars
      for (;;) {
        const next = autoBulletLine(text, text.length)
        if (next === null) break
        text = next.text
      }
      return this
    },
    enter() {
      const next = continueBulletLine(text, text.length)
      text = next === null ? `${text}\n` : next.text
      return this
    },
    backspaceAtMarker() {
      const at = text.lastIndexOf('\n') + 1
      const marker = text.slice(at).match(/^\s*- /)
      const caret = at + (marker === null ? 0 : marker[0].length)
      const next = backspaceLine(text, caret)
      if (next !== null) text = next.text
      return this
    },
    burst(atMarker = false) {
      // The burst path only runs for an existing item; a plain line is handled by the input rule.
      const next = spaceBurstLine(text, atMarker ? text.lastIndexOf('-') + 2 : text.length)
      if (next !== null) text = next.text
      return this
    },
  }
}

// ---------------------------------------------------------------- the reported bug, slowly ---
check('two spaces slowly make a bullet', editor('会议\n').type('  ').text === '会议\n- ', JSON.stringify(editor('会议\n').type('  ').text))
check('four spaces slowly make a nested item', editor('会议\n').type('    ').text === '会议\n  - ')

const full = editor('会议\n').type('  ').type('甲').enter().type('  ').type('乙')
check('Enter continues at the same level', full.text === '会议\n- 甲\n  - 乙', JSON.stringify(full.text))
check('the nested item stays nested after more typing', full.type('丙').text.endsWith('  - 乙丙'))

// a fast double tap on an item deepens it, the same as a slow one
const fast = editor('- 甲').enter().burst(true)
check('a fast double tap deepens an empty item', fast.text === '- 甲\n  - ', JSON.stringify(fast.text))

// ---------------------------------------------------------------- backing out ---
const out = editor('会议\n').type('  ').type('甲').enter().type('  ').type('乙').backspaceAtMarker()
check('Backspace leaves the second level', out.text === '会议\n- 甲\n- 乙', JSON.stringify(out.text))
const prose = editor('- 甲').backspaceAtMarker()
check('Backspace at the first level returns prose', prose.text === '甲', JSON.stringify(prose.text))

// ---------------------------------------------------------------- things that must not fire ---
check('a double space inside a line is text', editor('会议').type('  甲').text === '会议  甲', JSON.stringify(editor('会议').type('  甲').text))
check('one space is not a bullet', editor('会议\n').type(' ').text === '会议\n ')
check('text after the spaces joins the item', editor('会议\n').type('  甲').text === '会议\n- 甲')

// ---------------------------------------------------------------- completion interplay ---
// Typing must never depend on the suggestion layer: the spaces rule is pure.
check('the space rule does not wait for a suggestion', editor('会议\n').type('  ').text.endsWith('- '))
const repeated = repetitionSuggestion('产品上线会议 定在周五。\n产品上线', 20)
check('repetition still answers from the document', repeated?.source === 'document', JSON.stringify(repeated))
check('a suggestion stays chunked', suggestionChunks('先做压测，再定上线时间。然后同步。').length === 2)

// ---------------------------------------------------------------- the reported nesting flows ---
// A new item between two items of the same level: Enter, then two spaces, and it belongs to the level
// below. The caret has to end up after the new marker.
{
  // The empty item sits between two items of the same level; the caret is on it, not at the end of the
  // document. Two spaces then promote it one level, and the caret lands after the new marker.
  const text = '- 甲\n- \n- 乙'
  const caret = '- 甲\n- '.length
  const withSpaces = text.slice(0, caret) + '  ' + text.slice(caret)
  const promoted = autoBulletLine(withSpaces, caret + 2)
  check('a new item between two items indents with two spaces', promoted?.text === '- 甲\n  - \n- 乙', JSON.stringify(promoted))
  check('the promoted marker keeps its neighbours', promoted !== null && promoted.text.indexOf('  - \n- 乙') > 0, JSON.stringify(promoted?.text))
}
{
  const deep = editor('甲\n- a\n    - b').backspaceAtMarker()
  check('Backspace raises a third level to the second', deep.text === '甲\n- a\n  - b', JSON.stringify(deep.text))
  const second = deep.backspaceAtMarker()
  check('Backspace raises the second level to the first', second.text === '甲\n- a\n- b', JSON.stringify(second.text))
  const prose = second.backspaceAtMarker()
  check('the last Backspace returns prose', prose.text === '甲\n- a\nb', JSON.stringify(prose.text))
}
{
  // The caret must land after the marker, or the next Backspace deletes a character of it instead of
  // stepping up again — the "错乱" report.
  const text = '甲\n    - b'
  const start = text.lastIndexOf('\n') + 1
  const next = backspaceLine(text, start + 6)
  check('stepping up puts the caret after the new marker', next !== null && next.caret === start + 4, JSON.stringify(next))
}

// ---------------------------------------------------------------- voice: only the encoding is ours ---
// The recognizer belongs to the Host; the notebook's job is to hand it the shape it accepts.
{
  const { encodeWave, resampleMono } = internals
  const wav = encodeWave(new Float32Array([0, 0.5, -0.5, 1]), 16000)
  const view = new DataView(wav.buffer)
  const text = (at) => String.fromCharCode(wav[at], wav[at + 1], wav[at + 2], wav[at + 3])
  check('the wav is 16 kHz mono pcm16', text(0) === 'RIFF' && text(8) === 'WAVE' && view.getUint16(22, true) === 1 && view.getUint32(24, true) === 16000 && view.getUint16(34, true) === 16)
  check('the wav header counts its data', view.getUint32(40, true) === 8 && wav.length === 52, String(wav.length))
  check('samples survive as pcm', view.getInt16(44 + 2, true) === Math.floor(0.5 * 0x7fff) || view.getInt16(44 + 2, true) === Math.floor(0.5 * 0x8000))

  const halved = resampleMono(new Float32Array([0, 1, 0, 1, 0, 1, 0, 1]), 32000, 16000)
  check('resampling halves the sample count', halved.length === 4, String(halved.length))
  check('a 16 kHz input is left alone', resampleMono(new Float32Array([1, 2, 3]), 16000, 16000).length === 3)
}

// ---------------------------------------------------------------- dictation layout (no model) ---
// Rules, not tokens: sentences to lines, ordinal cues to bullets, continuation cues indented.
{
  const { arrangeDictation, dictationJoiner, spokenSentences } = internals
  check('dictation splits on the recognizer punctuation', spokenSentences('第一点。第二点！还有吗').length === 3)
  check('ordinal sentences become bullets', arrangeDictation('第一点先定范围。第二点再排时间。').split('\n').every((line) => line.startsWith('- ')))
  check('a continuation cue is indented under the previous line', arrangeDictation('先定范围。比如只做桌面端。').split('\n')[1] === '  - 比如只做桌面端。')
  check('plain speech stays prose', arrangeDictation('今天开会没定下来。') === '今天开会没定下来。')
  check('a breath continues the same paragraph', dictationJoiner('今天开会。', 300) === '')
  check('a fragment continues the same paragraph', dictationJoiner('今天开会', 300) === '')
  check('a long pause starts a new line', dictationJoiner('今天开会。', 2000) === '\n')
  check('english keeps its space', dictationJoiner('The meeting ended.', 300) === ' ')
  check('the start of a note has no joiner', dictationJoiner('', 0) === '')
  // prose does not get split just because it has two sentences
  check('two spoken sentences stay one paragraph', arrangeDictation('今天开会。没定下来。') === '今天开会。没定下来。')
}

await rm(fixtures, { recursive: true, force: true })

if (failures === 0) console.log('\nall typing flows passed')
else console.log(`\n${failures} typing flow(s) failed`)
process.exit(failures === 0 ? 0 : 1)
