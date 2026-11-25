import { z } from 'zod'
import { panelSchema, type Panel, type PrintSurface } from './artwork'
export { layerName, type Panel, type Layer } from './artwork'

export const canopyProduct = {
  id: 'fw-canopy-10',
  name: '10 × 10 Canopy Tent',
  sku: 'FW-C10',
  size: '10 × 10 ft',
  modelUrl: '/models/canopy-10.glb',
} as const

export const sides = ['front', 'right', 'back', 'left'] as const
export type Side = (typeof sides)[number]
export type SurfaceKind = 'roof' | 'valance' | 'wall' | 'half'
export const frameIds = ['standard', 'fabric', 'light'] as const
export const fullIds = ['none', 'one-single', 'three-single', 'one-double', 'three-double'] as const
export const halfIds = ['none', 'pair-single', 'pair-double'] as const
export const optionsSchema = z.object({
  frame: z.enum(frameIds),
  full: z.enum(fullIds),
  half: z.enum(halfIds),
})
export type Options = z.infer<typeof optionsSchema>
export const configSchema = z.object({
  version: z.literal(1),
  productId: z.literal(canopyProduct.id),
  quantity: z.number().int().min(1).max(25),
  options: optionsSchema,
  panels: z.record(
    z.string().regex(/^(roof|valance|wall|half)-(front|right|back|left)(-inside)?$/),
    panelSchema,
  ),
})
export type Configuration = z.infer<typeof configSchema>
export interface Surface extends PrintSurface {
  side: Side
  kind: SurfaceKind
  inside: boolean
}
export const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
export const surfaceNames: Record<SurfaceKind, string> = {
  roof: 'Roof',
  valance: 'Valance',
  wall: 'Full wall',
  half: 'Half wall',
}
const ratios: Record<SurfaceKind, number> = {
  roof: 0.605,
  valance: 0.118,
  wall: 0.615,
  half: 0.294,
}
function surface(side: Side, kind: SurfaceKind, inside = false): Surface {
  return {
    id: kind + '-' + side + (inside ? '-inside' : ''),
    side,
    kind,
    inside,
    label: titleCase(side) + ' ' + surfaceNames[kind].toLowerCase() + (inside ? ' · inside' : ''),
    heightRatio: ratios[kind],
    triangular: kind === 'roof',
  }
}
export function activeSurfaces(options: Options): Surface[] {
  const result: Surface[] = []
  for (const side of sides) {
    result.push(surface(side, 'roof'), surface(side, 'valance'))
    const hasFull =
      side === 'back'
        ? options.full !== 'none'
        : side !== 'front' && options.full.startsWith('three')
    const hasHalf = (side === 'left' || side === 'right') && options.half !== 'none'
    for (const [kind, present, double] of [
      ['wall', hasFull, options.full.endsWith('double')],
      ['half', hasHalf, options.half.endsWith('double')],
    ] as const) {
      if (present) {
        result.push(surface(side, kind))
        if (double) result.push(surface(side, kind, true))
      }
    }
  }
  return result
}
export const palette = [
  { name: 'Pine', color: '#315846' },
  { name: 'Midnight', color: '#24374C' },
  { name: 'Terracotta', color: '#B86245' },
  { name: 'Ochre', color: '#CA9A4D' },
  { name: 'Sand', color: '#D5C5AA' },
  { name: 'Chalk', color: '#F1EFE7' },
]
export const colorName = (color: string) =>
  palette.find((p) => p.color.toLowerCase() === color.toLowerCase())?.name ?? 'Custom'
export const defaultPanel = (): Panel => ({ color: palette[0].color, layers: [] })
export function panelFor(config: Configuration, id: string): Panel {
  return config.panels[id] ?? defaultPanel()
}
export function newConfiguration(): Configuration {
  const config: Configuration = {
    version: 1,
    productId: canopyProduct.id,
    quantity: 1,
    options: { frame: 'standard', full: 'none', half: 'none' },
    panels: {},
  }
  for (const s of activeSurfaces(config.options)) {
    const roof = s.kind === 'roof'
    const primary = s.side === 'front' || s.side === 'back'
    const style = roof ? (primary ? 'lockup' : 'peaks') : 'wordmark'
    config.panels[s.id] = {
      color: palette[0].color,
      layers: [
        {
          type: 'mark',
          id: 'ridgeline',
          style,
          ink: '#F6F0DE',
          x: 0.5,
          y: roof ? 0.69 : 0.51,
          width: roof ? (primary ? 0.41 : 0.225) : 0.32,
          rotation: 0,
        },
      ],
    }
  }
  return config
}
export const money = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
