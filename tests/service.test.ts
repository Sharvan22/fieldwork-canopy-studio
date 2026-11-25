import test from 'node:test'
import assert from 'node:assert/strict'
import { activeSurfaces, newConfiguration, type Layer } from '../shared/config'
import { api } from '../server/api'
import { bytesOf, type ObjectStore } from '../server/store'
import { catalog, quoteConfiguration } from '../server/pricing'
import type { CartReceipt, ProductionRecord } from '../shared/contracts'

function memoryStore(): ObjectStore {
  const map = new Map<string, Uint8Array>()
  return {
    async put(k, v) {
      map.set(k, v)
    },
    async get(k) {
      return map.get(k) ?? null
    },
  }
}
const post = (path: string, value: unknown) =>
  new Request('https://studio.example' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  })
const textLayer: Layer = {
  type: 'text',
  id: 't',
  text: 'Trail club',
  font: 'Sans',
  ink: '#ffffff',
  x: 0.5,
  y: 0.7,
  width: 0.4,
  rotation: 12,
}
test('base variants, wall packages, quantities and active placements are priced in integer cents', () => {
  const c = newConfiguration()
  assert.equal(quoteConfiguration(c).totalCents, 84900)
  for (const op of catalog.frame) {
    c.options.frame = op.id as typeof c.options.frame
    assert.equal(quoteConfiguration(c).totalCents, op.cents)
  }
  c.options = { frame: 'fabric', full: 'one-double', half: 'pair-single' }
  c.quantity = 2
  c.panels['wall-back-inside'] = { color: '#112233', layers: [textLayer] }
  c.panels['half-left'] = {
    color: '#112233',
    layers: [{ ...textLayer, type: 'image', name: 'a.png', assetId: 'a'.repeat(64), aspect: 1 }],
  }
  assert.equal(quoteConfiguration(c).totalCents, 2 * (49900 + 21900 + 15900 + 800 + 1800))
  c.options.full = 'none'
  c.options.half = 'none'
  assert.equal(quoteConfiguration(c).totalCents, 99800)
  assert.equal(c.panels['wall-back-inside'].layers[0].rotation, 12)
})
test('all full and half wall choices produce uniquely addressable outward and inward surfaces', () => {
  const c = newConfiguration()
  assert.equal(activeSurfaces(c.options).length, 8)
  c.options.full = 'three-double'
  c.options.half = 'pair-double'
  const ids = activeSurfaces(c.options).map((s) => s.id)
  assert.equal(ids.length, 18)
  assert.equal(new Set(ids).size, 18)
  assert.ok(ids.includes('half-right-inside'))
  assert.ok(!ids.includes('wall-front'))
})
test('API validates schema and calculates prices independently of submitted totals', async () => {
  const store = memoryStore(),
    c = newConfiguration()
  const invalid = await api(post('/api/quotes', { ...c, quantity: -4 }), store)
  assert.equal(invalid.status, 422)
  const result = await api(post('/api/quotes', { ...c, totalCents: 1 }), store)
  assert.equal((await result.json()).totalCents, 84900)
})
test('cart projects the saved quote to separately priced Shopify variants and tolerates replay', async () => {
  const store = memoryStore(),
    c = newConfiguration(),
    id = crypto.randomUUID(),
    requestId = crypto.randomUUID()
  c.panels['roof-front'].layers.push(textLayer)
  const record: ProductionRecord = {
    id,
    createdAt: new Date().toISOString(),
    configUrl: '/api/configurations/' + id,
    pdfUrl: '/api/configurations/' + id + '/production.pdf',
    quote: quoteConfiguration(c),
    configuration: c,
  }
  await store.put('proofs/' + id + '.json', bytesOf(record))
  const add = () => api(post('/api/cart', { configurationId: id, requestId, totalCents: 1 }), store)
  const results = await Promise.all([add(), add()])
  const r = (await results[0].json()) as CartReceipt
  assert.equal(r.quote.totalCents, 85700)
  assert.equal(r.items.length, 2)
  assert.equal(r.items[0].properties._production_pdf, 'https://studio.example' + record.pdfUrl)
  assert.deepEqual(await results[1].json(), r)
  assert.deepEqual(await (await add()).json(), r)
  assert.equal(
    (await api(post('/api/cart', { configurationId: crypto.randomUUID(), requestId }), store))
      .status,
    404,
  )
})
test('binary artwork is content-addressed and retrievable with its image content type', async () => {
  const store = memoryStore(),
    bytes = new Uint8Array(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2V0AAAAASUVORK5CYII=',
        'base64',
      ),
    )
  const input = () =>
    new Request('https://studio.example/api/assets', { method: 'POST', body: bytes })
  const first = await (await api(input(), store)).json(),
    second = await (await api(input(), store)).json()
  assert.equal(first.id, second.id)
  const restore = await api(new Request('https://studio.example/api/assets/' + first.id), store)
  assert.equal(restore.headers.get('content-type'), 'image/png')
  assert.deepEqual(new Uint8Array(await restore.arrayBuffer()), bytes)
})
