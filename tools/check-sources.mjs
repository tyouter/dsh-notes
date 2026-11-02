// Parse-check the browser sources exactly as build.mjs will wrap them.
// The sources are factory *bodies*, so they are not valid standalone modules;
// node --check on them alone is expected to fail. This wraps them the same way
// and reports the first real syntax problem.
//   node tools/check-sources.mjs

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const parts = ['head.js', 'board.js', 'panel.js']
const bodies = []
for (const name of parts) bodies.push(await readFile(join(root, 'src', name), 'utf8'))

const body = `window.__ModuleLoader__.load({\n  id: '@local/dsh-notes',\n  factory(require) {\n${bodies.join('\n')}\n  },\n})\n`
try {
  new vm.Script(body, { filename: 'src/{head,board,panel}.js' })
  console.log('browser sources parse cleanly')
} catch (error) {
  console.error(`browser sources do not parse: ${error.message}`)
  process.exitCode = 1
}
