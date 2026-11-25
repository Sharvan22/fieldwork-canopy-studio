import { getStore } from '@netlify/blobs'
import { api } from '../../server/api'

export const config = { path: '/api/*' }

export default function studio(request: Request) {
  const bucket = getStore({ name: 'fieldwork-production', consistency: 'strong' })
  return api(request, {
    async get(key) {
      const data = await bucket.get(key, { type: 'arrayBuffer' })
      return data === null ? null : new Uint8Array(data)
    },
    async put(key, bytes) {
      await bucket.set(key, Uint8Array.from(bytes).buffer)
    },
  })
}
