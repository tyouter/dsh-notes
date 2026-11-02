// Copilot prompt checks.
//
// The dashboard no longer builds a prompt from statistics: it is a native session
// whose agent calls the query tools. What remains to verify here is the copilot's
// message shape, and the term extractor the tools use.
import { COPILOT_ACTIONS, buildCopilotMessage, buildEnhanceMessage, readEnhanceResult, dedupeTitle } from '../lib/prompt.js'
import { topTerms } from '../lib/text.js'

let failures = 0
const check = (label, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${condition ? '' : `  ${detail}`}`)
  if (!condition) failures += 1
}

// ---- copilot message ----
const message = buildCopilotMessage({ action: 'polish', selection: '这句话有点啰嗦', document: '全文内容', title: '标题' })
check('copilot message carries the selection', message.includes('这句话有点啰嗦'))

// Whole-note actions must receive the note; a translate with no selection used to
// describe the task without providing any text.
const whole = buildCopilotMessage({ action: 'translate', selection: '', document: '明天下午三点对齐接口' })
check('a whole-note action carries the note', whole.includes('明天下午三点对齐接口'))
check('a whole-note action labels the note', whole.includes('笔记全文'))
const targeted = buildCopilotMessage({ action: 'translate', selection: '', document: 'x', instruction: '翻译成English' })
check('the translate target reaches the prompt', targeted.includes('翻译成English'))
check('copilot message carries the action label', message.includes(COPILOT_ACTIONS.polish.label))
check('copilot message carries the note title', message.includes('标题'))

// The first line is the title, so the body must not restate it: that duplication is
// exactly what appeared at the top of every formatted note.
const enhancePrompt = buildEnhanceMessage({ text: '原稿' })
check('the prompt declares the first line as the title', enhancePrompt.includes('第一行就是标题'))
check('the prompt forbids repeating the title', enhancePrompt.includes('不要再复述') || enhancePrompt.includes('重复一遍标题'))
check('copilot message carries the surrounding note', message.includes('全文内容'))
check(
  'copilot message drops the full note when it is long',
  buildCopilotMessage({ action: 'polish', selection: 'x', document: 'y'.repeat(9000) }).includes('所在笔记全文') === false,
)
check(
  'copilot message forwards an extra instruction',
  buildCopilotMessage({ action: 'polish', selection: 'x', document: 'x', instruction: '更正式' }).includes('更正式'),
)
check(
  'copilot message works with no selection',
  buildCopilotMessage({ action: 'summarize', selection: '', document: '正文' }).includes('没有选中内容'),
)

// Every action the sidebar offers has a prompt.
for (const action of ['complete', 'polish', 'translate', 'expand', 'summarize', 'ask']) {
  check(`action ${action} has a prompt`, typeof COPILOT_ACTIONS[action]?.system === 'string' && COPILOT_ACTIONS[action].system.length > 20)
}

// ---- term extraction, used by the terms tool ----
const terms = topTerms(['插件开发实战教学视频', '插件开发需要了解机制'], { limit: 5 })
const top = terms.filter((term) => term.value === 2).map((term) => term.label)
check('terms rank the repeated words first', top.length > 0 && top.every((label) => ['插件', '开发'].includes(label)) || top.includes('插件'), JSON.stringify(terms))
check('terms count occurrences', terms.some((term) => term.label === '插件' && term.value === 2), JSON.stringify(terms))
check(
  'terms skip overlapping windows',
  !terms.some((term) => term.label === '件开'),
  JSON.stringify(terms.map((term) => term.label)),
)
check('terms respect the limit', terms.length <= 5, String(terms.length))

const latin = topTerms(['the harness and the agent'], { limit: 5 })
check('terms drop English stop words', !latin.some((term) => term.label === 'the'), JSON.stringify(latin))
check('terms keep English words', latin.some((term) => term.label === 'harness'), JSON.stringify(latin))

// ---- structuring prompt and its parser ----
// The prompt streams Markdown now: readable while it arrives and cheaper than an escaped
// JSON block. The parser accepts either shape.
check('structuring asks for plain Markdown', enhancePrompt.includes('Markdown'))
check('structuring still requests tags', enhancePrompt.includes('标签'))
check('structuring no longer asks for json', enhancePrompt.includes('OUTPUT_SHAPE') === false)

const markdownNote = readEnhanceResult(['## 待办', '', '- 对齐接口', '', '标签：工作, 接口'].join('\n'))
check('a Markdown answer becomes a note', markdownNote?.title === '待办', JSON.stringify(markdownNote))
check('its tags are read', JSON.stringify(markdownNote?.tags) === '["工作","接口"]', JSON.stringify(markdownNote?.tags))
check('tags are removed from the body', String(markdownNote?.body ?? '').includes('标签') === false)

// A note must not print its title twice.
const repeated = dedupeTitle('缓存优化记录', ['缓存优化记录', '', '## 背景', '首 token 1.8 秒'].join('\n'))
check('a repeated title line is removed', repeated.body.startsWith('## 背景'), JSON.stringify(repeated))
check('the title itself survives', repeated.title === '缓存优化记录', JSON.stringify(repeated.title))
const multiSection = dedupeTitle('议题一：加载性能', ['## 议题一：加载性能', '', '1. 现状', '', '## 议题二：token', '一、已统计'].join('\n'))
check('several headings are structure, not a title', multiSection.title === '', JSON.stringify(multiSection))
check('every heading stays in the body', multiSection.body.includes('## 议题一：加载性能') && multiSection.body.includes('## 议题二：token'), JSON.stringify(multiSection.body))
const loneHeading = dedupeTitle('待办', ['## 待办', '', '- 对齐接口'].join('\n'))
check('a lone heading becomes the title', loneHeading.title === '待办', JSON.stringify(loneHeading))
check('the lone heading leaves the body', loneHeading.body === '- 对齐接口', JSON.stringify(loneHeading.body))
const normal = dedupeTitle('周会纪要', ['## 与会者', '张三、李四'].join('\n'))
check('an unrelated title is kept', normal.title === '周会纪要' && normal.body.startsWith('## 与会者'), JSON.stringify(normal))
check('plain prose is not accepted', readEnhanceResult('原始') === null)
check('an empty json body is rejected', readEnhanceResult(['```json', '{"title":"T"}', '```'].join('\n')) === null)

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
