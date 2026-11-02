// Prompt checks for the two model calls the panel makes.
//
// The dashboard no longer builds a prompt from statistics: it is a native session
// whose agent calls the query tools, and the editor copilot is gone. What remains
// here is the structuring prompt's shape and the term extractor the tools use.
import { buildEnhanceMessage, readEnhanceResult, dedupeTitle } from '../lib/prompt.js'
import { topTerms } from '../lib/text.js'

let failures = 0
const check = (label, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${condition ? '' : `  ${detail}`}`)
  if (!condition) failures += 1
}

// ---- the structuring prompt ----
// The first line is the title, so the body must not restate it: that duplication is
// exactly what appeared at the top of every formatted note.
const enhancePrompt = buildEnhanceMessage({ text: '原稿' })
check('the prompt declares the first line as the title', enhancePrompt.includes('第一行就是标题'))
check('the prompt forbids repeating the title', enhancePrompt.includes('不要再复述') || enhancePrompt.includes('重复一遍标题'))

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
