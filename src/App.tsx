import { useEffect, useRef, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowRight,
  Box,
  Check,
  ChevronRight,
  Code2,
  Copy,
  Expand,
  FileJson,
  FileText,
  Focus,
  Grid2X2,
  LoaderCircle,
  Minus,
  Move,
  Plus,
  Redo2,
  Rotate3D,
  Ruler,
  ShoppingBag,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import {
  activeSurfaces,
  canopyProduct,
  defaultPanel,
  money,
  panelFor,
  sides,
  titleCase,
  type Configuration,
  type Options,
  type Panel,
  type Side,
  type Surface,
} from '../shared/config'
import type { CartReceipt, Catalog, ProofRef, Quote } from '../shared/contracts'
import { studioApi, download, loadCart, publishToParent, writeLocal } from './services'
import { useDesign } from './useDesign'
import { Inspector } from './ui/Inspector'
import { Dialog } from './ui/Dialog'
import { FlatEditor, PanelArt } from './art/FlatEditor'
import { panelJpeg } from './art/painter'
import { Viewport } from './preview/Viewport'
import type { PreviewEngine } from './preview/types'

function SideCard({
  side,
  config,
  surfaces,
  active,
  choose,
}: {
  side: Side
  config: Configuration
  surfaces: Surface[]
  active: boolean
  choose: () => void
}) {
  const roof = surfaces.find((s) => s.side === side && s.kind === 'roof')!,
    valance = surfaces.find((s) => s.side === side && s.kind === 'valance')!
  const wall = surfaces.find(
    (s) => s.side === side && (s.kind === 'wall' || s.kind === 'half') && !s.inside,
  )
  return (
    <button
      className={'side-card ' + (active ? 'active' : '')}
      aria-label={'Select ' + side + ' side'}
      aria-pressed={active}
      onClick={choose}
    >
      <span className="side-illustration">
        <span className="mini-tent">
          <span className="mini-roof">
            <PanelArt surface={roof} panel={panelFor(config, roof.id)} width={160} />
          </span>
          <span className="mini-valance">
            <PanelArt surface={valance} panel={panelFor(config, valance.id)} width={160} />
          </span>
          <span
            className="mini-frame"
            style={config.options.frame === 'fabric' ? { visibility: 'hidden' } : undefined}
          />
          {wall && (
            <span
              className={'mini-wall ' + wall.kind}
              style={{ background: panelFor(config, wall.id).color }}
            />
          )}
        </span>
      </span>
      <span className="side-name">
        {titleCase(side)}
        {active ? (
          <span className="side-tick">
            <Check size={9} strokeWidth={3} />
          </span>
        ) : null}
      </span>
    </button>
  )
}
function quoteSignature(c: Configuration) {
  const counts = { text: 0, image: 0 }
  for (const s of activeSurfaces(c.options))
    for (const l of panelFor(c, s.id).layers) if (l.type !== 'mark') counts[l.type]++
  return JSON.stringify([c.options, c.quantity, counts])
}
export default function App() {
  const design = useDesign(),
    { config, change } = design
  const [catalog, setCatalog] = useState<Catalog | null>(null),
    [serviceError, setServiceError] = useState(''),
    [retry, setRetry] = useState(0)
  const [quote, setQuote] = useState<{ key: string; value: Quote } | null>(null)
  const [surfaceId, setSurfaceId] = useState('roof-front'),
    [layerId, setLayerId] = useState<string | null>(null)
  const [tab, setTab] = useState<'design' | 'options'>('design'),
    [view, setView] = useState<'3d' | '2d'>('3d'),
    [flatZoom, setFlatZoom] = useState(1)
  const [cameraSide, setCameraSide] = useState<Side>('front')
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(''),
    [toast, setToast] = useState('')
  const [dialog, setDialog] = useState<'cart' | 'price' | 'embed' | null>(null),
    [expanded, setExpanded] = useState(false)
  const [cart, setCart] = useState<CartReceipt[]>(loadCart)
  const engine = useRef<PreviewEngine | null>(null),
    stage = useRef<HTMLDivElement>(null)
  const proofCache = useRef<{ config: Configuration; proof: ProofRef } | null>(null),
    requestKey = useRef<{ id: string; request: string } | null>(null),
    actionLock = useRef(false)
  const configRef = useRef(config)
  configRef.current = config
  const surfaces = activeSurfaces(config.options),
    surface = surfaces.find((s) => s.id === surfaceId) ?? surfaces[0],
    panel = panelFor(config, surface.id)
  const signature = quoteSignature(config),
    liveQuote = quote?.key === signature ? quote.value : null
  useEffect(() => {
    let alive = true
    studioApi
      .catalog()
      .then((c) => {
        if (alive) setCatalog(c)
      })
      .catch((e) => {
        if (alive) setServiceError(e.message)
      })
    return () => {
      alive = false
    }
  }, [retry])
  useEffect(() => {
    const abort = new AbortController()
    const id = setTimeout(
      () =>
        studioApi
          .quote(configRef.current, abort.signal)
          .then((q) => {
            if (!abort.signal.aborted) {
              setQuote({ key: signature, value: q })
              setServiceError('')
            }
          })
          .catch((e) => {
            if (!abort.signal.aborted) setServiceError(e.message)
          }),
      80,
    )
    return () => {
      clearTimeout(id)
      abort.abort()
    }
  }, [signature, retry])
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(''), 6500)
    return () => clearTimeout(id)
  }, [toast])
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false)
      if (
        actionLock.current ||
        dialog ||
        (e.target instanceof HTMLElement &&
          ['TEXTAREA', 'INPUT', 'SELECT'].includes(e.target.tagName))
      )
        return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.shiftKey ? design.redo() : design.undo()
      }
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [dialog, design.undo, design.redo])
  useEffect(() => {
    const ro = new ResizeObserver(() =>
      publishToParent('resize', {
        height: Math.ceil(document.getElementById('root')!.getBoundingClientRect().height),
      }),
    )
    ro.observe(document.getElementById('root')!)
    return () => ro.disconnect()
  }, [])
  const choose = (id: string, aim = true) => {
    const s = surfaces.find((x) => x.id === id)
    if (!s) return
    setSurfaceId(id)
    setLayerId(null)
    setTab('design')
    setFlatZoom(1)
    if (aim) setCameraSide(s.side)
  }
  const changePanel = (fn: (p: Panel) => Panel) => {
    const id = surface.id
    change((c) => ({ ...c, panels: { ...c.panels, [id]: fn(panelFor(c, id)) } }))
  }
  const changeOptions = (patch: Partial<Options>) =>
    change((c) => {
      const options = { ...c.options, ...patch },
        panels = { ...c.panels }
      for (const s of activeSurfaces(options)) panels[s.id] ??= defaultPanel()
      return { ...c, options, panels }
    })
  function chooseSide(side: Side) {
    const candidate =
      surfaces.find(
        (s) => s.side === side && s.kind === surface.kind && s.inside === surface.inside,
      ) ?? surfaces.find((s) => s.side === side)!
    choose(candidate.id)
  }
  async function ensureProof(): Promise<ProofRef> {
    const snapshot = config
    if (proofCache.current?.config === snapshot) return proofCache.current.proof
    const viewer = engine.current
    if (!viewer) throw new Error('The preview is still loading.')
    await viewer.update(snapshot)
    const hero = viewer.snapshot()
    const previews = await Promise.all(
      activeSurfaces(snapshot.options).map(async (s) => ({
        id: s.id,
        jpeg: await panelJpeg(s, panelFor(snapshot, s.id)),
      })),
    )
    const proof = await studioApi.saveProof(snapshot, hero, previews)
    proofCache.current = { config: snapshot, proof }
    return proof
  }
  async function commit(action: 'pdf' | 'cart') {
    if (actionLock.current) return
    actionLock.current = true
    setBusy(action)
    try {
      const proof = await ensureProof()
      if (action === 'pdf') {
        download(proof.pdfUrl, 'Fieldwork-' + proof.id + '.pdf')
        setToast('Production PDF is ready.')
      } else {
        if (requestKey.current?.id !== proof.id)
          requestKey.current = { id: proof.id, request: crypto.randomUUID() }
        const receipt = await studioApi.cart(proof.id, requestKey.current.request)
        setCart((prior) => {
          const items = [...prior.filter((c) => c.id !== receipt.id), receipt]
          writeLocal('cart/v1', items)
          return items
        })
        publishToParent('cart:add', receipt)
        requestKey.current = null
        setDialog('cart')
      }
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'The request failed. Try again.')
    } finally {
      actionLock.current = false
      setBusy('')
    }
  }
  const bumpZoom = (n: number) =>
    view === '3d'
      ? engine.current?.zoom(n)
      : setFlatZoom((v) => Math.min(1.5, Math.max(0.65, v * n)))
  const resetView = () => (view === '3d' ? engine.current?.fit() : setFlatZoom(1))
  const embedUrl = location.origin + '/?embed=1'
  const embedCode =
    '<iframe src="' +
    embedUrl +
    '" title="Fieldwork canopy configurator" width="100%" height="920" style="border:0" allow="fullscreen"></iframe>'
  const count = cart.reduce((n, c) => n + c.quote.quantity, 0)
  const embedded = new URLSearchParams(location.search).get('embed') === '1'
  const price = liveQuote ? money(liveQuote.totalCents) : '…'
  return (
    <div className={'app ' + (embedded ? 'embedded' : '')} aria-busy={Boolean(busy)}>
      <header className="masthead">
        <div className="mast-inner">
          <div className="wordmark">
            <img src="/fieldwork.svg" width="31" height="31" alt="" />
            <span>Fieldwork</span>
          </div>
          <span className="mast-rule" />
          <span className="studio-name">Design Studio</span>
          <div className="mast-actions">
            <button
              className="export-button"
              disabled={!!busy || !ready || !liveQuote}
              onClick={() => void commit('pdf')}
            >
              {busy === 'pdf' ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <ArrowDownToLine size={16} />
              )}
              <span>Export PDF</span>
            </button>
            <button className="cart-button" disabled={!!busy} onClick={() => setDialog('cart')}>
              <ShoppingBag size={15} />
              <span>Cart</span>
              <b>{count}</b>
            </button>
          </div>
        </div>
      </header>
      <main className="main">
        <section className="intro">
          <div>
            <div className="eyebrow">
              <span className="orange-dash" />
              SHELTER SYSTEMS<span className="slash">/</span>
              <span>{canopyProduct.sku}</span>
            </div>
            <h1>Canopy configurator</h1>
            <p>Design your 10 × 10 ft event canopy, one panel at a time.</p>
          </div>
          <div className="history">
            <span className="save-state">
              <i className={design.stored ? '' : 'unsaved'} />
              {design.stored ? 'Draft saved' : 'Session draft'}
            </span>
            <div className="history-buttons">
              <button
                title="Undo"
                aria-label="Undo"
                disabled={!design.canUndo || !!busy}
                onClick={design.undo}
              >
                <Undo2 size={16} />
              </button>
              <button
                title="Redo"
                aria-label="Redo"
                disabled={!design.canRedo || !!busy}
                onClick={design.redo}
              >
                <Redo2 size={16} />
              </button>
            </div>
          </div>
        </section>
        <div
          className={'workspace ' + (busy ? 'working' : '')}
          ref={(node) => {
            if (node) node.inert = Boolean(busy)
          }}
        >
          <div className="left-column">
            <section className={'preview-card ' + (expanded ? 'expanded' : '')}>
              <div className="preview-stage" ref={stage}>
                <div className="stage-tools">
                  <span className="view-label">
                    <i />
                    {view === '3d' ? 'LIVE PREVIEW' : 'FLAT ARTWORK'}
                  </span>
                  <div className="view-tabs" aria-label="Editor view">
                    <button
                      className={view === '3d' ? 'active' : ''}
                      aria-pressed={view === '3d'}
                      onClick={() => setView('3d')}
                    >
                      <Box size={14} />
                      3D view
                    </button>
                    <button
                      className={view === '2d' ? 'active' : ''}
                      aria-pressed={view === '2d'}
                      onClick={() => setView('2d')}
                    >
                      <Grid2X2 size={14} />
                      2D editor
                    </button>
                  </div>
                </div>
                <div className={'scene-layer ' + (view === '2d' ? 'invisible' : '')}>
                  <Viewport
                    config={config}
                    side={cameraSide}
                    engine={engine}
                    ready={setReady}
                    onPick={(id) => choose(id, false)}
                  />
                </div>
                {!ready && view === '3d' && (
                  <div className="scene-loading">
                    <LoaderCircle className="spin" size={20} />
                    Loading canopy
                  </div>
                )}
                {view === '2d' && (
                  <FlatEditor
                    surface={surface}
                    panel={panel}
                    selected={layerId}
                    select={setLayerId}
                    begin={design.begin}
                    end={design.end}
                    zoom={flatZoom}
                    move={(id, x, y) =>
                      changePanel((p) => ({
                        ...p,
                        layers: p.layers.map((l) => (l.id === id ? { ...l, x, y } : l)),
                      }))
                    }
                  />
                )}
                <div className="stage-bottom">
                  <div className="orbit-hint">
                    {view === '3d' ? <Rotate3D size={16} /> : <Move size={15} />}
                    <span>{view === '3d' ? 'Drag to rotate' : 'Drag artwork to position'}</span>
                  </div>
                  <div className="stage-buttons">
                    <button
                      title="Zoom out"
                      aria-label="Zoom out"
                      onClick={() => bumpZoom(1 / 1.16)}
                    >
                      <Minus size={16} />
                    </button>
                    <button title="Zoom in" aria-label="Zoom in" onClick={() => bumpZoom(1.16)}>
                      <Plus size={16} />
                    </button>
                    <i />
                    <button title="Reset view" aria-label="Reset view" onClick={resetView}>
                      <Focus size={16} />
                    </button>
                    <button
                      title={expanded ? 'Close expanded view' : 'Expand preview'}
                      aria-label={expanded ? 'Close expanded view' : 'Expand preview'}
                      onClick={() => setExpanded(!expanded)}
                    >
                      {expanded ? <X size={16} /> : <Expand size={15} />}
                    </button>
                  </div>
                </div>
              </div>
              <div className="preview-caption">
                <div>
                  <span className="product-point" />
                  <strong>{canopyProduct.name}</strong>
                </div>
                <span>
                  <Ruler size={15} />
                  {canopyProduct.size}
                </span>
              </div>
            </section>
            <section className="navigator">
              <div className="nav-heading">
                <h2>Panel navigator</h2>
                <span>Choose a side to edit</span>
              </div>
              <div className="side-grid">
                {sides.map((s) => (
                  <SideCard
                    key={s}
                    side={s}
                    config={config}
                    surfaces={surfaces}
                    active={surface.side === s}
                    choose={() => chooseSide(s)}
                  />
                ))}
              </div>
            </section>
          </div>
          <aside className="inspector">
            <Inspector
              config={config}
              surface={surface}
              panel={panel}
              catalog={catalog}
              activeId={layerId}
              tab={tab}
              setTab={setTab}
              choose={choose}
              select={setLayerId}
              changePanel={changePanel}
              changeOptions={changeOptions}
              quantity={(quantity) => change((c) => ({ ...c, quantity }))}
              open2D={() => setView('2d')}
              notify={setToast}
              begin={design.begin}
              end={design.end}
            />
            <div className="price-block">
              <div className="estimate">
                <div>
                  <span className="estimate-label">Estimated total</span>
                  <div className="amount" aria-live="polite" data-testid="estimate">
                    {price}
                    <small>USD</small>
                  </div>
                </div>
                <button
                  className="breakdown"
                  disabled={!liveQuote}
                  onClick={() => setDialog('price')}
                >
                  Breakdown
                  <ChevronRight size={13} />
                </button>
              </div>
              <button
                className="primary buy"
                disabled={!liveQuote || !ready || !!busy}
                onClick={() => void commit('cart')}
              >
                <ShoppingBag size={17} />
                <span>{busy === 'cart' ? 'Preparing proof…' : 'Add to cart'}</span>
                <ArrowRight size={16} />
              </button>
            </div>
            {serviceError && (
              <div className="service-error" role="alert">
                {serviceError} <button onClick={() => setRetry((n) => n + 1)}>Retry</button>
              </div>
            )}
          </aside>
        </div>
        <footer className="foot">
          <span>
            <span className="foot-mark" />
            Fieldwork Design Studio
          </span>
          <button onClick={() => setDialog('embed')}>
            <Code2 size={14} />
            Embed configurator
          </button>
        </footer>
      </main>
      {busy && (
        <div className="toast busy-toast" role="status">
          <LoaderCircle size={16} className="spin" />
          Preparing your production proof…
        </div>
      )}
      {toast && !busy && (
        <div className="toast" role="status">
          {toast}
          <button aria-label="Dismiss message" onClick={() => setToast('')}>
            <X size={13} />
          </button>
        </div>
      )}
      {dialog === 'price' && liveQuote && (
        <Dialog title="Price breakdown" onClose={() => setDialog(null)}>
          <p className="dialog-sub">
            10 × 10 Canopy Tent · {config.quantity} {config.quantity === 1 ? 'unit' : 'units'}
          </p>
          <div className="receipt-lines">
            {liveQuote.lines.map((l) => (
              <div key={l.sku}>
                <div>
                  <strong>{l.label}</strong>
                  <small>
                    {l.count} × {money(l.unitCents)}
                  </small>
                </div>
                <span>{money(l.totalCents)}</span>
              </div>
            ))}
          </div>
          <div className="dialog-total">
            <span>Estimated total</span>
            <b>{price}</b>
          </div>
          <p className="fineprint">USD. Demo pricing excludes shipping and tax.</p>
        </Dialog>
      )}
      {dialog === 'cart' && (
        <Dialog title="Your demo cart" onClose={() => setDialog(null)}>
          {!cart.length ? (
            <div className="empty-cart">
              <ShoppingBag size={29} />
              <p>Your cart is empty.</p>
              <button className="secondary" onClick={() => setDialog(null)}>
                Continue designing
              </button>
            </div>
          ) : (
            <>
              <p className="dialog-sub">
                Each canopy includes its saved design and production proof.
              </p>
              <div className="cart-list">
                {cart.map((r) => (
                  <article className="receipt" key={r.id}>
                    <div className="receipt-top">
                      <span className="receipt-icon">
                        <Box size={20} />
                      </span>
                      <div>
                        <h3>{canopyProduct.name}</h3>
                        <small>
                          Qty {r.quote.quantity} · {r.proof.id.slice(0, 8).toUpperCase()}
                        </small>
                      </div>
                      <button
                        className="icon-btn mini"
                        aria-label={'Remove cart item ' + r.proof.id.slice(0, 8)}
                        onClick={() =>
                          setCart((previous) => {
                            const items = previous.filter((it) => it.id !== r.id)
                            writeLocal('cart/v1', items)
                            return items
                          })
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="receipt-lines">
                      {r.quote.lines.map((l) => (
                        <div key={l.sku}>
                          <span>{l.label}</span>
                          <b>{money(l.totalCents)}</b>
                        </div>
                      ))}
                    </div>
                    <div className="proof-links">
                      <a href={r.proof.pdfUrl} download>
                        <FileText size={14} />
                        Production PDF
                      </a>
                      <a href={r.proof.configUrl} download={'Fieldwork-' + r.proof.id + '.json'}>
                        <FileJson size={14} />
                        Design JSON
                      </a>
                    </div>
                    <details>
                      <summary>Shopify cart payload</summary>
                      <pre>{JSON.stringify({ items: r.items }, null, 2)}</pre>
                    </details>
                  </article>
                ))}
              </div>
              <div className="dialog-total">
                <span>Cart subtotal</span>
                <b>{money(cart.reduce((n, r) => n + r.quote.totalCents, 0))}</b>
              </div>
              <p className="fineprint">Mock Shopify cart · USD · Shipping and tax excluded.</p>
            </>
          )}
        </Dialog>
      )}
      {dialog === 'embed' && (
        <Dialog title="Embed the studio" onClose={() => setDialog(null)}>
          <p className="dialog-sub">
            Place this iframe on your product page. The studio sends a cart event with the priced
            variant lines and production proof.
          </p>
          <pre className="embed-code">{embedCode}</pre>
          <div className="dialog-actions">
            <button
              className="secondary"
              onClick={() =>
                navigator.clipboard
                  .writeText(embedCode)
                  .then(() => setToast('Embed code copied.'))
                  .catch(() => setToast('Select and copy the embed code above.'))
              }
            >
              <Copy size={14} />
              Copy code
            </button>
            <a className="secondary" href="/embed-demo.html" target="_blank" rel="noreferrer">
              Open embed demo
              <ArrowRight size={14} />
            </a>
          </div>
        </Dialog>
      )}
    </div>
  )
}
