import { expect, test } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { ProductionRecord } from '../../shared/contracts'

test('edit independent surfaces, quote, persist, export and add the same proof to cart', async ({
  page,
  request,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  const add = page.getByRole('button', { name: 'Add to cart', exact: true })
  await expect(add).toBeEnabled()
  await expect(page.locator('.scene-host')).toHaveAttribute('data-renderer', 'webgl')
  await expect(page.getByTestId('estimate')).toContainText('$849.00')
  const stage = page.locator('.scene-host canvas')
  const before = await stage.screenshot()
  await page.getByRole('button', { name: 'Fabric color Terracotta' }).click()
  await expect.poll(async () => Buffer.compare(before, await stage.screenshot())).not.toBe(0)
  await page.getByRole('button', { name: 'Add text', exact: true }).click()
  await page.getByLabel('Text content').fill('TRAIL CREW')
  await page.getByLabel('X position', { exact: true }).fill('51')
  await page.getByLabel('Y position', { exact: true }).fill('91')
  const width = page.getByRole('slider', { name: 'Width', exact: true })
  await width.press('Home')
  for (let i = 4; i < 24; i++) await width.press('ArrowRight')
  const rotation = page.getByRole('slider', { name: 'Rotation', exact: true })
  for (let i = 0; i < 5; i++) await rotation.press('ArrowRight')
  const target = page.getByRole('button', { name: 'Move TRAIL CREW' })
  const box = await target.boundingBox()
  if (!box) throw new Error('Flat editor did not expose the artwork')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 15, box.y + box.height / 2 - 4, { steps: 3 })
  await page.mouse.up()
  await expect(page.getByLabel('X position', { exact: true })).not.toHaveValue('51')
  await expect(page.getByTestId('estimate')).toContainText('$857.00')
  await page.getByLabel('Print section').selectOption('valance-right')
  await expect(page.getByRole('button', { name: 'Fabric color Pine' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  const bytes = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 240
    canvas.height = 60
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ebd7ab'
    ctx.beginPath()
    ctx.moveTo(8, 52)
    ctx.lineTo(32, 7)
    ctx.lineTo(55, 52)
    ctx.closePath()
    ctx.fill()
    ctx.font = 'bold 24px sans-serif'
    ctx.fillText('TRAIL CO.', 68, 39)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await page
    .getByLabel('Upload artwork file')
    .setInputFiles({
      name: 'trail-co.png',
      mimeType: 'image/png',
      buffer: Buffer.from(bytes, 'base64'),
    })
  await expect(page.getByRole('button', { name: 'Move trail-co.png' })).toBeVisible()
  await page.getByLabel('X position', { exact: true }).fill('23')
  await width.press('Home')
  for (let i = 4; i < 22; i++) await width.press('ArrowRight')
  await expect(page.getByTestId('estimate')).toContainText('$875.00')
  await page.getByRole('button', { name: 'Build options', exact: true }).click()
  await page.getByLabel('Frame package', { exact: true }).selectOption('light')
  await page.getByLabel('Full walls', { exact: true }).selectOption('one-double')
  await page.getByLabel('Half walls', { exact: true }).selectOption('pair-single')
  await page.getByRole('button', { name: 'Increase quantity' }).click()
  await expect(page.getByTestId('estimate')).toContainText('$3,006.00')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByTestId('estimate')).toContainText('$1,503.00')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(page.getByTestId('estimate')).toContainText('$3,006.00')
  await page.reload()
  await expect(page.getByTestId('estimate')).toContainText('$3,006.00')
  await expect(add).toBeEnabled()
  await page.getByRole('button', { name: 'Breakdown', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Custom text placements')
  await page.getByRole('button', { name: 'Close dialog' }).click()
  const proofResponse = page.waitForResponse(
    (r) => r.url().endsWith('/api/configurations') && r.request().method() === 'POST',
  )
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export PDF' }).click()
  const proof = await (await proofResponse).json()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toContain(proof.id)
  const pdfRes = await request.get(proof.pdfUrl)
  expect(pdfRes.status()).toBe(200)
  const bytesPdf = await pdfRes.body()
  const pdf = await PDFDocument.load(bytesPdf)
  expect(pdf.getPageCount()).toBeGreaterThan(2)
  const record = (await (await request.get(proof.configUrl)).json()) as ProductionRecord
  expect(record.configuration.panels['roof-front'].color).toBe('#B86245')
  expect(record.configuration.panels['roof-right'].color).toBe('#315846')
  expect(record.configuration.panels['valance-right'].layers.at(-1)?.type).toBe('image')
  const text = record.configuration.panels['roof-front'].layers.at(-1)!
  expect(text.type).toBe('text')
  expect(text.x).toBeGreaterThan(0.51)
  expect(text.rotation).toBe(5)
  if (process.env.STUDIO_QA_DIR) {
    await mkdir(process.env.STUDIO_QA_DIR, { recursive: true })
    await writeFile(join(process.env.STUDIO_QA_DIR, 'sample-proof.pdf'), bytesPdf)
  }
  await add.click()
  const cart = page.getByRole('dialog')
  await expect(cart).toContainText('Your demo cart')
  await expect(cart).toContainText('$3,006.00')
  await expect(cart.getByRole('link', { name: 'Production PDF' })).toHaveAttribute(
    'href',
    proof.pdfUrl,
  )
  await cart.getByText('Shopify cart payload').click()
  await expect(cart.locator('pre')).toContainText('_component_sku')
  expect(errors).toEqual([])
})
test('software preview, mobile layout and cross-origin iframe cart handoff work without WebGL', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      kind: string,
      ...args: unknown[]
    ) {
      if (kind.startsWith('webgl')) return null
      return Reflect.apply(original, this, [kind, ...args])
    } as typeof original
  })
  const hostResponse = await request.get('/embed-demo.html')
  const studioOrigin = new URL(hostResponse.url()).origin
  const hostHtml = await hostResponse.text()
  const host = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(
      hostHtml.replace('id="studio"', 'id="studio" data-studio-origin="' + studioOrigin + '"'),
    )
  })
  await new Promise<void>((resolve) => host.listen(0, '127.0.0.1', resolve))
  try {
    await page.goto('http://127.0.0.1:' + (host.address() as AddressInfo).port + '/')
    const studio = page.frameLocator('#studio')
    await expect(studio.locator('.scene-host')).toHaveAttribute('data-renderer', 'software')
    await expect(studio.getByRole('button', { name: 'Add to cart', exact: true })).toBeEnabled()
    const overflow = await studio
      .locator('body')
      .evaluate((b) => b.scrollWidth > document.documentElement.clientWidth)
    expect(overflow).toBe(false)
    await studio.getByRole('button', { name: 'Select back side' }).click()
    await studio.getByLabel('Print section').selectOption('valance-back')
    await studio.getByRole('button', { name: 'Fabric color Ochre' }).click()
    await studio.getByRole('button', { name: 'Add to cart', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Host received 1 Shopify line item(s)')
    await expect(page.locator('#receipt a')).toHaveAttribute('href', /production\.pdf$/)
  } finally {
    host.closeAllConnections()
    host.close()
  }
})
