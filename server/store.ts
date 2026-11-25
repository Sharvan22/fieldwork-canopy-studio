export interface ObjectStore {
  get(key: string): Promise<Uint8Array | null>
  put(key: string, bytes: Uint8Array): Promise<void>
}
export const bytesOf = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
export async function getJson<T>(store: ObjectStore, key: string): Promise<T | null> {
  const bytes = await store.get(key)
  return bytes ? (JSON.parse(new TextDecoder().decode(bytes)) as T) : null
}
export async function digest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
export function imageMime(bytes: Uint8Array): string | undefined {
  const start = bytes.subarray(0, 12)
  if (start[0] === 0xff && start[1] === 0xd8 && start[2] === 0xff) return 'image/jpeg'
  if (
    bytes.length >= 33 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => start[i] === b) &&
    String.fromCharCode(...bytes.subarray(12, 16)) === 'IHDR'
  )
    return 'image/png'
  if (
    String.fromCharCode(...start.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...start.subarray(8, 12)) === 'WEBP'
  )
    return 'image/webp'
}
