/**
 * Backup: keep a copy of the notebook somewhere else.
 *
 * Two destinations, one shape. A **folder** is a directory this machine can see — a mounted NAS share,
 * a Dropbox/OneDrive/Nextcloud folder, an external disk. **WebDAV** is the same thing over HTTPS, which
 * is what most NAS boxes actually expose (`https://nas.local:5006/notes`). Both receive the same tree:
 *
 *   notes.json              the whole notebook, restorable by copying one file back
 *   trash.json              the recycle bin, kept for the same reason
 *   notes/<id>.md           one plain Markdown file per note, readable in any editor
 *   assets/<name>           the pictures the notes point at, byte for byte
 *   history/<id>/<st>.md    the kept versions, when history is on
 *   sync.json               a manifest: path → sha256, so the next run only writes what changed
 *
 * Nothing here deletes anything unless `sync.mirror` is on, and then only files this engine wrote in a
 * previous run and that no longer exist in the notebook. The destination is never read back into the
 * notebook: this is a backup, not a two-way merge, and a half-finished push must not be able to
 * overwrite an edit.
 *
 * Runs are debounced (a save schedules one), serialised (one at a time), and never throw at the caller:
 * a NAS that is asleep is a status line on the settings page, not a failed save.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { listAssets, typeOfAsset } from './assets.js'

const MANIFEST = 'sync.json'
const TIMEOUT_MS = 20000
const MAX_FILES = 600
const SCHEMA = 1

/** Bytes or text, whichever the file is — an image must hash as its bytes, not as decoded text. */
export function sha256(content) {
  const chunk = Buffer.isBuffer(content) ? content : String(content)
  return createHash('sha256').update(chunk).digest('hex')
}

/** `base` + `a/b c.md`, with each segment escaped and single slashes. */
export function joinUrl(base, path) {
  const root = String(base ?? '').replace(/\/+$/, '')
  const tail = String(path ?? '')
    .split('/')
    .filter((segment) => segment !== '')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `${root}/${tail}`
}

function authorization(sync) {
  if (typeof sync?.username !== 'string' || sync.username === '') return {}
  const raw = `${sync.username}:${String(sync.password ?? '')}`
  return { authorization: `Basic ${Buffer.from(raw, 'utf8').toString('base64')}` }
}

function describe(status, what) {
  if (status === 401) return `${what}: 用户名或密码不对（401）`
  if (status === 403) return `${what}: 服务器拒绝写入（403）`
  if (status === 404) return `${what}: 地址不存在（404），检查 URL 是否指到目录`
  if (status === 405) return `${what}: 方法不被支持（405），这个地址可能不是 WebDAV 目录`
  return `${what}: HTTP ${status}`
}

export class SyncEngine {
  constructor({ store, settingsOf }, { logger } = {}) {
    this.store = store
    this.settingsOf = settingsOf
    this.logger = logger
    this.timer = undefined
    this.running = false
    this.queued = false
    this.status = {
      mode: 'off',
      configured: false,
      auto: true,
      lastAt: null,
      lastResult: 'never',
      lastError: '',
      lastCount: 0,
      running: false,
    }
  }

  /** What the panel shows: no password, no destination internals beyond what it typed. */
  state() {
    return { ...this.status, running: this.running }
  }

  async settings() {
    try {
      return await this.settingsOf()
    } catch {
      return { sync: { mode: 'off', auto: true, mirror: true } }
    }
  }

  /** Whether the destination is filled in enough to try at all. */
  configured(sync) {
    if (sync.mode === 'folder') return sync.folder !== ''
    if (sync.mode === 'webdav') return sync.url !== ''
    return false
  }

  /** A save happened: write a copy in a few seconds, unless a run is already scheduled. */
  schedule(delay = 4000) {
    void this.settings().then((settings) => {
      const sync = settings.sync ?? {}
      this.status.mode = sync.mode ?? 'off'
      this.status.auto = sync.auto !== false
      this.status.configured = this.configured(sync)
      if (sync.mode === 'off' || sync.auto === false || this.configured(sync) === false) return
      if (this.timer !== undefined) return
      this.timer = setTimeout(() => {
        this.timer = undefined
        void this.run({ manual: false })
      }, Math.max(0, delay))
      this.timer.unref?.()
    })
  }

