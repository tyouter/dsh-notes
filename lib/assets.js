/**
 * The images a note points at.
 *
 * A note is Markdown, so an image in it is a path — `assets/9f3c…8a.png` — and the bytes live
 * beside the notes, under the same directory. Two reasons it is not a data URL inside the note:
 * a base64 blob would be rewritten by every save, and the version history would keep a copy of
 * every pixel for every edit.
 *
 * The file name is the content hash, so the same picture pasted twice is one file, and a note that
 * is deleted and restored still points at the same bytes.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const ASSETS_DIR = 'assets'
export const MAX_ASSET_BYTES = 12 * 1024 * 1024

/** What a note may embed. An allowlist, because these bytes are served back to the page. */
const TYPES = new Map([
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['gif', 'image/gif'],
  ['webp', 'image/webp'],
  ['avif', 'image/avif'],
  ['svg', 'image/svg+xml'],
])

const MIME_EXT = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/gif', 'gif'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
  ['image/svg+xml', 'svg'],
])

export function assetsDirectory(store) {
  return join(store.resolveDirectory(), ASSETS_DIR)
}

/** `assets/x.png` → `image/png`, or null when the extension is not one we serve. */
export function typeOfAsset(path) {
  const match = String(path ?? '').trim().toLowerCase().match(/\.([a-z0-9]+)$/)
  if (match === null) return null
  return TYPES.get(match[1]) ?? null
}

/**
 * Is this path one of ours?
 *
 * Deliberately strict: no `..`, no absolute path, no backslash, one flat file name. The route that
 * serves assets is reachable from the page, so "which file is this" must never be guessed.
 */
export function safeAssetPath(raw) {
  const clean = String(raw ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^\.\//, '')
  if (!clean.startsWith(`${ASSETS_DIR}/`)) return null
  const name = clean.slice(ASSETS_DIR.length + 1)
  if (name === '' || name.includes('/')) return null
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) return null
  if (typeOfAsset(name) === null) return null
  return `${ASSETS_DIR}/${name}`
}

/**
 * Store one image and answer its note-relative path.
 *
 * `data` is base64, with or without a `data:image/png;base64,` prefix — that is what a paste gives
 * us. Only the extension is taken from `type`/`name`; the name itself is the hash, so uploads can
 * never overwrite each other and `../` has nowhere to land.
 */
export async function saveAsset(store, { data, name, type } = {}) {
  const raw = String(data ?? '').replace(/^data:[^;,]*(;[^,]*)?,/, '')
  if (raw === '') throw Object.assign(new Error('图片是空的。'), { code: 'BAD_REQUEST', status: 400 })
  const body = Buffer.from(raw, 'base64')
  if (body.length === 0) throw Object.assign(new Error('图片是空的。'), { code: 'BAD_REQUEST', status: 400 })
  if (body.length > MAX_ASSET_BYTES) {
    throw Object.assign(new Error(`图片太大了（${Math.round(body.length / 1024 / 1024)} MB），上限 12 MB。`), {
      code: 'TOO_LARGE',
      status: 413,
    })
  }

  const fromMime = MIME_EXT.get(String(type ?? '').toLowerCase())
  const fromName = String(name ?? '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''
  const ext = fromMime ?? (TYPES.has(fromName) ? (fromName === 'jpeg' ? 'jpg' : fromName) : 'png')

  const digest = createHash('sha256').update(body).digest('hex').slice(0, 16)
  const file = `${digest}.${ext}`
  const directory = assetsDirectory(store)
  await mkdir(directory, { recursive: true })
  const target = join(directory, file)
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temporary, body)
  try {
    await rename(temporary, target)
  } catch {
    // A rename over an existing file is fine on Windows only when it is not in use; fall back to a
    // direct write, which is what the note store does for the same reason.
    await writeFile(target, body)
    await rm(temporary, { force: true }).catch(() => {})
  }
  return { path: `${ASSETS_DIR}/${file}`, bytes: body.length, type: TYPES.get(ext) ?? 'image/png' }
}

/** Read one image back. Throws 404 for anything that is not a path we wrote. */
export async function readAsset(store, raw) {
  const path = safeAssetPath(raw)
  if (path === null) throw Object.assign(new Error('没有这张图片。'), { code: 'NOT_FOUND', status: 404 })
  try {
    const body = await readFile(join(store.resolveDirectory(), path))
    return { body, path, type: typeOfAsset(path) ?? 'application/octet-stream' }
  } catch {
    throw Object.assign(new Error('没有这张图片。'), { code: 'NOT_FOUND', status: 404 })
  }
}

/** Every stored image, newest name order — what a backup copies and a size report counts. */
export async function listAssets(store) {
  let names = []
  try {
    names = await readdir(assetsDirectory(store))
  } catch {
    return []
  }
  const out = []
  for (const name of names) {
    if (typeOfAsset(name) === null) continue
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) continue
    try {
      const body = await readFile(join(assetsDirectory(store), name))
      out.push({ path: `${ASSETS_DIR}/${name}`, bytes: body.length, body })
    } catch {
      /* a file that vanished between listing and reading is simply not there */
    }
  }
  return out
}
