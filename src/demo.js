// Demo driver: a scripted walk through the real panel, for recording marketing footage.
//
// It is inert unless the host reports `demo: true` (set DSHN_DEMO=1 before starting DSH). Then, when
// the notes panel mounts, it does exactly what a person would do — types into the real textarea,
// presses TAB, selects lines, clicks Structure / Apply / Translate / Save / Edit / Copy — so the
// footage is the product itself, with its own DOM and its own timing.
//
// Nothing here reaches the network on its own: the completion, structure and translate calls are the
// panel's, made the same way a click makes them.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Wait for a selector, then return the element (or null after the timeout). */
async function waitFor(selector, timeout = 8000) {
  const started = Date.now()
  for (;;) {
    const node = document.querySelector(selector)
    if (node !== null && node !== undefined) return node
    if (Date.now() - started > timeout) return null
    await sleep(80)
  }
}

/** Wait until a condition holds, then return it (or null). */
async function waitUntil(check, timeout = 8000) {
  const started = Date.now()
  for (;;) {
    if (check() === true) return true
    if (Date.now() - started > timeout) return null
    await sleep(80)
  }
}

/** Set a textarea's value and fire the events React needs to notice. */
function setText(area, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
  setter?.call(area, value)
  area.dispatchEvent(new Event('input', { bubbles: true }))
}

/** Type one character at a time, the way a slow typist would. */
async function type(area, text, delay = 90) {
  for (const char of text) {
    setText(area, area.value + char)
    await sleep(delay)
  }
}

function key(area, keyName, code = keyName) {
  for (const typeName of ['keydown', 'keyup']) {
    area.dispatchEvent(new KeyboardEvent(typeName, { key: keyName, code, bubbles: true, cancelable: true }))
  }
}

function pressEnter(area) {
  const before = area.value
  for (const typeName of ['keydown', 'keyup']) {
    area.dispatchEvent(new KeyboardEvent(typeName, { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
  }
  // The panel handles Enter itself; if it did not change the value, insert the newline.
  if (area.value === before) setText(area, `${before}\n`)
}

/** Highlight a line range in the textarea and let the panel see the selection. */
function selectLines(area, fromIndex, toIndex) {
  area.focus()
  area.setSelectionRange(fromIndex, toIndex)
  area.dispatchEvent(new Event('select', { bubbles: true }))
  area.dispatchEvent(new Event('keyup', { bubbles: true }))
}

const SCENE_TEXT = [
  '极简笔记理念',
  '',
  '这不是一个新的工具，这是一个关于文字的哲学思考。',
  '    智能不能成为文字的主角',
  '    功能应当服务于思想',
  '        书写带来快乐',
  '',
  '所以这个工具只需要做一件事，那就是',
].join('\n')

let started = false

/**
 * Run the demo once. Resolves when the walk is done (or when something is missing, so a recording
 * never hangs on an absent button).
 */
async function startNotesDemo(log) {
  if (started) return
  started = true
  const note = (message) => {
    if (typeof log === 'function') log(`demo: ${message}`)
  }

  await waitFor('.dshn-root')
  await sleep(600)

  const area = await waitFor('.dshn-textarea')
  if (area === null) return note('no editor')
  area.focus()

  // 1. Type the note. Spaces at the start of a line become bullets as they are typed.
  await type(area, SCENE_TEXT, 70)
  note('typed')
  await sleep(1400)

  // 2. The pause produced a suggestion; TAB accepts it.
  if (document.querySelector('.dshn-ghost') !== null) {
    key(area, 'Tab')
    await sleep(900)
    pressEnter(area)
    note('accepted a suggestion')
  }
  await sleep(1200)

  // 3. Select the two bullet lines and structure only them.
  const text = area.value
  const from = text.indexOf('智能不能')
  const to = text.indexOf('书写带来快乐')
  if (from >= 0 && to > from) {
    selectLines(area, text.lastIndexOf('\n', from) + 1, to + '书写带来快乐'.length)
    await sleep(700)
  }

  const structure = document.querySelector('.dshn-btn.enhance')
  if (structure !== null) {
    structure.click()
    note('structure asked')
    const draft = await waitUntil(() => document.querySelector('.dshn-page-render[data-proposal="true"]') !== null, 20000)
    await sleep(draft ? 1200 : 200)

    // 4. Apply the draft, then translate the note from the live preview.
    const apply = document.querySelector('.dshn-row .dshn-btn')
    const buttons = [...document.querySelectorAll('.dshn-row.dshn-capture-tools .dshn-btn')]
    const applyButton = buttons.find((node) => /Apply/i.test(node.textContent ?? ''))
    if (applyButton !== undefined) {
      applyButton.click()
      note('applied')
      await sleep(1400)
    } else if (apply !== null) {
      note('no apply button')
    }

    const translate = [...document.querySelectorAll('.dshn-row.dshn-capture-tools .dshn-btn')].find((node) => /Translate/i.test(node.textContent ?? ''))
    if (translate !== undefined) {
      translate.click()
      note('translate asked')
      await waitUntil(() => document.querySelector('.dshn-page-render[data-proposal="true"]') === null, 20000)
      await sleep(1600)
    }

    const save = [...document.querySelectorAll('.dshn-row.dshn-capture-tools .dshn-btn.primary')].find((node) => /Save/i.test(node.textContent ?? ''))
    if (save !== undefined) {
      save.click()
      note('saved')
      await sleep(1600)
    }
  }

  // 5. History: open the newest note, edit it, save, copy.
  const history = [...document.querySelectorAll('.dshn-tab')].find((node) => /History/i.test(node.textContent ?? ''))
  if (history !== undefined) {
    history.click()
    await sleep(900)
    const card = document.querySelector('.dshn-item')
    if (card !== null) {
      card.click()
      await sleep(700)
      const edit = document.querySelector('.dshn-detail-edit')
      if (edit !== null) {
        edit.click()
        await sleep(700)
        const editor = document.querySelector('.dshn-detail .dshn-textarea')
        if (editor !== null) {
          editor.focus()
          await type(editor, '  （补一句：写的时候不被打断。）', 60)
          await sleep(500)
        }
        const saveEdit = [...document.querySelectorAll('.dshn-detail .dshn-btn')].find((node) => /Save|Apply/i.test(node.textContent ?? ''))
        if (saveEdit !== undefined) saveEdit.click()
        await sleep(1200)
      }
      const copy = document.querySelector('.dshn-icon-btn[data-copied]')
      if (copy !== null) {
        copy.click()
        note('copied')
        await sleep(1600)
      }
    }
  }

  // 6. The board.
  const board = [...document.querySelectorAll('.dshn-tab')].find((node) => /Board/i.test(node.textContent ?? ''))
  if (board !== undefined) {
    board.click()
    await sleep(900)
  }
  note('done')
}
