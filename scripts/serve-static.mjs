import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'

const root = resolve(process.argv[2] || 'dist/releases/h5-cn')
const port = Number(process.argv[3] || 4173)
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.pdf': 'application/pdf' }

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host}`)
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'
    let file = resolve(root, relative)
    if (!file.startsWith(`${root}${sep}`) && file !== root) throw new Error('Invalid path')
    try { if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html') } catch { file = resolve(root, 'index.html') }
    const data = await readFile(file)
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
    response.end(data)
  } catch {
    response.writeHead(404)
    response.end('Not found')
  }
}).listen(port, '127.0.0.1', () => console.log(`Shark Sister preview: http://127.0.0.1:${port}`))