  cancel() {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
  }

  /**
   * One push. `manual: true` from the button; the scheduled one stays quiet about "nothing to do".
   */
  async run({ manual = false } = {}) {
    if (this.running) {
      this.queued = true
      return { ...this.state(), queued: true }
    }
    this.running = true
    const settings = await this.settings()
    const sync = settings.sync ?? { mode: 'off' }
    this.status.mode = sync.mode
    this.status.auto = sync.auto !== false
    this.status.configured = this.configured(sync)
    try {
      if (sync.mode === 'off') {
        this.status.lastResult = 'off'
        this.status.lastError = ''
        return this.state()
      }
      if (this.configured(sync) === false) {
        this.status.lastResult = 'error'
        this.status.lastError = sync.mode === 'folder' ? '还没有填备份文件夹' : '还没有填 WebDAV 地址'
        return this.state()
      }
      const files = await this.buildFiles(settings)
      const result = sync.mode === 'folder'
        ? await this.pushFolder(sync, files, manual)
        : await this.pushWebdav(sync, files)
      this.status.lastAt = new Date().toISOString()
      this.status.lastResult = 'ok'
      this.status.lastError = ''
      this.status.lastCount = result.written
      this.logger?.info?.(`[notes] backup ${sync.mode}: ${result.written} written, ${result.skipped} unchanged`)
      return this.state()
    } catch (error) {
      this.status.lastAt = new Date().toISOString()
      this.status.lastResult = 'error'
      this.status.lastError = String(error?.message ?? error).slice(0, 300)
      this.logger?.warn?.(`[notes] backup failed: ${this.status.lastError}`)
      return this.state()
    } finally {
      this.running = false
      if (this.queued) {
        this.queued = false
        void this.run({ manual: false })
      }
    }
  }

