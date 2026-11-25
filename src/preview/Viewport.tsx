import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { Configuration, Side } from '../../shared/config'
import type { PreviewEngine } from './types'
export function Viewport({
  config,
  side,
  engine,
  onPick,
  ready,
}: {
  config: Configuration
  side: Side
  engine: MutableRefObject<PreviewEngine | null>
  onPick: (id: string) => void
  ready: (state: boolean) => void
}) {
  const host = useRef<HTMLDivElement>(null),
    current = useRef(config),
    pick = useRef(onPick),
    currentSide = useRef(side)
  current.current = config
  pick.current = onPick
  currentSide.current = side
  const [software, setSoftware] = useState(false),
    [error, setError] = useState('')
  useEffect(() => {
    let alive = true,
      instance: PreviewEngine | undefined
    ready(false)
    setError('')
    ;(async () => {
      const el = host.current!
      instance = software
        ? (await import('./softwareScene')).makeSoftwareScene(el)
        : await (
            await import('./threeScene')
          ).makeThreeScene(
            el,
            (id) => pick.current(id),
            () => setSoftware(true),
          )
      if (!alive) {
        instance.dispose()
        return
      }
      engine.current = instance
      instance.side(currentSide.current)
      await instance.update(current.current)
      if (alive) ready(true)
    })().catch((e) => {
      if (alive) {
        if (!software && !instance) setSoftware(true)
        else setError(e instanceof Error ? e.message : 'Preview unavailable.')
      }
    })
    return () => {
      alive = false
      if (engine.current === instance) engine.current = null
      instance?.dispose()
    }
  }, [software])
  useEffect(() => {
    let active = true
    engine.current
      ?.update(config)
      .then(() => {
        if (active) { setError(''); ready(true) }
      })
      .catch((e: Error) => {
        if (active) { setError(e.message); ready(false) }
      })
    return () => { active = false }
  }, [config])
  useEffect(() => {
    engine.current?.side(side)
  }, [side])
  return (
    <>
      <div
        className="scene-host"
        ref={host}
        role="img"
        aria-label="Interactive three-dimensional canopy preview"
        data-renderer={software ? 'software' : 'webgl'}
      />
      {error && (
        <p className="preview-error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}
