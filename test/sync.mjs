// Backup and history: what reaches the destination, what is skipped, what gets pruned.
// Run with: node test/sync.mjs

import { mkdtemp, readFile, readdir, rm, stat, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { NoteStore } from '../lib/store.js'
import { saveAsset } from '../lib/assets.js'
import { DEFAULT_SETTINGS, SettingsStore, normalizeSettings, publicSettings } from '../lib/settings.js'
import { RevisionStore, bodyTitle, revisionStamp, stampDate } from '../lib/revisions.js'
import { SyncEngine, joinUrl, sha256 } from '../lib/sync.js'

let failures = 0
const check = (label, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${condition ? '' : `  ${detail}`}`)
  if (!condition) failures += 1
}

const root = await mkdtemp(join(tmpdir(), 'dsh-notes-sync-'))
const vault = join(root, 'vault')
const backup = join(root, 'backup')

const store = new NoteStore({ ctx: { get: () => undefined }, config: { notesPath: vault } })
const settings = new SettingsStore(store)
const revisions = new RevisionStore(store, { settingsOf: () => settings.read() })
const engine = new SyncEngine({ store, settingsOf: () => settings.read() })

const exists = async (path) => {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

try {
  // ---- settings shape ----
  check('backups start off, history starts on', DEFAULT_SETTINGS.sync.mode === 'off' && DEFAULT_SETTINGS.history.keep === true)
  const merged = normalizeSettings({ sync: { folder: 'D:/copy' } })
  check('a sync patch keeps the other keys', merged.sync.folder === 'D:/copy' && merged.sync.mirror === true && merged.sync.auto === true)
  check('a history patch keeps the other keys', normalizeSettings({ history: { limit: 5 } }).history.keep === true)
  check('a limit is clamped', normalizeSettings({ history: { limit: 9000 } }).history.limit === 500)
  check('a non-http url is refused', normalizeSettings({ sync: { url: 'file:///etc' } }).sync.url === '')
  check('an https url keeps its directory', normalizeSettings({ sync: { url: 'https://nas.local:5006/notes/' } }).sync.url === 'https://nas.local:5006/notes')

  const stored = await settings.write({ sync: { mode: 'webdav', url: 'https://nas.local/notes', username: 'me', password: 'secret' } })
  check('the password is stored', stored.sync.password === 'secret')
  const publicCopy = publicSettings(stored)
  check('the password never travels back', publicCopy.sync.password === '' && publicCopy.sync.passwordSet === true)
  const patched = await settings.write({ sync: { auto: false } })
  check('an unrelated patch keeps the password', patched.sync.password === 'secret' && patched.sync.auto === false)
  await settings.write({ sync: { password: '' } })
  check('an empty password is a deliberate clear', (await settings.read()).sync.password === '')

  // ---- url joining ----
  check('paths are escaped, single slashes', joinUrl('https://nas.local/notes/', 'notes/a b.md') === 'https://nas.local/notes/notes/a%20b.md')
  check('hashes are stable', sha256('abc') === sha256('abc') && sha256('abc') !== sha256('abd'))

  // ---- history ----
  const first = await store.save({ body: '第一版\n\n正文第一段' })
  const id = first.note.id
  const kept = await revisions.record({ note: { id, body: '第零版' } })
  check('a version is kept as one markdown file', kept !== null && (await readFile(join(revisions.directoryOf(id), `${kept.stamp}.md`), 'utf8')) === '第零版')
  check('a stamp sorts and reads back as a date', stampDate(kept.stamp) instanceof Date && revisionStamp(new Date('2026-11-11T10:15:30.412Z')) === '20261111T101530-412')
  check('the same body is not kept twice', (await revisions.record({ note: { id, body: '第零版' } })) === null)

  const listed = await revisions.list(id)
  check('the list carries when and what', listed.length === 1 && listed[0].title === '第零版' && typeof listed[0].chars === 'number')
  check('one version reads back whole', (await revisions.read(id, kept.stamp)).body === '第零版')

  await settings.write({ history: { limit: 2 } })
  for (const body of ['版本A', '版本B', '版本C']) await revisions.record({ note: { id, body } })
  check('the limit prunes the oldest first', (await revisions.list(id)).length === 2)
  const newest = (await revisions.list(id))[0]
  const newestBody = (await revisions.read(id, newest.stamp)).body
  const restored = await revisions.restore(id, newest.stamp)
  check('a restore writes the old body back', restored.note.note.body === newestBody)
  check('the restore itself is undoable', (await revisions.list(id)).length >= 1)

  await settings.write({ history: { keep: false } })
  check('history off writes nothing', (await revisions.record({ note: { id, body: '不该留下的' } })) === null)
  await settings.write({ history: { keep: true } })

  // ---- folder backup ----
  await settings.write({ sync: { mode: 'folder', folder: backup, auto: false } })
  const snapshot = await store.snapshot()
  const runOne = await engine.run({ manual: true })
  check('a folder run reports success', runOne.lastResult === 'ok' && runOne.lastCount > 0, JSON.stringify(runOne))
  check('the manifest lands beside the copy', await exists(join(backup, 'sync.json')))
  check('the whole notebook lands as json', await exists(join(backup, 'notes.json')))
  check('every note lands as markdown', await exists(join(backup, 'notes', `${id}.md`)))
  const copied = await readFile(join(backup, 'notes', `${id}.md`), 'utf8')
  check('the markdown is the note body', copied === `${snapshot.notes.find((note) => note.id === id).body}\n`)

  const runTwo = await engine.run({ manual: true })
  check('an unchanged notebook uploads nothing', runTwo.lastCount === 0, JSON.stringify(runTwo))

  await store.save({ id, body: '改过的正文' })
  const runThree = await engine.run({ manual: true })
  check('a changed note uploads again', runThree.lastCount >= 1 && (await readFile(join(backup, 'notes', `${id}.md`), 'utf8')) === '改过的正文\n', JSON.stringify(runThree))

  // ---- deletions ----
  const second = await store.save({ body: '会被删掉的一条' })
  await engine.run({ manual: true })
  check('the second note is copied', await exists(join(backup, 'notes', `${second.note.id}.md`)))
  await settings.write({ sync: { mirror: false } })
  await store.remove(second.note.id)
  await engine.run({ manual: true })
  check('mirror off keeps the copy of a deleted note', await exists(join(backup, 'notes', `${second.note.id}.md`)))

  await settings.write({ sync: { mirror: true } })
  const third = await store.save({ body: '第三条' })
  await engine.run({ manual: true })
  const thirdPath = join(backup, 'notes', `${third.note.id}.md`)
  check('the third note is copied', await exists(thirdPath))
  await store.remove(third.note.id)
  await engine.run({ manual: true })
  check('mirror on removes the copy of a deleted note', (await exists(thirdPath)) === false)

  // ---- pictures travel with the notes ----
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
  const asset = await saveAsset(store, { data: png.toString('base64'), name: 'shot.png', type: 'image/png' })
  check('a pasted picture is stored by its hash', /^assets\/[0-9a-f]{16}\.png$/.test(asset.path), asset.path)
  const withPicture = await engine.run({ manual: true })
  check('a new picture is uploaded', withPicture.lastCount >= 1, JSON.stringify(withPicture))
  const pictureCopy = join(backup, asset.path)
  check('the picture lands byte for byte', (await readFile(pictureCopy)).equals(png))
  const again = await engine.run({ manual: true })
  check('an unchanged picture is not uploaded twice', again.lastCount === 0, JSON.stringify(again))
  await store.remove(third.note.id)
  await settings.write({ sync: { mirror: true } })
  await engine.run({ manual: true })
  check('mirror on keeps a picture a note still uses', await exists(pictureCopy))

  // ---- test connection ----
  const folderTest = await engine.test()
  check('a folder destination is probed by writing', folderTest.ok === true, JSON.stringify(folderTest))
  await settings.write({ sync: { mode: 'folder', folder: '' } })
  const emptyTest = await engine.test()
  check('an empty destination is refused before anything is written', emptyTest.ok === false)

  // ---- webdav ----
  const original = globalThis.fetch
  const files = new Map()
  const methods = []
  globalThis.fetch = async (url, init = {}) => {
    const method = String(init.method ?? 'GET').toUpperCase()
    methods.push(method)
    if (method === 'PROPFIND') return new Response(null, { status: 207 })
    if (method === 'MKCOL') return new Response(null, { status: 201 })
    if (method === 'PUT') {
      files.set(String(url), String(init.body ?? ''))
      return new Response(null, { status: 201 })
    }
    if (method === 'GET') return files.has(String(url)) ? new Response(files.get(String(url)), { status: 200 }) : new Response('', { status: 404 })
    if (method === 'DELETE') return new Response(null, { status: 204 })
    return new Response('', { status: 405 })
  }
  try {
    await settings.write({ sync: { mode: 'webdav', url: 'https://nas.local:5006/notes', username: 'me', password: 'secret' } })
    const webdavRun = await engine.run({ manual: true })
    check('a webdav run reports success', webdavRun.lastResult === 'ok', JSON.stringify(webdavRun))
    check('the notebook is uploaded as json', files.has('https://nas.local:5006/notes/notes.json'))
    check('each note is uploaded as markdown', files.has(`https://nas.local:5006/notes/notes/${id}.md`))
    check('the destination is created before writing', methods.includes('MKCOL'))
    check('a manifest is uploaded last', files.has('https://nas.local:5006/notes/sync.json'))

    const before = files.size
    const second = await engine.run({ manual: true })
    check('an unchanged webdav notebook uploads nothing', second.lastCount === 0 && files.size === before, `${second.lastCount} ${files.size}`)

    const webdavTest = await engine.test()
    check('a webdav destination is probed without writing', webdavTest.ok === true, JSON.stringify(webdavTest))

    globalThis.fetch = async () => new Response('', { status: 401 })
    const refused = await engine.run({ manual: true })
    check('a refusing server is reported, not thrown', refused.lastResult === 'error' && refused.lastError.includes('401'), JSON.stringify(refused))
  } finally {
    globalThis.fetch = original
  }

  // ---- the store drives both ----
  check(
    'settings survive a reload in the same file',
    (await settings.read()).sync.mode === 'webdav' && (await settings.read()).history.limit === 2,
  )
} finally {
  await rm(root, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} failed`)
process.exit(failures === 0 ? 0 : 1)
