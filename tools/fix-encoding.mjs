// Repair double-encoded UTF-8 text in the plugin sources.
//
// A previous edit round wrote some CJK strings through a PowerShell pipeline
// that treated UTF-8 bytes as Latin-1; the result is "Ã¦â€œâ€¦"-style text.
// Re-encoding the affected runs as Latin-1->UTF-8 recovers the original.
//
//   node tools/fix-encoding.mjs --check   (report only)
//   node tools/fix-encoding.mjs --fix     (rewrite affected files)

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const targets = ['index.js', 'lib', 'src', 'build.mjs', 'locale', 'README.md', 'cordis.patch.yml', 'test']

/** A run of characters that only appear when UTF-8 was decoded as Latin-1. */
const CORRUPT = /(?:[\u00C0-\u00FF\u201A-\u203A\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u20AC]|\u00C2)+/g
const hasCjk = (text) => /[\u4e00-\u9fff]/.test(text)
const GARBLE = /[\u00C3\u00C2\u00E2\u00E5\u00E6\u00E7][\u0080-\u00BF\u0152-\u203A]/

async function walk(path) {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => null)
  if (entries === null) return [path]
  const files = []
  for (const entry of entries) {
    files.push(...(await walk(join(path, entry.name))))
  }
  return files
}

/** Locate the runs that decode cleanly, and report the ones that do not. */
function repair(text) {
  const problems = []
  const repaired = text.replace(CORRUPT, (run) => {
    if (!/[\u00C0-\u00FF]/.test(run)) return run
    const bytes = Buffer.from([...run].map((ch) => ch.codePointAt(0) & 0xff))
    const decoded = bytes.toString('utf8')
    if (decoded.includes('\uFFFD') || GARBLE.test(decoded) || !/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(decoded)) {
      return run
    }
    return decoded
  })
  for (const [index, line] of repaired.split('\n').entries()) {
    if (GARBLE.test(line)) problems.push({ line: index + 1, text: line.trim().slice(0, 120) })
  }
  return { repaired, problems }
}

const fix = process.argv.includes('--fix')
let touched = 0
let unresolved = 0

for (const target of targets) {
  for (const file of await walk(join(root, target))) {
    if (!/\.(js|mjs|json|md|yml)$/.test(file)) continue
    const text = await readFile(file, 'utf8')
    const { repaired, problems } = repair(text)
    const changed = repaired !== text
    if (problems.length > 0) {
      unresolved += problems.length
      console.log(`!! ${file.replace(root, '.')} has text that did not decode:`)
      for (const problem of problems.slice(0, 8)) console.log(`   line ${problem.line}: ${problem.text}`)
    }
    if (changed) {
      touched += 1
      console.log(`${fix ? 'fixed' : 'needs fixing'}: ${file.replace(root, '.')}`)
      if (fix) await writeFile(file, repaired, 'utf8')
    } else if (hasCjk(text) === false && /dsh-notes/.test(file) === false) {
      /* nothing to say about files without CJK */
    }
  }
}

console.log(`\n${touched} file(s) ${fix ? 'rewritten' : 'need repair'}, ${unresolved} unresolved line(s)`)
process.exitCode = unresolved === 0 ? 0 : 1
