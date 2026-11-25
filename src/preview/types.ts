import type { Configuration, Side } from '../../shared/config'
export interface PreviewEngine {
  update(config: Configuration): Promise<void>
  side(side: Side): void
  zoom(factor: number): void
  fit(): void
  snapshot(): string
  dispose(): void
}
export function canvasSnapshot(input: HTMLCanvasElement): string {
  const c = document.createElement('canvas')
  const ratio = Math.min(1, 1100 / Math.max(input.width, input.height))
  c.width = Math.max(2, Math.round(input.width * ratio))
  c.height = Math.max(2, Math.round(input.height * ratio))
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#f3f3ed'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(input, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.87)
}
