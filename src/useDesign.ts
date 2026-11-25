import { useCallback, useEffect, useRef, useState } from 'react'
import type { Configuration } from '../shared/config'
import { loadDraft, writeLocal } from './services'
export function useDesign() {
  const [config, setConfig] = useState(loadDraft)
  const current = useRef(config),
    past = useRef<Configuration[]>([]),
    future = useRef<Configuration[]>([])
  const group = useRef<'off' | 'first' | 'active'>('off')
  const [stored, setStored] = useState(true)
  const change = useCallback((fn: (c: Configuration) => Configuration) => {
    const before = current.current,
      after = fn(before)
    if (after === before) return
    if (group.current !== 'active') {
      past.current = [...past.current.slice(-39), before]
      future.current = []
    }
    if (group.current === 'first') group.current = 'active'
    current.current = after
    setConfig(after)
  }, [])
  const undo = useCallback(() => {
    const prev = past.current.pop()
    if (prev) {
      future.current.push(current.current)
      current.current = prev
      setConfig(prev)
    }
  }, [])
  const redo = useCallback(() => {
    const next = future.current.pop()
    if (next) {
      past.current.push(current.current)
      current.current = next
      setConfig(next)
    }
  }, [])
  useEffect(() => {
    const id = setTimeout(() => setStored(writeLocal('draft/v1', config)), 180)
    const persist = () => {
      writeLocal('draft/v1', current.current)
    }
    window.addEventListener('pagehide', persist)
    return () => {
      clearTimeout(id)
      window.removeEventListener('pagehide', persist)
    }
  }, [config])
  return {
    config,
    change,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    stored,
    begin: () => {
      group.current = 'first'
    },
    end: () => {
      group.current = 'off'
    },
  }
}