  /** Try the destination without writing the notebook, so the button can answer honestly. */
  async test() {
    const settings = await this.settings()
    const sync = settings.sync ?? { mode: 'off' }
    this.status.mode = sync.mode
    this.status.configured = this.configured(sync)
    if (sync.mode === 'off') return { ok: false, message: '先在设置里选一个备份位置' }
    if (this.configured(sync) === false) {
      return { ok: false, message: sync.mode === 'folder' ? '还没有填备份文件夹' : '还没有填 WebDAV 地址' }
    }
    try {
      if (sync.mode === 'folder') {
        const probe = join(sync.folder, '.dsh-notes-probe')
        await mkdir(dirname(probe), { recursive: true })
        await writeFile(probe, new Date().toISOString(), 'utf8')
        const back = await readFile(probe, 'utf8')
        await rm(probe, { force: true })
        const ok = back !== ''
        this.status.lastResult = ok ? 'ok' : 'error'
        this.status.lastError = ok ? '' : '写进去读不回来'
        return { ok, message: ok ? `可以写入 ${sync.folder}` : '写进去读不回来' }
      }
      const response = await fetch(sync.url, {
        method: 'PROPFIND',
        headers: { depth: '0', ...authorization(sync) },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (response.status === 207 || response.ok) {
        this.status.lastResult = 'ok'
        this.status.lastError = ''
        return { ok: true, message: `连上了 ${sync.url}` }
      }
      // A missing collection is fine: the first push creates it.
      if (response.status === 404) {
        const made = await this.mkcol(sync, sync.url)
        const ok = made === true
        this.status.lastResult = ok ? 'ok' : 'error'
        this.status.lastError = ok ? '' : '目录不存在，也建不出来'
        return { ok, message: ok ? `连上了 ${sync.url}（目录会在同步时创建）` : '目录不存在，也建不出来' }
      }
      this.status.lastResult = 'error'
      this.status.lastError = describe(response.status, '连接')
      return { ok: false, message: this.status.lastError }
    } catch (error) {
      const message = String(error?.name === 'TimeoutError' ? '连接超时' : (error?.message ?? error)).slice(0, 300)
      this.status.lastResult = 'error'
      this.status.lastError = message
      return { ok: false, message }
    }
  }

  // ------------------------------------------------------------- content ---

  /** Everything a restore would need, as text, with the manifest paths it will live at. */
  async buildFiles(settings) {
    const data = await this.store.load()
    // No timestamp inside the two json files: an unchanged notebook has to hash the same as last
    // time, or every run would rewrite them and "nothing changed" would never be true.
    const files = [
      {
        path: 'notes.json',
        content: `${JSON.stringify({ version: SCHEMA, kind: 'notes', notes: data.notes.notes }, null, 2)}\n`,
      },
      {
        path: 'trash.json',
        content: `${JSON.stringify({ version: SCHEMA, kind: 'trash', notes: data.trash.notes }, null, 2)}\n`,
      },
    ]
    for (const note of data.notes.notes) {
      files.push({ path: `notes/${note.id}.md`, content: `${String(note.body ?? '')}\n` })
    }
    // The pictures come next: a note that says `![](assets/…)` is not restorable without them.
    for (const asset of await listAssets(this.store)) {
      if (files.length >= MAX_FILES) return files
      files.push({ path: asset.path, content: asset.body })
    }
    if (settings?.history?.keep !== false) {
      const root = join(this.store.resolveDirectory(), 'history')
      for (const noteId of await safeList(root)) {
        for (const name of await safeList(join(root, noteId))) {
          if (!/^\d{8}T\d{6}-\d{3}\.md$/.test(name)) continue
          const body = await safeRead(join(root, noteId, name))
          if (body === null) continue
          files.push({ path: `history/${noteId}/${name}`, content: body })
          if (files.length >= MAX_FILES) return files
        }
      }
    }
    return files
  }

  // -------------------------------------------------------------- folder ---

  async pushFolder(sync, files, manual) {
    const root = sync.folder
    const manifest = await readManifestFile(root)
    const previous = manifest?.files ?? {}
    let written = 0
    let skipped = 0
    for (const file of files) {
      const hash = sha256(file.content)
      if (previous[file.path] === hash) {
        skipped += 1
        continue
      }
      await writeAtomic(join(root, file.path), file.content)
      written += 1
    }
    const removed = await this.dropStale(root, previous, files, sync)
    await writeManifestFile(root, { version: SCHEMA, at: new Date().toISOString(), mode: 'folder', files: hashes(files) })
    if (manual && written === 0 && skipped > 0) this.logger?.info?.('[notes] backup: nothing changed')
    return { written, skipped, removed }
  }

  /** Only files this engine wrote last time, only under the two trees it owns. */
  async dropStale(root, previous, files, sync) {
    if (sync.mirror === false) return 0
    const keep = new Set(files.map((file) => file.path))
    let removed = 0
    for (const path of Object.keys(previous)) {
      if (keep.has(path)) continue
      if (!path.startsWith('notes/') && !path.startsWith('history/') && !path.startsWith('assets/')) continue
      try {
        await rm(join(root, path), { force: true })
        removed += 1
      } catch {
        /* a file that is already gone is the state we wanted */
      }
    }
    return removed
  }

  // -------------------------------------------------------------- webdav ---

  async pushWebdav(sync, files) {
    const directories = new Set()
    for (const file of files) {
      const parent = file.path.split('/').slice(0, -1).join('/')
      if (parent !== '') directories.add(parent)
    }
    for (const directory of sortedDirectories(directories)) {
      await this.mkcol(sync, joinUrl(sync.url, directory))
    }
    const manifest = await readManifestUrl(sync)
    const previous = manifest?.files ?? {}
    let written = 0
    let skipped = 0
    for (const file of files) {
      const hash = sha256(file.content)
      if (previous[file.path] === hash) {
        skipped += 1
        continue
      }
      const response = await fetch(joinUrl(sync.url, file.path), {
        method: 'PUT',
        headers: {
          'content-type': contentTypeOf(file.path),
          ...authorization(sync),
        },
        body: file.content,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (response.status >= 300) throw new Error(describe(response.status, `写入 ${file.path}`))
      written += 1
    }
    const removed = await this.deleteStaleWebdav(sync, previous, files)
    const manifestText = `${JSON.stringify({ version: SCHEMA, at: new Date().toISOString(), mode: 'webdav', files: hashes(files) }, null, 2)}\n`
    const response = await fetch(joinUrl(sync.url, MANIFEST), {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...authorization(sync) },
      body: manifestText,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (response.status >= 300) throw new Error(describe(response.status, '写入清单'))
    return { written, skipped, removed }
  }

  async deleteStaleWebdav(sync, previous, files) {
    if (sync.mirror === false) return 0
    const keep = new Set(files.map((file) => file.path))
    let removed = 0
    for (const path of Object.keys(previous)) {
      if (keep.has(path)) continue
      if (!path.startsWith('notes/') && !path.startsWith('history/') && !path.startsWith('assets/')) continue
      try {
        const response = await fetch(joinUrl(sync.url, path), {
          method: 'DELETE',
          headers: authorization(sync),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        if (response.status < 300 || response.status === 404) removed += 1
      } catch {
        /* a delete that fails is retried on the next run; it must not fail the push */
      }
    }
    return removed
  }

  /**
   * Create a collection. 201 is "made", 405 is "already there" — WebDAV answers 405 for MKCOL on an
   * existing collection, which is the normal case after the first run.
   */
  async mkcol(sync, url) {
    const response = await fetch(url, {
      method: 'MKCOL',
      headers: authorization(sync),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (response.status === 201 || response.status === 405 || response.ok) return true
    if (response.status === 409) {
      // The parent is missing; build the chain from the top.
      const parent = url.replace(/\/[^/]+$/, '')
      if (parent !== url && parent.length > sync.url.length) {
        await this.mkcol(sync, parent)
        const retry = await fetch(url, { method: 'MKCOL', headers: authorization(sync), signal: AbortSignal.timeout(TIMEOUT_MS) })
        return retry.status === 201 || retry.status === 405 || retry.ok
      }
    }
    return false
  }
}

/** Parents before children, so `history/<id>` is created after `history`. */
function sortedDirectories(directories) {
  return [...directories].sort((left, right) => left.split('/').length - right.split('/').length)
}

function hashes(files) {
  const map = {}
  for (const file of files) map[file.path] = sha256(file.content)
  return map
}

function contentTypeOf(path) {
  const image = typeOfAsset(path)
  if (image !== null) return image
  return String(path).endsWith('.json') ? 'application/json; charset=utf-8' : 'text/markdown; charset=utf-8'
}

async function safeList(directory) {
  try {
    return await readdir(directory)
  } catch {
    return []
  }
}

async function safeRead(path) {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

/** Write through a temp file, then rename — the destination may be a synced or network folder. */
async function writeAtomic(path, content) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temporary, content, 'utf8')
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rename(temporary, path)
      return
    } catch (error) {
      const code = error?.code
      if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') throw error
      await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)))
    }
  }
  await writeFile(path, content, 'utf8')
  await rm(temporary, { force: true }).catch(() => {})
}

async function readManifestFile(root) {
  try {
    return JSON.parse(await readFile(join(root, MANIFEST), 'utf8'))
  } catch {
    return null
  }
}

async function writeManifestFile(root, manifest) {
  await writeAtomic(join(root, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`)
}

async function readManifestUrl(sync) {
  try {
    const response = await fetch(joinUrl(sync.url, MANIFEST), {
      headers: authorization(sync),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (response.status >= 300) return null
    return JSON.parse(await response.text())
  } catch {
    return null
  }
}
