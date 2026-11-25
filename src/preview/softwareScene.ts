import { activeSurfaces, sides, panelFor, type Configuration, type Side } from '../../shared/config'
import { panelCanvas } from '../art/painter'
import { canvasSnapshot, type PreviewEngine } from './types'
type V = [number, number, number]
type P = [number, number]
// An orthographic print proof for devices which cannot allocate a WebGL context.
export function makeSoftwareScene(host: HTMLDivElement): PreviewEngine {
  const canvas = document.createElement('canvas'),
    ctx = canvas.getContext('2d')!
  host.append(canvas)
  let yaw = 0.48,
    pitch = 0.24,
    scale = 1,
    side: Side = 'front',
    config: Configuration | undefined,
    revision = 0,
    disposed = false
  let textures = new Map<string, HTMLCanvasElement>()
  const project = (v: V): P => {
    const depth = v[0] * Math.sin(yaw) + v[2] * Math.cos(yaw)
    const unit = Math.min(canvas.width / 4.95, canvas.height / 4.26) * scale
    return [
      canvas.width / 2 + unit * (v[0] * Math.cos(yaw) - v[2] * Math.sin(yaw)),
      canvas.height / 2 - unit * ((v[1] - 1.6) * Math.cos(pitch) - depth * Math.sin(pitch)),
    ]
  }
  function patch(img: HTMLCanvasElement, src: P[], dest: V[], shade: number) {
    const ps = dest.map(project),
      [a, b, c] = src,
      [p, q, r] = ps
    const u = b[0] - a[0],
      v = b[1] - a[1],
      u2 = c[0] - a[0],
      v2 = c[1] - a[1],
      det = u * v2 - u2 * v
    if (Math.abs(det) < 0.001) return
    const xx = ((q[0] - p[0]) * v2 - (r[0] - p[0]) * v) / det,
      xy = ((r[0] - p[0]) * u - (q[0] - p[0]) * u2) / det
    const yx = ((q[1] - p[1]) * v2 - (r[1] - p[1]) * v) / det,
      yy = ((r[1] - p[1]) * u - (q[1] - p[1]) * u2) / det
    ctx.save()
    ctx.beginPath()
    ps.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.closePath()
    ctx.clip()
    ctx.transform(xx, yx, xy, yy, p[0] - xx * a[0] - xy * a[1], p[1] - yx * a[0] - yy * a[1])
    ctx.drawImage(img, 0, 0)
    if (shade > 0) {
      ctx.fillStyle = 'rgba(0,0,0,' + shade + ')'
      ctx.fillRect(0, 0, img.width, img.height)
    }
    ctx.restore()
  }
  function draw() {
    if (!config || disposed) return
    const ratio = Math.min(devicePixelRatio || 1, 1.7)
    const w = Math.max(2, Math.round(host.clientWidth * ratio)),
      h = Math.max(2, Math.round(host.clientHeight * ratio))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    ctx.clearRect(0, 0, w, h)
    const base = project([0, 0, 0])
    ctx.save()
    ctx.translate(...base)
    ctx.scale(1, 0.23)
    const radius = w * 0.3 * scale,
      shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius)
    shadow.addColorStop(0, 'rgba(43,51,39,.20)')
    shadow.addColorStop(1, 'rgba(43,51,39,0)')
    ctx.fillStyle = shadow
    ctx.fillRect(-radius, -radius, 2 * radius, 2 * radius)
    ctx.restore()
    const depth = (p: V) => p[0] * Math.sin(yaw) + p[2] * Math.cos(yaw)
    const order = sides
      .map((s, i) => ({ s, i, facing: Math.cos(yaw - (i * Math.PI) / 2) }))
      .sort((a, b) => a.facing - b.facing)
    function point(i: number, u: number, y: number, r: number): V {
      const angle = (i * Math.PI) / 2
      return [
        u * Math.cos(angle) + r * Math.sin(angle),
        y,
        -u * Math.sin(angle) + r * Math.cos(angle),
      ]
    }
    const line = (a: V, b: V, color: string, width: number) => {
      ctx.beginPath()
      ctx.moveTo(...project(a))
      ctx.lineTo(...project(b))
      ctx.lineWidth = width * ratio * scale
      ctx.strokeStyle = color
      ctx.stroke()
    }
    function face(
      id: string,
      i: number,
      r: number,
      bottom: number,
      top: number,
      shade: number,
      inside = false,
    ) {
      const img = textures.get(id)
      if (!img) return
      const a = point(i, inside ? 1.52 : -1.52, top, r),
        b = point(i, inside ? -1.52 : 1.52, top, r),
        c = point(i, inside ? -1.52 : 1.52, bottom, r),
        d = point(i, inside ? 1.52 : -1.52, bottom, r)
      patch(
        img,
        [
          [0, 0],
          [img.width, 0],
          [img.width, img.height],
        ],
        [a, b, c],
        shade,
      )
      patch(
        img,
        [
          [0, 0],
          [img.width, img.height],
          [0, img.height],
        ],
        [a, c, d],
        shade,
      )
    }
    const surfaces = activeSurfaces(config.options)
    function walls(front: boolean) {
      for (const { s, i, facing } of order) {
        if (facing >= 0 !== front) continue
        for (const kind of ['wall', 'half']) {
          const id = kind + '-' + s
          if (!surfaces.some((v) => v.id === id)) continue
          if (facing < 0 && !textures.has(id + '-inside')) {
            const r = kind === 'wall' ? 1.46 : 1.52,
              t = kind === 'wall' ? 1.9 : 0.94
            const points = [
              point(i, -1.52, t, r),
              point(i, 1.52, t, r),
              point(i, 1.52, 0.04, r),
              point(i, -1.52, 0.04, r),
            ]
            ctx.beginPath()
            points.map(project).forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
            ctx.closePath()
            ctx.fillStyle = '#c2c4b6'
            ctx.fill()
          } else
            face(
              id + (facing < 0 ? '-inside' : ''),
              i,
              kind === 'wall' ? 1.46 : 1.52,
              0.035,
              kind === 'wall' ? 1.9 : 0.94,
              0.1,
              facing < 0,
            )
        }
      }
    }
    walls(false)
    if (config.options.frame !== 'fabric') {
      const legs: V[] = [
        [-1.46, 0, -1.46],
        [1.46, 0, -1.46],
        [-1.46, 0, 1.46],
        [1.46, 0, 1.46],
      ]
      for (const p of legs.sort((a, b) => depth(a) - depth(b))) {
        line(p, [p[0], 2.16, p[2]], '#707773', 5)
        line(p, [p[0], 1.03, p[2]], '#b6bbb5', 2.8)
        line([p[0] - 0.035, 0.017, p[2]], [p[0] + 0.035, 0.017, p[2]], '#464d47', 3.0)
      }
      for (const { i } of order)
        for (let j = 0; j < 4; j++) {
          const a = -1.46 + j * 0.73
          line(point(i, a, 1.75, 1.46), point(i, a + 0.73, 2.18, 1.46), '#848c84', 2.6)
          line(point(i, a, 2.18, 1.46), point(i, a + 0.73, 1.75, 1.46), '#949c94', 2.6)
        }
    }
    walls(true)
    for (const { s, i, facing } of order) {
      if (facing >= 0) face('valance-' + s, i, 1.524, 1.9, 2.26, 0.12 + (0.08 * i) / 4)
      const img = textures.get('roof-' + s)
      if (!img) continue
      const coords = (u: number, v: number): V =>
        point(i, (u - 0.5) * 3.048, 3.3 - 1.04 * v - 0.2 * Math.sin(Math.PI * v), v * 1.524)
      const left = (v: number): P => [(1 - v) * 0.5, v],
        right = (v: number): P => [(1 + v) * 0.5, v]
      for (let j = 0; j < 6; j++) {
        const v0 = j / 6,
          v1 = (j + 1) / 6,
          a = left(v0),
          b = right(v0),
          c = right(v1),
          d = left(v1)
        for (const triangle of [
          [a, b, c],
          [a, c, d],
        ]) {
          const uvs = triangle.map(([x, y]): P => [x * img.width, y * img.height])
          patch(
            img,
            uvs,
            triangle.map(([x, y]) => coords(x, y)),
            Math.max(0, 0.07 - 0.09 * Math.cos((i * Math.PI) / 2) + 0.035 * v1),
          )
        }
      }
    }
  }
  let drag: { x: number; y: number } | null = null
  const down = (e: PointerEvent) => {
    drag = { x: e.clientX, y: e.clientY }
    canvas.setPointerCapture(e.pointerId)
  }
  const move = (e: PointerEvent) => {
    if (!drag) return
    yaw -= (e.clientX - drag.x) * 0.009
    pitch = Math.max(0.05, Math.min(1.1, pitch + (e.clientY - drag.y) * 0.007))
    drag = { x: e.clientX, y: e.clientY }
    draw()
  }
  const end = () => {
    drag = null
  }
  const zoom = (n: number) => {
    scale = Math.min(2.4, Math.max(0.68, scale * n))
    draw()
  }
  const wheel = (e: WheelEvent) => {
    e.preventDefault()
    zoom(e.deltaY < 0 ? 1.07 : 1 / 1.07)
  }
  canvas.addEventListener('pointerdown', down)
  canvas.addEventListener('pointermove', move)
  canvas.addEventListener('lostpointercapture', end)
  canvas.addEventListener('wheel', wheel, { passive: false })
  const observer = new ResizeObserver(draw)
  observer.observe(host)
  return {
    async update(c) {
      const v = ++revision
      const maps = await Promise.all(
        activeSurfaces(c.options).map(
          async (s) => [s.id, await panelCanvas(s, panelFor(c, s.id))] as const,
        ),
      )
      if (disposed || v !== revision) return
      config = c
      textures = new Map(maps)
      draw()
    },
    side(s) {
      side = s
      yaw = (sides.indexOf(s) * Math.PI) / 2 + 0.48
      draw()
    },
    zoom,
    fit() {
      scale = 1
      pitch = 0.24
      yaw = (sides.indexOf(side) * Math.PI) / 2 + 0.48
      draw()
    },
    snapshot() {
      const saved = { yaw, pitch, scale }
      yaw = .48
      pitch = .24
      scale = 1
      draw()
      const jpeg = canvasSnapshot(canvas)
      yaw = saved.yaw
      pitch = saved.pitch
      scale = saved.scale
      draw()
      return jpeg
    },
    dispose() {
      disposed = true
      observer.disconnect()
      canvas.remove()
    },
  }
}
