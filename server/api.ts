import { z } from 'zod'
import { activeSurfaces, configSchema, panelFor } from '../shared/config'
import type { CartReceipt, ProductionRecord, ProofRef } from '../shared/contracts'
import { demoPricing, type PricingService } from './pricing'
import { mockShopifyCart } from './shopify'
import { productionPdf } from './pdf'
import { bytesOf, digest, getJson, imageMime, type ObjectStore } from './store'

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } })
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
const jpeg = z.string().startsWith('data:image/jpeg;base64,').max(2200000)
const proofInput = z.object({
  configuration: configSchema,
  hero: jpeg,
  previews: z.array(z.object({ id: z.string().max(40), jpeg })).max(24),
})
const cartInput = z.object({ configurationId: z.string().uuid(), requestId: z.string().uuid() })
async function readBytes(request: Request, max: number) {
  if (Number(request.headers.get('content-length')) > max)
    throw new HttpError(413, 'File is too large.')
  const reader = request.body?.getReader()
  if (!reader) throw new HttpError(400, 'Request body is required.')
  let length = 0
  const chunks: Uint8Array[] = []
  for (;;) {
    const next = await reader.read()
    if (next.done) break
    length += next.value.length
    if (length > max) {
      await reader.cancel()
      throw new HttpError(413, 'File is too large.')
    }
    chunks.push(next.value)
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}
async function readJson(request: Request, max = 240000) {
  const bytes = await readBytes(request, max)
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    throw new HttpError(400, 'Invalid JSON.')
  }
}
export async function api(
  request: Request,
  store: ObjectStore,
  pricing: PricingService = demoPricing,
): Promise<Response> {
  const path = new URL(request.url).pathname
  const post = request.method === 'POST',
    get = request.method === 'GET'
  try {
    if (get && path === '/api/catalog') return json(await pricing.getCatalog())
    if (post && path === '/api/quotes')
      return json(await pricing.quote(configSchema.parse(await readJson(request))))
    if (post && path === '/api/assets') {
      const bytes = await readBytes(request, 8 * 1024 * 1024)
      const mime = imageMime(bytes)
      if (!mime) throw new HttpError(415, 'Choose a PNG, JPEG, or WebP image.')
      const id = await digest(bytes)
      await store.put('assets/' + id, bytes)
      return json({ id }, 201)
    }
    const asset = path.match(/^\/api\/assets\/([a-f0-9]{64})$/)
    if (get && asset) {
      const bytes = await store.get('assets/' + asset[1])
      if (!bytes) throw new HttpError(404, 'Artwork was not found.')
      return new Response(bytes, {
        headers: {
          'Content-Type': imageMime(bytes)!,
          'Cache-Control': 'private, max-age=31536000, immutable',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }
    if (post && path === '/api/configurations') {
      const {
        configuration: draft,
        hero,
        previews,
      } = proofInput.parse(await readJson(request, 9 * 1024 * 1024))
      const surfaces = activeSurfaces(draft.options)
      const configuration = {
        ...draft,
        panels: Object.fromEntries(surfaces.map((s) => [s.id, panelFor(draft, s.id)])),
      }
      if (
        previews.length !== surfaces.length ||
        surfaces.some((s) => !previews.some((p) => p.id === s.id))
      )
        throw new HttpError(422, 'Every active print surface needs a proof.')
      const assets = new Set<string>()
      for (const s of surfaces)
        for (const l of panelFor(configuration, s.id).layers)
          if (l.type === 'image') assets.add(l.assetId)
      for (const id of assets)
        if (!(await store.get('assets/' + id)))
          throw new HttpError(422, 'An uploaded image is missing. Upload it again.')
      const id = crypto.randomUUID()
      const base = '/api/configurations/' + id
      const proof: ProofRef = {
        id,
        createdAt: new Date().toISOString(),
        pdfUrl: base + '/production.pdf',
        configUrl: base,
      }
      const record: ProductionRecord = {
        ...proof,
        configuration,
        quote: await pricing.quote(configuration),
      }
      const pdf = await productionPdf(record, hero, previews, await pricing.getCatalog())
      await store.put('proofs/' + id + '.pdf', pdf)
      await store.put('proofs/' + id + '.json', bytesOf(record))
      return json(proof, 201)
    }
    const proof = path.match(/^\/api\/configurations\/([a-f0-9-]{36})(\/production\.pdf)?$/)
    if (get && proof) {
      const pdf = Boolean(proof[2])
      const bytes = await store.get('proofs/' + proof[1] + (pdf ? '.pdf' : '.json'))
      if (!bytes) throw new HttpError(404, 'Configuration was not found.')
      return new Response(bytes, {
        headers: {
          'Content-Type': pdf ? 'application/pdf' : 'application/json',
          'Cache-Control': 'private, no-cache',
          ...(pdf
            ? { 'Content-Disposition': 'attachment; filename="Fieldwork-' + proof[1] + '.pdf"' }
            : {}),
        },
      })
    }
    if (post && path === '/api/cart') {
      const { configurationId, requestId } = cartInput.parse(await readJson(request))
      const key = 'cart/' + configurationId + '/' + requestId + '.json'
      const existing = await getJson<CartReceipt>(store, key)
      if (existing) return json(existing)
      const record = await getJson<ProductionRecord>(store, 'proofs/' + configurationId + '.json')
      if (!record) throw new HttpError(404, 'Create a production proof before adding to cart.')
      const quote = await pricing.quote(record.configuration)
      if (quote.revision !== record.quote.revision || quote.totalCents !== record.quote.totalCents)
        throw new HttpError(409, 'Pricing changed. Create a new proof.')
      const receipt = mockShopifyCart(record, quote, requestId, request.url)
      await store.put(key, bytesOf(receipt))
      return json(receipt, 201)
    }
    return json({ error: 'Unknown endpoint or method.' }, 404)
  } catch (e) {
    if (e instanceof z.ZodError)
      return json(
        {
          error: 'Invalid configuration.',
          fields: e.issues.map((i) => i.path.join('.')).slice(0, 8),
        },
        422,
      )
    if (e instanceof HttpError) return json({ error: e.message }, e.status)
    console.error('API failure', path, e instanceof Error ? e.message : 'Unknown error')
    return json({ error: 'The studio could not complete this request. Please try again.' }, 500)
  }
}
