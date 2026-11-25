import { z } from 'zod'
import { configSchema, newConfiguration, type Configuration } from '../shared/config'
import type { Catalog, CartReceipt, Preview, ProofRef, Quote } from '../shared/contracts'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch('/api/' + path, options)
  if (!res.ok) {
    const info = await res.json().catch(() => null)
    throw new Error(info?.error || 'The service is unavailable. Please try again.')
  }
  return res.json() as Promise<T>
}
const post = (value: unknown, signal?: AbortSignal): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(value),
  signal,
})
export const studioApi = {
  catalog: () => request<Catalog>('catalog'),
  quote: (c: Configuration, signal?: AbortSignal) => request<Quote>('quotes', post(c, signal)),
  upload: (file: File) => request<{ id: string }>('assets', { method: 'POST', body: file }),
  saveProof: (configuration: Configuration, hero: string, previews: Preview[]) =>
    request<ProofRef>('configurations', post({ configuration, hero, previews })),
  cart: (configurationId: string, requestId: string) =>
    request<CartReceipt>('cart', post({ configurationId, requestId })),
}
export function readLocal<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem('fieldwork/' + key) || 'null') ?? fallback
  } catch {
    return fallback
  }
}
export function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem('fieldwork/' + key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}
export function loadDraft(): Configuration {
  const result = configSchema.safeParse(readLocal('draft/v1', null))
  return result.success ? result.data : newConfiguration()
}
const receiptEntry = z.object({
  id: z.string().uuid(),
  mode: z.literal('mock'),
  proof: z.object({
    id: z.string().uuid(),
    pdfUrl: z.string().startsWith('/api/configurations/'),
    configUrl: z.string().startsWith('/api/configurations/'),
  }),
  quote: z.object({
    totalCents: z.number(),
    quantity: z.number(),
    lines: z.array(z.object({ label: z.string(), totalCents: z.number() })),
  }),
  items: z.array(z.unknown()),
})
export function loadCart(): CartReceipt[] {
  const items = readLocal<unknown>('cart/v1', [])
  return Array.isArray(items) ? items.filter((r) => receiptEntry.safeParse(r).success) : []
}
export function download(url: string, filename: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}
export function embeddedParent(): string | null {
  if (window.parent === window) return null
  try {
    const origin = new URL(document.referrer).origin
    const requested = new URLSearchParams(location.search).get('parentOrigin')
    return requested && requested !== origin ? null : origin
  } catch {
    return null
  }
}
export function publishToParent(type: string, payload: unknown) {
  const origin = embeddedParent()
  if (origin)
    window.parent.postMessage({ source: 'fieldwork-studio', version: 1, type, payload }, origin)
}
