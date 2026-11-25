import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib'
import { activeSurfaces, panelFor, layerName, money } from '../shared/config'
import type { Catalog, Preview, ProductionRecord } from '../shared/contracts'

const ink = rgb(0.1, 0.15, 0.12),
  faint = rgb(0.34, 0.39, 0.35),
  rule = rgb(0.82, 0.84, 0.8)
const accent = rgb(0.71, 0.27, 0.15),
  paper = rgb(0.96, 0.96, 0.93)
export async function productionPdf(
  record: ProductionRecord,
  hero: string,
  previews: Preview[],
  catalog: Catalog,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const body = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const mono = await pdf.embedFont(StandardFonts.Courier)
  pdf.setTitle('Fieldwork production proof ' + record.id)
  pdf.setSubject('Order configuration ' + record.id)
  pdf.setKeywords([catalog.product.sku, record.id, 'production proof', record.quote.revision])
  pdf.setAuthor('Fieldwork Design Studio')
  const charset = new Set(body.getCharacterSet())
  const safe = (value: string) =>
    Array.from(value)
      .map((c) => (charset.has(c.codePointAt(0)!) ? c : '?'))
      .join('')
  const line = (p: PDFPage, y: number) =>
    p.drawLine({ start: { x: 40, y }, end: { x: 572, y }, thickness: 0.65, color: rule })
  const label = (
    p: PDFPage,
    s: string,
    x: number,
    y: number,
    size = 10,
    font: PDFFont = body,
    color = ink,
  ) => p.drawText(safe(s), { x, y, size, font, color })
  function linesOf(s: string, width: number, size: number) {
    const lines: string[] = []
    let line = ''
    for (const char of safe(s)) {
      if (body.widthOfTextAtSize(line + char, size) > width && line) {
        lines.push(line)
        line = ''
      }
      line += char
    }
    lines.push(line)
    return lines
  }
  function page() {
    const p = pdf.addPage([612, 792])
    p.drawRectangle({ x: 40, y: 747, width: 5, height: 12, color: accent })
    label(p, 'FIELDWORK', 52, 748, 13, bold)
    label(p, 'DESIGN STUDIO  /  PRODUCTION', 386, 750, 8, mono, faint)
    line(p, 733)
    return p
  }
  async function image(p: PDFPage, data: string, x: number, y: number, w: number, h: number) {
    const img = await pdf.embedJpg(data)
    const scale = Math.min(w / img.width, h / img.height)
    p.drawImage(img, {
      x: x + (w - img.width * scale) / 2,
      y: y + (h - img.height * scale) / 2,
      width: img.width * scale,
      height: img.height * scale,
    })
  }
  const { configuration: config, quote } = record
  const cover = page()
  label(cover, 'Canopy production proof', 40, 688, 29, bold)
  label(
    cover,
    record.id + '   |   ' + record.createdAt.slice(0, 10) + ' UTC',
    41,
    665,
    10,
    mono,
    faint,
  )
  cover.drawRectangle({ x: 40, y: 426, width: 532, height: 220, color: paper })
  await image(cover, hero, 42, 430, 528, 212)
  label(cover, catalog.product.name, 40, 400, 18, bold)
  label(cover, catalog.product.sku + '  /  ' + catalog.product.size, 390, 402, 10, mono, faint)
  let cursor = 377
  for (const [key, caption] of [
    ['frame', 'Frame'],
    ['full', 'Full walls'],
    ['half', 'Half walls'],
  ] as const) {
    label(cover, caption, 40, cursor, 10, body, faint)
    label(
      cover,
      catalog[key].find((o) => o.id === config.options[key])!.label,
      141,
      cursor,
      10,
      bold,
    )
    cursor -= 18
  }
  label(cover, 'Order estimate', 40, 300, 15, bold)
  line(cover, 288)
  const right = (s: string, x: number, y: number, font = body, size = 10) =>
    label(cover, s, x - font.widthOfTextAtSize(s, size), y, size, font)
  label(cover, 'DESCRIPTION', 40, 273, 8, mono, faint)
  right('QTY', 376, 273, mono, 8)
  right('EACH', 470, 273, mono, 8)
  right('AMOUNT', 572, 273, mono, 8)
  cursor = 254
  for (const l of quote.lines) {
    label(cover, l.label, 40, cursor)
    right(String(l.count), 376, cursor)
    right(money(l.unitCents), 470, cursor)
    right(money(l.totalCents), 572, cursor)
    cursor -= 19
  }
  line(cover, cursor + 6)
  label(
    cover,
    'Total · ' + config.quantity + (config.quantity === 1 ? ' canopy' : ' canopies'),
    40,
    cursor - 16,
    13,
    bold,
  )
  right(money(quote.totalCents) + ' USD', 572, cursor - 16, bold, 14)
  label(cover, 'Demo pricing. Shipping and tax excluded.', 40, 72, 9, body, faint)
  let sheet: PDFPage,
    y = 0
  function panelPage() {
    sheet = page()
    label(sheet, 'Panel proofs', 40, 696, 24, bold)
    label(
      sheet,
      'Placement coordinates start at the upper left of each flat panel.',
      40,
      676,
      10,
      body,
      faint,
    )
    y = 648
  }
  panelPage()
  for (const surface of activeSurfaces(config.options)) {
    const panel = panelFor(config, surface.id)
    const detail = panel.layers.flatMap((l) => {
      const name =
        (l.type === 'image' ? 'Image' : l.type === 'mark' ? 'Studio artwork' : 'Text') +
        ' / ' +
        layerName(l)
      const coordinates =
        'X ' +
        Math.round(l.x * 100) +
        '%   Y ' +
        Math.round(l.y * 100) +
        '%   Width ' +
        Math.round(l.width * 100) +
        '%   Turn ' +
        l.rotation +
        '°'
      const inkOrAsset =
        l.type === 'image'
          ? 'Asset ' + l.assetId.slice(0, 20)
          : (l.type === 'text' ? l.font + '  /  ' : '') + l.ink.toUpperCase()
      return [
        ...linesOf(name, 307, 9.5).map((t) => ({ t, emph: true })),
        { t: coordinates, emph: false },
        { t: inkOrAsset, emph: false },
      ]
    })
    const height = Math.max(106, 55 + detail.length * 12)
    if (y - height < 60) panelPage()
    label(sheet!, surface.label, 40, y, 15, bold)
    label(sheet!, surface.id.toUpperCase(), 392, y + 1, 8, mono, faint)
    const preview = previews.find((p) => p.id === surface.id)!
    await image(sheet!, preview.jpeg, 42, y - 91, 174, 75)
    label(sheet!, 'Fabric ' + panel.color.toUpperCase(), 238, y - 20, 10, bold)
    let at = y - 38
    if (!detail.length) label(sheet!, 'Solid panel', 238, at, 9, body, faint)
    for (const d of detail) {
      if (at < 62) {
        panelPage()
        label(sheet!, surface.label + ' (continued)', 40, y, 13, bold)
        at = y - 22
      }
      label(sheet!, d.t, 238, at, d.emph ? 9.5 : 8.5, d.emph ? bold : body, d.emph ? ink : faint)
      at -= 12
    }
    y = Math.min(y - 100, at - 4)
    line(sheet!, y)
    y -= 24
  }
  pdf.getPages().forEach((p, i, all) => {
    line(p, 44)
    label(p, record.id + '   /   ' + catalog.product.sku, 40, 29, 8, mono, faint)
    label(p, String(i + 1) + ' / ' + all.length, 543, 29, 8, mono, faint)
  })
  await pdf.attach(new TextEncoder().encode(JSON.stringify(record, null, 2)), record.id + '.json', {
    mimeType: 'application/json',
    description: 'Canonical configuration, asset references and itemized quote',
  })
  return pdf.save()
}
