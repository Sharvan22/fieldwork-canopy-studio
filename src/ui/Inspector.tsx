import { useEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronUp,
  Layers2,
  Minus,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
  Type,
  Upload,
  X,
} from 'lucide-react'
import {
  activeSurfaces,
  colorName,
  layerName,
  money,
  palette,
  type Configuration,
  type Layer,
  type Options,
  type Panel,
  type Surface,
} from '../../shared/config'
import type { Catalog } from '../../shared/contracts'
import { studioApi } from '../services'

interface Props {
  config: Configuration
  surface: Surface
  panel: Panel
  catalog: Catalog | null
  activeId: string | null
  tab: 'design' | 'options'
  setTab: (t: 'design' | 'options') => void
  choose: (id: string) => void
  select: (id: string | null) => void
  changePanel: (fn: (p: Panel) => Panel) => void
  changeOptions: (v: Partial<Options>) => void
  quantity: (n: number) => void
  open2D: () => void
  notify: (s: string) => void
  begin: () => void
  end: () => void
}
function Slider({
  label,
  value,
  min,
  max,
  suffix,
  change,
  begin,
  end,
}: {
  label: string
  value: number
  min: number
  max: number
  suffix: string
  change: (n: number) => void
  begin: () => void
  end: () => void
}) {
  return (
    <label className="slider-field">
      <span>
        {label}
        <output>
          {value}
          {suffix}
        </output>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        value={value}
        onPointerDown={begin}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onChange={(e) => change(+e.target.value)}
      />
    </label>
  )
}
function TextValue({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => {
    setDraft(value)
  }, [value])
  return (
    <label className="input-label">
      Text content
      <input
        type="text"
        value={draft}
        maxLength={80}
        onChange={(e) => {
          setDraft(e.target.value)
          if (e.target.value.trim()) onChange(e.target.value)
        }}
        onBlur={() => setDraft(value)}
      />
    </label>
  )
}
export function Inspector(props: Props) {
  const {
    config,
    surface,
    panel,
    catalog,
    activeId,
    tab,
    setTab,
    choose,
    select,
    changePanel,
    changeOptions,
    quantity,
    open2D,
    notify,
    begin,
    end,
  } = props
  const file = useRef<HTMLInputElement>(null),
    [uploading, setUploading] = useState(false)
  const active = panel.layers.find((l) => l.id === activeId)
  const setLayer = (patch: Partial<Layer>) =>
    changePanel((p) => ({
      ...p,
      layers: p.layers.map((l) => (l.id === activeId ? ({ ...l, ...patch } as Layer) : l)),
    }))
  const add = (l: Layer) => {
    changePanel((p) => ({ ...p, layers: [...p.layers, l] }))
    select(l.id)
    open2D()
  }
  const newPosition = () => ({
    id: crypto.randomUUID(),
    x: 0.5,
    y: surface.triangular ? 0.74 : 0.52,
    width: 0.43,
    rotation: 0,
  })
  const upload = async (f?: File) => {
    if (!f) return
    if (f.size > 8 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) {
      notify('Choose a PNG, JPEG, or WebP image up to 8 MB.')
      return
    }
    const url = URL.createObjectURL(f)
    setUploading(true)
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      const aspect = img.width / img.height
      if (aspect < 0.025 || aspect > 40 || img.width * img.height > 40000000)
        throw new Error(
          'Use an image up to 40 megapixels with an aspect ratio between 1:40 and 40:1.',
        )
      const { id } = await studioApi.upload(f)
      add({ ...newPosition(), type: 'image', assetId: id, name: f.name.slice(0, 140), aspect })
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Upload failed. Please try again.')
    } finally {
      URL.revokeObjectURL(url)
      setUploading(false)
      if (file.current) file.current.value = ''
    }
  }
  return (
    <>
      <div className="inspector-heading">
        <SlidersHorizontal size={18} />
        <h2>Customize</h2>
      </div>
      <div className="tabs" aria-label="Customization controls">
        <button
          aria-pressed={tab === 'design'}
          className={tab === 'design' ? 'on' : ''}
          onClick={() => setTab('design')}
        >
          <Layers2 size={15} />
          Panel design
        </button>
        <button
          aria-pressed={tab === 'options'}
          className={tab === 'options' ? 'on' : ''}
          onClick={() => setTab('options')}
        >
          <SlidersHorizontal size={15} />
          Build options
        </button>
      </div>
      {tab === 'design' ? (
        <div className="inspector-body">
          <div className="field-group">
            <label className="field-label" htmlFor="surface">
              Print section
            </label>
            <div className="section-picker">
              <span className={'surface-symbol ' + (surface.triangular ? 'roof' : '')} />
              <select id="surface" value={surface.id} onChange={(e) => choose(e.target.value)}>
                {activeSurfaces(config.options).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} />
            </div>
          </div>
          <div className="field-group color-group">
            <div className="field-title">
              <span className="field-label">Fabric color</span>
              <span className="color-name">{colorName(panel.color)}</span>
            </div>
            <div className="swatches">
              {palette.map((s) => (
                <button
                  key={s.color}
                  title={s.name}
                  aria-label={'Fabric color ' + s.name}
                  aria-pressed={panel.color.toLowerCase() === s.color.toLowerCase()}
                  className={
                    'swatch ' +
                    (panel.color.toLowerCase() === s.color.toLowerCase() ? 'selected' : '')
                  }
                  style={{ background: s.color }}
                  onClick={() => changePanel((p) => ({ ...p, color: s.color }))}
                >
                  {panel.color.toLowerCase() === s.color.toLowerCase() && (
                    <Check
                      size={16}
                      strokeWidth={2.6}
                      color={s.name === 'Chalk' || s.name === 'Sand' ? '#273228' : '#fff'}
                    />
                  )}
                </button>
              ))}
              <label className="custom-swatch" title="Custom fabric color">
                <Plus size={15} />
                <input
                  type="color"
                  aria-label="Custom fabric color"
                  value={panel.color}
                  onChange={(e) =>
                    changePanel((p) => ({ ...p, color: e.target.value.toUpperCase() }))
                  }
                />
              </label>
            </div>
          </div>
          <div className="field-group artwork-group">
            <div className="field-title">
              <span className="field-label">Artwork</span>
              <span className="layer-count">
                {panel.layers.length} {panel.layers.length === 1 ? 'layer' : 'layers'}
              </span>
            </div>
            <div className="layers">
              {panel.layers.map((l) => (
                <button
                  key={l.id}
                  className={'layer-row ' + (l.id === activeId ? 'active' : '')}
                  aria-expanded={l.id === activeId}
                  onClick={() => {
                    select(l.id === activeId ? null : l.id)
                    if (l.id !== activeId) open2D()
                  }}
                >
                  <span
                    className={'layer-thumb ' + l.type}
                    style={
                      l.type === 'mark' ? { background: panel.color, color: l.ink } : undefined
                    }
                  >
                    {l.type === 'mark' ? (
                      <SmallPeaks />
                    ) : l.type === 'text' ? (
                      <Type size={17} />
                    ) : (
                      <img src={'/api/assets/' + l.assetId} alt="" />
                    )}
                  </span>
                  <span className="layer-copy">
                    <strong>{layerName(l)}</strong>
                    <small>
                      {l.type === 'image'
                        ? 'Uploaded image'
                        : l.type === 'mark'
                          ? 'Studio graphic'
                          : 'Custom text'}
                    </small>
                  </span>
                  {l.id === activeId ? <ChevronUp size={15} /> : <Pencil size={14} />}
                </button>
              ))}
            </div>
            {!panel.layers.length && (
              <div className="empty-art">Solid color panel. Add artwork below.</div>
            )}
            {active && (
              <div className="layer-editor">
                <div className="editor-top">
                  <span>Layer settings</span>
                  <button
                    className="icon-btn mini"
                    title="Close layer settings"
                    aria-label="Close layer settings"
                    onClick={() => select(null)}
                  >
                    <X size={14} />
                  </button>
                </div>
                {active.type === 'text' && (
                  <>
                    <TextValue
                      key={active.id}
                      value={active.text}
                      onChange={(text) => setLayer({ text })}
                    />
                    <label className="input-label">
                      Typeface
                      <select
                        value={active.font}
                        onChange={(e) =>
                          setLayer({ font: e.target.value as 'Sans' | 'Serif' | 'Mono' })
                        }
                      >
                        <option>Sans</option>
                        <option>Serif</option>
                        <option>Mono</option>
                      </select>
                    </label>
                  </>
                )}
                {active.type !== 'image' && (
                  <label className="ink-picker">
                    Ink color
                    <span>
                      {active.ink.toUpperCase()}
                      <input
                        aria-label="Ink color"
                        type="color"
                        value={active.ink}
                        onChange={(e) => setLayer({ ink: e.target.value.toUpperCase() })}
                      />
                    </span>
                  </label>
                )}
                <Slider
                  label="Width"
                  min={4}
                  max={100}
                  value={Math.round(active.width * 100)}
                  suffix="%"
                  change={(n) => setLayer({ width: n / 100 })}
                  begin={begin}
                  end={end}
                />
                <div className="position-grid">
                  <label>
                    X position (%)
                    <input
                      type="number"
                      aria-label="X position"
                      min="0"
                      max="100"
                      value={Math.round(active.x * 100)}
                      onChange={(e) =>
                        setLayer({ x: Math.max(0, Math.min(100, +e.target.value)) / 100 })
                      }
                    />
                  </label>
                  <label>
                    Y position (%)
                    <input
                      type="number"
                      aria-label="Y position"
                      min="0"
                      max="100"
                      value={Math.round(active.y * 100)}
                      onChange={(e) =>
                        setLayer({ y: Math.max(0, Math.min(100, +e.target.value)) / 100 })
                      }
                    />
                  </label>
                </div>
                <Slider
                  label="Rotation"
                  min={-180}
                  max={180}
                  value={active.rotation}
                  suffix="°"
                  change={(n) => setLayer({ rotation: n })}
                  begin={begin}
                  end={end}
                />
                <button
                  className="remove-layer"
                  onClick={() => {
                    changePanel((p) => ({
                      ...p,
                      layers: p.layers.filter((l) => l.id !== active.id),
                    }))
                    select(null)
                  }}
                >
                  <Trash2 size={13} />
                  Remove layer
                </button>
              </div>
            )}
            <div className="add-art">
              <button
                disabled={panel.layers.length >= 10}
                onClick={() =>
                  add({
                    ...newPosition(),
                    type: 'text',
                    text: 'Your text',
                    font: 'Sans',
                    ink: '#F8F4E8',
                  })
                }
              >
                <Type size={16} />
                Add text
              </button>
              <button
                disabled={uploading || panel.layers.length >= 10}
                title="PNG, JPEG or WebP, up to 8 MB"
                onClick={() => file.current?.click()}
              >
                <Upload size={15} />
                {uploading ? 'Uploading…' : 'Upload image'}
              </button>
              <input
                ref={file}
                aria-label="Upload artwork file"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(e) => void upload(e.target.files?.[0])}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="inspector-body options-body">
          {(['frame', 'full', 'half'] as const).map((key) => (
            <label className="input-label" key={key}>
              <span className="field-label">
                {key === 'frame' ? 'Frame package' : key === 'full' ? 'Full walls' : 'Half walls'}
              </span>
              <select
                aria-label={
                  key === 'frame' ? 'Frame package' : key === 'full' ? 'Full walls' : 'Half walls'
                }
                value={config.options[key]}
                disabled={!catalog}
                onChange={(e) => changeOptions({ [key]: e.target.value })}
              >
                {catalog?.[key].map((o) => (
                  <option value={o.id} key={o.id}>
                    {o.label}
                    {o.cents ? ' · ' + (key === 'frame' ? '' : '+') + money(o.cents) : ''}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <div className="quantity-line">
            <span className="field-label">Quantity</span>
            <div className="stepper">
              <button
                aria-label="Decrease quantity"
                disabled={config.quantity <= 1}
                onClick={() => quantity(config.quantity - 1)}
              >
                <Minus size={13} />
              </button>
              <output>{config.quantity}</output>
              <button
                aria-label="Increase quantity"
                disabled={config.quantity >= 25}
                onClick={() => quantity(config.quantity + 1)}
              >
                <Plus size={13} />
              </button>
            </div>
          </div>
          {catalog && (
            <p className="options-note">
              Studio graphics and fabric colors are included. Custom text adds{' '}
              {money(catalog.fees.text.cents)} and uploaded images add{' '}
              {money(catalog.fees.image.cents)} per placement, per canopy.
            </p>
          )}
        </div>
      )}
    </>
  )
}
export function SmallPeaks() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 24" fill="none">
      <path d="M2 21 15 4l9 11L31 4l15 17h-6L31 11l-7 11-9-11-8 10H2Z" fill="currentColor" />
      <circle cx="41" cy="6" r="2.2" fill="currentColor" />
    </svg>
  )
}
