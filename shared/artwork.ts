import { z } from 'zod'

/** The flat editor, texture compositor and proof exporter share this product-neutral contract. */
export interface PrintSurface {
  id: string
  label: string
  heightRatio: number
  triangular: boolean
}
export const hex = z.string().regex(/^#[0-9a-f]{6}$/i)
const position = {
  id: z.string().min(1).max(64),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.04).max(1),
  rotation: z.number().min(-180).max(180),
}
export const layerSchema = z.discriminatedUnion('type', [
  z.object({
    ...position,
    type: z.literal('mark'),
    style: z.enum(['lockup', 'peaks', 'wordmark']),
    ink: hex,
  }),
  z.object({
    ...position,
    type: z.literal('text'),
    text: z.string().min(1).max(80),
    font: z.enum(['Sans', 'Serif', 'Mono']),
    ink: hex,
  }),
  z.object({
    ...position,
    type: z.literal('image'),
    assetId: z.string().regex(/^[a-f0-9]{64}$/),
    name: z.string().min(1).max(140),
    aspect: z.number().min(0.025).max(40),
  }),
])
export type Layer = z.infer<typeof layerSchema>
export const panelSchema = z.object({
  color: hex,
  layers: z
    .array(layerSchema)
    .max(10)
    .refine(
      (layers) => new Set(layers.map((l) => l.id)).size === layers.length,
      'Layer IDs must be unique',
    ),
})
export type Panel = z.infer<typeof panelSchema>
export function layerName(l: Layer): string {
  if (l.type === 'image') return l.name
  if (l.type === 'text') return l.text
  return l.style === 'lockup'
    ? 'Ridgeline emblem'
    : l.style === 'peaks'
      ? 'Ridgeline peaks'
      : 'Ridgeline wordmark'
}
