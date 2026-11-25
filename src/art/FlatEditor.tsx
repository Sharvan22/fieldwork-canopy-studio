import { useEffect, useRef, useState } from 'react'
import {
  layerName,
  type Layer,
  type Panel,
  type PrintSurface as Surface,
} from '../../shared/artwork'
import { layerAspect, panelCanvas } from './painter'

export function PanelArt({
  surface,
  panel,
  width = 300,
}: {
  surface: Surface
  panel: Panel
  width?: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let active = true
    panelCanvas(surface, panel, width)
      .then((image) => {
        if (!active || !ref.current) return
        ref.current.width = image.width
        ref.current.height = image.height
        ref.current.getContext('2d')!.drawImage(image, 0, 0)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [surface.id, panel, width])
  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={'panel-art ' + (surface.triangular ? 'triangle' : '')}
      style={{ background: panel.color, aspectRatio: String(1 / surface.heightRatio) }}
    />
  )
}
interface Props {
  surface: Surface
  panel: Panel
  selected: string | null
  select: (id: string | null) => void
  move: (id: string, x: number, y: number) => void
  begin: () => void
  end: () => void
  zoom: number
}
export function FlatEditor({ surface, panel, selected, select, move, begin, end, zoom }: Props) {
  const area = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: string; x: number; y: number; px: number; py: number }>()
  const [ctx] = useState(() => document.createElement('canvas').getContext('2d')!)
  const clamp = (n: number) => Math.max(0, Math.min(1, n))
  const box = (l: Layer) => ({
    left: 100 * l.x + '%',
    top: 100 * l.y + '%',
    width: 100 * l.width + '%',
    height: (100 * l.width) / layerAspect(l, ctx) / surface.heightRatio + '%',
    transform: 'translate(-50%,-50%) rotate(' + l.rotation + 'deg)',
  })
  return (
    <div className="flat-editor" onPointerDown={() => select(null)}>
      <div
        className="flat-board"
        ref={area}
        style={{ aspectRatio: 1 / surface.heightRatio, transform: 'scale(' + zoom + ')' }}
      >
        <PanelArt surface={surface} panel={panel} width={1024} />
        {panel.layers.map((l) => (
          <button
            key={l.id}
            className={'layer-target ' + (selected === l.id ? 'selected' : '')}
            aria-label={'Move ' + layerName(l)}
            style={box(l)}
            onPointerDown={(e) => {
              e.stopPropagation()
              select(l.id)
              begin()
              drag.current = { id: l.id, x: l.x, y: l.y, px: e.clientX, py: e.clientY }
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
              const d = drag.current,
                r = area.current?.getBoundingClientRect()
              if (d?.id === l.id && r)
                move(
                  l.id,
                  clamp(d.x + (e.clientX - d.px) / r.width),
                  clamp(d.y + (e.clientY - d.py) / r.height),
                )
            }}
            onLostPointerCapture={() => {
              drag.current = undefined
              end()
            }}
            onKeyDown={(e) => {
              const k = e.key
              if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) return
              e.preventDefault()
              move(
                l.id,
                clamp(l.x + (k === 'ArrowLeft' ? -0.01 : k === 'ArrowRight' ? 0.01 : 0)),
                clamp(l.y + (k === 'ArrowUp' ? -0.01 : k === 'ArrowDown' ? 0.01 : 0)),
              )
            }}
          >
            {selected === l.id && (
              <>
                <i />
                <i />
                <i />
                <i />
              </>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
