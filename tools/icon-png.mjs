// Render the plugin icon to GitHub-hosted PNGs (the market tile must be a raster image).
//
// The SVG is drawn by the same Chrome the recorder talks to, at two sizes, with a transparent
// background so the tile sits on any theme.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const outDir = join(root, 'docs', 'marketing')
const svg = await readFile(join(root, 'icon.svg'), 'utf8')

const sizes = [
  { px: 180, name: 'icon-180.png' },
  { px: 512, name: 'icon-512.png' },
]

const page = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:transparent}
svg{display:block}
</style></head><body>${svg}</body></html>`

await mkdir(outDir, { recursive: true })
const pagePath = join(root, 'exports', 'icon.html')
await writeFile(pagePath, page, 'utf8')

const base = 'http://127.0.0.1:9222'
const created = await fetch(`${base}/json/new?${encodeURIComponent(pathToFileURL(pagePath).href)}`, { method: 'PUT' })
const target = await created.json()
if (target?.webSocketDebuggerUrl === undefined) {
  console.error('CDP target has no websocket url')
  process.exit(1)
}

const socket = new WebSocket(target.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id !== undefined && pending.has(message.id)) {
    pending.get(message.id)(message)
    pending.delete(message.id)
  }
})
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve)
  socket.addEventListener('error', reject)
})
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const messageId = ++id
    pending.set(messageId, resolve)
    socket.send(JSON.stringify({ id: messageId, method, params }))
  })

await send('Page.enable')
for (const { px, name } of sizes) {
  await send('Emulation.setDeviceMetricsOverride', { width: px, height: px, deviceScaleFactor: 1, mobile: false })
  await send('Runtime.evaluate', {
    expression: `(() => {
      const svg = document.querySelector('svg')
      svg.setAttribute('width', '${px}')
      svg.setAttribute('height', '${px}')
      svg.setAttribute('viewBox', '0 0 32 32')
    })()`,
  })
  await new Promise((resolve) => setTimeout(resolve, 150))
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: px, height: px, scale: 1 },
    omitBackground: true,
  })
  const bytes = Buffer.from(shot.result.data, 'base64')
  await writeFile(join(outDir, name), bytes)
  console.log(`${name}: ${px}x${px}, ${(bytes.length / 1024).toFixed(1)} KB`)
}

await fetch(`${base}/json/close/${target.id}`)
socket.close()
