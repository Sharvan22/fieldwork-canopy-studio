import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ObjectStore } from './store'
import { api } from './api'

export function diskStore(root = resolve(process.env.STUDIO_DATA_DIR || '.data')): ObjectStore {
  return {
    async get(key) {
      try {
        return new Uint8Array(await readFile(resolve(root, key)))
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw e
      }
    },
    async put(key, bytes) {
      const path = resolve(root, key)
      await mkdir(dirname(path), { recursive: true })
      const temp = path + '.' + crypto.randomUUID() + '.tmp'
      await writeFile(temp, bytes)
      await rename(temp, path)
    },
  }
}
export function apiMiddleware(store = diskStore()) {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/')) return next()
    try {
      const headers = new Headers()
      for (const [k, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') headers.set(k, value)
      }
      const init: RequestInit & { duplex?: 'half' } = { method: req.method, headers }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        init.body = Readable.toWeb(req) as ReadableStream<Uint8Array>
        init.duplex = 'half'
      }
      const origin = process.env.PUBLIC_ORIGIN || 'http://' + (req.headers.host || 'localhost')
      const response = await api(new Request(new URL(req.url, origin), init), store)
      res.writeHead(response.status, Object.fromEntries(response.headers))
      res.end(Buffer.from(await response.arrayBuffer()))
    } catch {
      res.writeHead(500)
      res.end('Studio service unavailable')
    }
  }
}
