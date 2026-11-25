import { type Layer, type Panel, type PrintSurface as Surface } from '../../shared/artwork'

const assets = new Map<string, Promise<CanvasImageSource>>()
function loadImage(id: string) {
  let pending = assets.get(id)
  if (!pending) {
    pending = (async () => {
      const res = await fetch('/api/assets/' + id)
      if (!res.ok) throw new Error('Artwork could not be loaded. Reconnect and try again.')
      const url = URL.createObjectURL(await res.blob())
      try {
        const img = new Image()
        img.src = url
        await img.decode()
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height))
        if (scale === 1) return img
        const reduced = document.createElement('canvas')
        reduced.width = Math.max(1, Math.round(img.width * scale))
        reduced.height = Math.max(1, Math.round(img.height * scale))
        reduced.getContext('2d')!.drawImage(img, 0, 0, reduced.width, reduced.height)
        return reduced
      } finally {
        URL.revokeObjectURL(url)
      }
    })()
    assets.set(id, pending)
    pending.catch(() => assets.delete(id))
    if (assets.size > 40) assets.delete(assets.keys().next().value!)
  }
  return pending
}
let fonts: Promise<unknown> | undefined
function readyFonts() {
  fonts ??= Promise.all([
    document.fonts.load('800 32px "Barlow Condensed"'),
    document.fonts.load('700 18px "Manrope Variable"'),
  ])
  return fonts
}
const family = (l: Extract<Layer, { type: 'text' }>) =>
  l.font === 'Sans'
    ? '"Manrope Variable", Arial, sans-serif'
    : l.font === 'Serif'
      ? 'Georgia, serif'
      : 'monospace'
function textAspect(l: Extract<Layer, { type: 'text' }>, ctx: CanvasRenderingContext2D) {
  ctx.font = '700 100px ' + family(l)
  return Math.max(0.25, ctx.measureText(l.text).width / 106)
}
export function layerAspect(l: Layer, ctx: CanvasRenderingContext2D) {
  return l.type === 'image'
    ? l.aspect
    : l.type === 'text'
      ? textAspect(l, ctx)
      : l.style === 'lockup'
        ? 2.12
        : l.style === 'peaks'
          ? 2.32
          : 12.0
}
function peaks(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(w / 100, h / 43)
  const ridge = [
    [0, 42],
    [30, 4],
    [46, 24],
    [63, 0],
    [100, 42],
    [89, 42],
    [63, 13],
    [46, 37],
    [30, 17],
    [10, 42],
  ]
  ctx.beginPath()
  ridge.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)))
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.arc(87, 10, 5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
function fittedType(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  font: string,
  tracking = 0,
) {
  ctx.save()
  ctx.font = font
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  const letters = Array.from(text)
  const measured =
    letters.reduce((n, c) => n + ctx.measureText(c).width, 0) +
    Math.max(0, letters.length - 1) * tracking
  ctx.translate(x - width / 2, y)
  ctx.scale(width / Math.max(1, measured), 1)
  let offset = 0
  for (const c of letters) {
    ctx.fillText(c, offset, 0)
    offset += ctx.measureText(c).width + tracking
  }
  ctx.restore()
}
function drawMark(
  ctx: CanvasRenderingContext2D,
  l: Extract<Layer, { type: 'mark' }>,
  w: number,
  h: number,
) {
  ctx.fillStyle = l.ink
  if (l.style === 'peaks') {
    peaks(ctx, -w / 2, -h / 2, w, h)
    return
  }
  if (l.style === 'wordmark') {
    fittedType(
      ctx,
      'RIDGELINE OUTDOOR SUPPLY',
      0,
      0,
      w,
      '800 ' + h * 0.74 + 'px "Barlow Condensed", sans-serif',
      h * 0.095,
    )
    return
  }
  peaks(ctx, -w * 0.24, -h / 2, w * 0.48, h * 0.37)
  fittedType(
    ctx,
    'RIDGELINE',
    0,
    h * 0.12,
    w,
    '800 ' + h * 0.59 + 'px "Barlow Condensed", Impact, sans-serif',
    h * 0.002,
  )
  fittedType(
    ctx,
    'OUTDOOR SUPPLY',
    0,
    h * 0.46,
    w * 0.68,
    '700 ' + h * 0.135 + 'px "Manrope Variable", sans-serif',
    h * 0.029,
  )
}
export function panelPath(ctx: CanvasRenderingContext2D, surface: Surface, w: number, h: number) {
  ctx.beginPath()
  if (surface.triangular) {
    ctx.moveTo(w / 2, 0)
    ctx.lineTo(w, h)
    ctx.lineTo(0, h)
    ctx.closePath()
  } else ctx.rect(0, 0, w, h)
}
const canvasCache = new WeakMap<Panel, Map<string, Promise<HTMLCanvasElement>>>()
export function panelCanvas(
  surface: Surface,
  panel: Panel,
  width = 1024,
): Promise<HTMLCanvasElement> {
  let variants = canvasCache.get(panel)
  if (!variants) {
    variants = new Map()
    canvasCache.set(panel, variants)
  }
  const key = surface.heightRatio + '/' + width
  let result = variants.get(key)
  if (!result) {
    result = (async () => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = Math.max(1, Math.round(width * surface.heightRatio))
      const ctx = canvas.getContext('2d')!
      await readyFonts()
      const images = await Promise.all(
        panel.layers.map((l) => (l.type === 'image' ? loadImage(l.assetId) : null)),
      )
      ctx.fillStyle = panel.color
      ctx.fillRect(0, 0, width, canvas.height)
      for (const [i, l] of panel.layers.entries()) {
        ctx.save()
        ctx.translate(l.x * width, l.y * canvas.height)
        ctx.rotate((l.rotation * Math.PI) / 180)
        const w = l.width * width,
          h = w / layerAspect(l, ctx)
        if (l.type === 'mark') drawMark(ctx, l, w, h)
        if (l.type === 'text') {
          ctx.fillStyle = l.ink
          ctx.textBaseline = 'middle'
          ctx.textAlign = 'center'
          const fontSize = (100 * w) / Math.max(1, ctx.measureText(l.text).width)
          ctx.font = '700 ' + fontSize + 'px ' + family(l)
          ctx.fillText(l.text, 0, 0, w)
        }
        if (l.type === 'image') ctx.drawImage(images[i]!, -w / 2, -h / 2, w, h)
        ctx.restore()
      }
      return canvas
    })()
    variants.set(key, result)
    result.catch(() => variants!.delete(key))
  }
  return result
}
export async function panelJpeg(s: Surface, p: Panel) {
  const src = await panelCanvas(s, p, 900)
  const c = document.createElement('canvas')
  c.width = src.width + 24
  c.height = src.height + 24
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#f5f5f0'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.translate(12, 12)
  panelPath(ctx, s, src.width, src.height)
  ctx.clip()
  ctx.drawImage(src, 0, 0)
  return c.toDataURL('image/jpeg', 0.86)
}
