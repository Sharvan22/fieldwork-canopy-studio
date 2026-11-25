import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { apiMiddleware } from './local'
const assets = resolve('dist/client')
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.glb': 'model/gltf-binary',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
}
const api = apiMiddleware()
const port = Number(process.env.PORT || 4173)
createServer(
  (req, res) =>
    void api(req, res, async () => {
      try {
        const pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname)
        const file = resolve(assets, '.' + (pathname === '/' ? '/index.html' : pathname))
        if (!file.startsWith(assets + sep)) {
          res.writeHead(404).end()
          return
        }
        const data = await readFile(file)
        res.writeHead(200, {
          'Content-Type': types[extname(file)] || 'application/octet-stream',
          'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
          'X-Content-Type-Options': 'nosniff',
        })
        res.end(data)
      } catch {
        res.writeHead(404).end('Not found')
      }
    }),
).listen(port, process.env.HOST || '127.0.0.1', () =>
  console.log('Fieldwork Studio: http://127.0.0.1:' + port),
)
