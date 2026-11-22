import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Focus, Maximize2, Network, RefreshCw, RotateCcw, Search, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import EmptyState from '@/components/shared/EmptyState.jsx'
import ErrorState from '@/components/shared/ErrorState.jsx'
import { cn } from '@/lib/utils'
import { getDocumentGraph } from '../../api/client.js'

const WIDTH = 960
const HEIGHT = 620
const PADDING = 70
const NODE_LIMIT = 10000

const DEFAULTS = {
  nodeSize: 1,
  linkDistance: 120,
  repulsion: 2200,
  linkStrength: 0.08,
  showLabels: true,
  animate: true,
  showOrphans: true,
  groupColors: false,
  linkTypes: { related: true, reference: true, depends_on: true },
}

const EDGE_STYLE = {
  related: { stroke: 'hsl(var(--muted-foreground))', dash: '' },
  reference: { stroke: 'hsl(var(--primary))', dash: '' },
  depends_on: { stroke: 'hsl(var(--destructive))', dash: '6 4' },
}

function clamp(n, min, max) { return Math.min(max, Math.max(min, n)) }
function folderColor(name) {
  if (!name) return 'hsl(var(--muted))'
  let hash = 0
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  const hue = hash % 360
  return `hsla(${hue}, 35%, 55%, 0.22)`
}

function computeForceLayout(nodes, edges, settings, prevPositions = new Map()) {
  const pos = nodes.map((n, i) => {
    const prev = prevPositions.get(n.id)
    const angle = (Math.PI * 2 * i) / Math.max(nodes.length, 1)
    return {
      id: n.id,
      x: prev?.x ?? WIDTH / 2 + Math.cos(angle) * 140,
      y: prev?.y ?? HEIGHT / 2 + Math.sin(angle) * 140,
      vx: 0,
      vy: 0,
    }
  })
  const byId = new Map(pos.map((p) => [p.id, p]))
  const linkDist = Number(settings.linkDistance) || DEFAULTS.linkDistance
  const repulsion = Number(settings.repulsion) || DEFAULTS.repulsion
  const linkStrength = Number(settings.linkStrength) || DEFAULTS.linkStrength
  const iterations = settings.animate ? 220 : 320

  for (let iter = 0; iter < iterations; iter += 1) {
    const alpha = 1 - iter / iterations
    // Repulsion
    for (let i = 0; i < pos.length; i += 1) {
      for (let j = i + 1; j < pos.length; j += 1) {
        const a = pos[i]; const b = pos[j]
        let dx = a.x - b.x; let dy = a.y - b.y
        let dist2 = dx * dx + dy * dy
        if (dist2 < 1) { dx = (i - j) * 0.1 || 0.1; dy = 0.1; dist2 = dx * dx + dy * dy }
        const force = (repulsion * alpha) / dist2
        const dist = Math.sqrt(dist2)
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy
      }
    }
    // Links
    edges.forEach((e) => {
      const a = byId.get(e.source_document_id)
      const b = byId.get(e.target_document_id)
      if (!a || !b) return
      let dx = b.x - a.x; let dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const diff = (dist - linkDist) * linkStrength * alpha
      const fx = (dx / dist) * diff
      const fy = (dy / dist) * diff
      a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy
    })
    // Center + integrate
    for (const p of pos) {
      p.vx += (WIDTH / 2 - p.x) * 0.0025 * alpha
      p.vy += (HEIGHT / 2 - p.y) * 0.0025 * alpha
      p.vx *= 0.85
      p.vy *= 0.85
      p.x = clamp(p.x + p.vx, PADDING, WIDTH - PADDING)
      p.y = clamp(p.y + p.vy, PADDING, HEIGHT - PADDING)
    }
  }
  return new Map(pos.map((p) => [p.id, { x: p.x, y: p.y }]))
}

function buildAdjacency(edges) {
  const adj = new Map()
  edges.forEach((e) => {
    if (!adj.has(e.source_document_id)) adj.set(e.source_document_id, new Set())
    if (!adj.has(e.target_document_id)) adj.set(e.target_document_id, new Set())
    adj.get(e.source_document_id).add(e.target_document_id)
    adj.get(e.target_document_id).add(e.source_document_id)
  })
  return adj
}

function getLocalNodeIds(startId, depth, edges) {
  if (!startId) return null
  const out = new Set([startId])
  let frontier = [startId]
  for (let d = 0; d < depth; d += 1) {
    const next = []
    frontier.forEach((id) => {
      edges.forEach((e) => {
        const a = e.source_document_id; const b = e.target_document_id
        if (a === id && !out.has(b)) { out.add(b); next.push(b) }
        if (b === id && !out.has(a)) { out.add(a); next.push(a) }
      })
    })
    frontier = next
    if (!frontier.length) break
  }
  return out
}

export default function DocumentGraph({ workspaceId, activeDocumentId, onOpenDocument }) {
  const [state, setState] = useState({ status: 'idle', data: null, error: null })
  const [reloadKey, setReloadKey] = useState(0)
  const [selectedId, setSelectedId] = useState(null)
  const [hoveredId, setHoveredId] = useState(null)
  const [search, setSearch] = useState('')
  const [localMode, setLocalMode] = useState(false)
  const [depth, setDepth] = useState(1)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState(DEFAULTS)
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 })
  const svgRef = useRef(null)
  const panRef = useRef(null)
  const positionsRef = useRef(new Map())
  const dragRef = useRef(null)

  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  const effectiveSettings = useMemo(
    () => ({ ...settings, animate: settings.animate && !reducedMotion }),
    [settings, reducedMotion],
  )

  useEffect(() => {
    if (!workspaceId) { setState({ status: 'idle', data: null, error: null }); return undefined }
    let cancelled = false
    setState({ status: 'loading', data: null, error: null })
    getDocumentGraph(workspaceId)
      .then((data) => { if (!cancelled) setState({ status: 'ready', data, error: null }) })
      .catch((error) => { if (!cancelled) setState({ status: 'error', data: null, error }) })
    return () => { cancelled = true }
  }, [workspaceId, reloadKey])

  useEffect(() => { setSelectedId(activeDocumentId || null) }, [activeDocumentId])

  const rawNodes = state.data?.nodes || []
  const rawEdges = state.data?.edges || []

  const filtered = useMemo(() => {
    const allowedTypes = effectiveSettings.linkTypes
    let edges = rawEdges.filter((e) => allowedTypes[e.link_type] !== false)
    let nodeIds = new Set(rawNodes.map((n) => n.id))
    edges = edges.filter((e) => nodeIds.has(e.source_document_id) && nodeIds.has(e.target_document_id))

    const q = search.trim().toLowerCase()
    if (q) {
      nodeIds = new Set(rawNodes.filter((n) => (n.title || '').toLowerCase().includes(q)).map((n) => n.id))
    }

    const focusId = selectedId || activeDocumentId
    if (localMode && focusId) {
      const localIds = getLocalNodeIds(focusId, depth, edges)
      if (localIds) nodeIds = new Set([...nodeIds].filter((id) => localIds.has(id)))
    }

    if (!effectiveSettings.showOrphans) {
      const connected = new Set()
      edges.forEach((e) => { connected.add(e.source_document_id); connected.add(e.target_document_id) })
      nodeIds = new Set([...nodeIds].filter((id) => connected.has(id)))
    }

    const nodes = rawNodes.filter((n) => nodeIds.has(n.id))
    edges = edges.filter((e) => nodeIds.has(e.source_document_id) && nodeIds.has(e.target_document_id))
    return { nodes, edges }
  }, [rawNodes, rawEdges, effectiveSettings, search, localMode, depth, selectedId, activeDocumentId])

  const [positions, setPositions] = useState(new Map())
  useEffect(() => {
    const next = computeForceLayout(filtered.nodes, filtered.edges, effectiveSettings, positionsRef.current)
    positionsRef.current = next
    setPositions(new Map(next))
  }, [filtered.nodes, filtered.edges, effectiveSettings])

  const adjacency = useMemo(() => buildAdjacency(filtered.edges), [filtered.edges])
  const focusId = hoveredId || selectedId || activeDocumentId
  const connectedToFocus = useMemo(() => adjacency.get(focusId) || new Set(), [adjacency, focusId])

  const fitToScreen = useCallback(() => {
    if (!filtered.nodes.length) { setView({ x: 0, y: 0, scale: 1 }); return }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    filtered.nodes.forEach((n) => {
      const p = positions.get(n.id); if (!p) return
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
    })
    if (!Number.isFinite(minX)) { setView({ x: 0, y: 0, scale: 1 }); return }
    const pad = 80
    const bw = Math.max(1, maxX - minX + pad * 2)
    const bh = Math.max(1, maxY - minY + pad * 2)
    const scale = clamp(Math.min(WIDTH / bw, HEIGHT / bh), 0.4, 2.2)
    const cx = (minX + maxX) / 2; const cy = (minY + maxY) / 2
    setView({ scale, x: WIDTH / 2 - cx * scale, y: HEIGHT / 2 - cy * scale })
  }, [filtered.nodes, positions])

  useEffect(() => { fitToScreen() }, [workspaceId, reloadKey]) // eslint-disable-line react-hooks/exhaustive-deps

  function svgPoint(clientX, clientY) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: ((clientX - rect.left) / rect.width) * WIDTH,
      y: ((clientY - rect.top) / rect.height) * HEIGHT,
    }
  }

  function onSvgPointerDown(e) {
    if (e.target.closest('[data-node]')) return
    panRef.current = { x: e.clientX, y: e.clientY, view }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  function onSvgPointerMove(e) {
    if (dragRef.current) {
      const p = svgPoint(e.clientX, e.clientY)
      const x = clamp((p.x - view.x) / view.scale, PADDING, WIDTH - PADDING)
      const y = clamp((p.y - view.y) / view.scale, PADDING, HEIGHT - PADDING)
      positionsRef.current.set(dragRef.current.id, { x, y })
      setPositions((prev) => {
        const next = new Map(prev)
        next.set(dragRef.current.id, { x, y })
        return next
      })
      return
    }
    if (!panRef.current) return
    const dx = e.clientX - panRef.current.x
    const dy = e.clientY - panRef.current.y
    const rect = svgRef.current?.getBoundingClientRect()
    const sx = rect ? (dx / rect.width) * WIDTH : dx
    const sy = rect ? (dy / rect.height) * HEIGHT : dy
    setView({ ...panRef.current.view, x: panRef.current.view.x + sx, y: panRef.current.view.y + sy })
  }
  function onSvgPointerUp() { panRef.current = null; dragRef.current = null }

  function onNodePointerDown(e, nodeId) {
    e.stopPropagation()
    dragRef.current = { id: nodeId }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function openNode(node) { setSelectedId(node.id); onOpenDocument(node.id) }

  if (!workspaceId) {
    return <div className="flex h-full items-center justify-center p-6"><p className="text-[13px] text-muted-foreground">Select a vault to view its graph.</p></div>
  }
  if (state.status === 'loading') {
    return <div className="grid h-full place-items-center p-6" role="status" aria-label="Loading graph"><p className="text-[13px] text-muted-foreground">Loading document graph…</p></div>
  }
  if (state.status === 'error') {
    return <div className="flex h-full items-center justify-center p-6"><ErrorState title="Graph could not be loaded" message={state.error?.message} onRetry={() => setReloadKey((k) => k + 1)} /></div>
  }
  if (!rawNodes.length) {
    return <EmptyState className="h-full justify-center" icon={Network} title="No documents to graph" description="Create documents and links in this vault to see relationships here." />
  }

  const nodeRadius = 18 * effectiveSettings.nodeSize

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Document graph">
      <header className="flex flex-none flex-col gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Document graph</h2>
            <p className="text-[12.5px] text-muted-foreground">
              {filtered.nodes.length} of {rawNodes.length} documents · {filtered.edges.length} links
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={fitToScreen}><Maximize2 size={14} />Fit</Button>
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setView((v) => ({ ...v, scale: clamp(v.scale * 1.2, 0.3, 3) }))} aria-label="Zoom in">+</Button>
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setView((v) => ({ ...v, scale: clamp(v.scale / 1.2, 0.3, 3) }))} aria-label="Zoom out">−</Button>
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setView({ x: 0, y: 0, scale: 1 })}><Focus size={14} />Center</Button>
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => { positionsRef.current = new Map(); setReloadKey((k) => k + 1) }}><RefreshCw size={14} />Refresh</Button>
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => { setSettings(DEFAULTS); setSearch(''); setLocalMode(false); setDepth(1); setView({ x: 0, y: 0, scale: 1 }) }}><RotateCcw size={14} />Reset</Button>
            <Button type="button" variant={settingsOpen ? 'secondary' : 'outline'} size="sm" className="h-8 gap-1.5" onClick={() => setSettingsOpen((v) => !v)}><Settings2 size={14} />Settings</Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search graph…" aria-label="Search documents in graph" className="h-8 bg-card pl-8 text-[13px]" />
          </div>
          <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <input type="checkbox" checked={localMode} onChange={(e) => setLocalMode(e.target.checked)} />
            Local graph
          </label>
          {localMode && (
            <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
              Depth
              <select className="h-8 rounded-md border border-input bg-background px-2 text-[12px]" value={depth} onChange={(e) => setDepth(Number(e.target.value))} aria-label="Local graph depth">
                <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
              </select>
            </label>
          )}
        </div>
        {settingsOpen && (
          <div className="grid gap-3 rounded-lg border border-border bg-card p-3 text-[12px] sm:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1"><span className="text-muted-foreground">Node size</span><input type="range" min="0.7" max="1.6" step="0.1" value={settings.nodeSize} onChange={(e) => setSettings((s) => ({ ...s, nodeSize: Number(e.target.value) }))} /></label>
            <label className="grid gap-1"><span className="text-muted-foreground">Link distance</span><input type="range" min="60" max="220" step="10" value={settings.linkDistance} onChange={(e) => setSettings((s) => ({ ...s, linkDistance: Number(e.target.value) }))} /></label>
            <label className="grid gap-1"><span className="text-muted-foreground">Repulsion</span><input type="range" min="800" max="5000" step="100" value={settings.repulsion} onChange={(e) => setSettings((s) => ({ ...s, repulsion: Number(e.target.value) }))} /></label>
            <label className="grid gap-1"><span className="text-muted-foreground">Link strength</span><input type="range" min="0.02" max="0.2" step="0.01" value={settings.linkStrength} onChange={(e) => setSettings((s) => ({ ...s, linkStrength: Number(e.target.value) }))} /></label>
            <label className="flex items-center gap-2 text-muted-foreground"><input type="checkbox" checked={settings.showLabels} onChange={(e) => setSettings((s) => ({ ...s, showLabels: e.target.checked }))} />Labels</label>
            <label className="flex items-center gap-2 text-muted-foreground"><input type="checkbox" checked={settings.showOrphans} onChange={(e) => setSettings((s) => ({ ...s, showOrphans: e.target.checked }))} />Show orphans</label>
            <label className="flex items-center gap-2 text-muted-foreground"><input type="checkbox" checked={settings.groupColors} onChange={(e) => setSettings((s) => ({ ...s, groupColors: e.target.checked }))} />Group colors</label>
            <label className="flex items-center gap-2 text-muted-foreground"><input type="checkbox" checked={settings.animate && !reducedMotion} disabled={reducedMotion} onChange={(e) => setSettings((s) => ({ ...s, animate: e.target.checked }))} />Animation</label>
            <div className="flex flex-wrap gap-3 text-muted-foreground">
              {Object.keys(DEFAULTS.linkTypes).map((type) => (
                <label key={type} className="flex items-center gap-1.5 capitalize"><input type="checkbox" checked={settings.linkTypes[type]} onChange={(e) => setSettings((s) => ({ ...s, linkTypes: { ...s.linkTypes, [type]: e.target.checked } }))} />{type.replace('_', ' ')}</label>
              ))}
            </div>
          </div>
        )}
        {localMode && (selectedId || activeDocumentId) && !filtered.edges.some((e) => e.source_document_id === (selectedId || activeDocumentId) || e.target_document_id === (selectedId || activeDocumentId)) && (
          <p role="status" className="text-[12px] text-muted-foreground">No related documents found for the selected document.</p>
        )}
        {state.data?.truncated && <p role="status" className="text-[12px] text-destructive">Vault has more than {NODE_LIMIT.toLocaleString()} documents; graph is truncated.</p>}
      </header>

      <div className="min-h-0 flex-1 overflow-hidden p-3 sm:p-5">
        {!filtered.nodes.length ? (
          <EmptyState className="h-full justify-center" icon={Network} title="No graph results" description="Adjust search, filters, or local graph settings to see documents." />
        ) : (
          <div className="h-full rounded-lg border border-border bg-card p-2">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              className="h-full w-full min-h-[320px] touch-none select-none"
              role="group"
              aria-label="Document relationship graph"
              onPointerDown={onSvgPointerDown}
              onPointerMove={onSvgPointerMove}
              onPointerUp={onSvgPointerUp}
              onPointerLeave={onSvgPointerUp}
              onWheel={(e) => {
                e.preventDefault()
                const factor = e.deltaY < 0 ? 1.1 : 0.9
                const pt = svgPoint(e.clientX, e.clientY)
                setView((v) => {
                  const nextScale = clamp(v.scale * factor, 0.3, 3)
                  const wx = (pt.x - v.x) / v.scale
                  const wy = (pt.y - v.y) / v.scale
                  return { scale: nextScale, x: pt.x - wx * nextScale, y: pt.y - wy * nextScale }
                })
              }}
            >
              <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="transparent" />
              <g transform={`translate(${view.x}, ${view.y}) scale(${view.scale})`}>
                <g aria-label="Links">
                  {filtered.edges.map((edge) => {
                    const from = positions.get(edge.source_document_id)
                    const to = positions.get(edge.target_document_id)
                    if (!from || !to) return null
                    const style = EDGE_STYLE[edge.link_type] || EDGE_STYLE.related
                    const active = focusId && (edge.source_document_id === focusId || edge.target_document_id === focusId)
                    const dimmed = focusId && !active
                    const mx = (from.x + to.x) / 2
                    const my = (from.y + to.y) / 2 - 18
                    const d = `M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`
                    return (
                      <path
                        key={edge.id}
                        d={d}
                        fill="none"
                        stroke={style.stroke}
                        strokeDasharray={style.dash || undefined}
                        strokeOpacity={dimmed ? 0.12 : active ? 0.9 : 0.35}
                        strokeWidth={active ? 2.5 : 1.75}
                        style={effectiveSettings.animate ? { transition: 'stroke-opacity 150ms ease' } : undefined}
                      />
                    )
                  })}
                </g>
                <g aria-label="Documents">
                  {filtered.nodes.map((node) => {
                    const pos = positions.get(node.id)
                    if (!pos) return null
                    const active = node.id === (selectedId || activeDocumentId)
                    const hovered = node.id === hoveredId
                    const isFocus = node.id === focusId
                    const neighbor = connectedToFocus.has(node.id)
                    const dimmed = focusId && !isFocus && !neighbor
                    const label = node.title || `Document #${node.id}`
                    const short = label.length > 24 ? `${label.slice(0, 23)}…` : label
                    const r = nodeRadius + (active ? 4 : hovered ? 2 : 0)
                    return (
                      <g
                        key={node.id}
                        data-node="true"
                        transform={`translate(${pos.x}, ${pos.y})`}
                        tabIndex={0}
                        role="button"
                        aria-label={`Open document ${label}${node.folder_name ? ` in ${node.folder_name}` : ''}`}
                        className="cursor-pointer outline-none"
                        opacity={dimmed ? 0.28 : 1}
                        onPointerDown={(e) => onNodePointerDown(e, node.id)}
                        onClick={() => openNode(node)}
                        onMouseEnter={() => setHoveredId(node.id)}
                        onMouseLeave={() => setHoveredId((id) => (id === node.id ? null : id))}
                        onFocus={() => setHoveredId(node.id)}
                        onBlur={() => setHoveredId((id) => (id === node.id ? null : id))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openNode(node) }
                        }}
                      >
                        <circle r={r + 5} className="fill-none stroke-ring stroke-2 opacity-0 focus:opacity-100" />
                        <circle
                          r={r}
                          className={cn(active ? 'fill-foreground stroke-foreground' : 'stroke-border')}
                          style={active ? undefined : { fill: effectiveSettings.groupColors ? folderColor(node.folder_name) : 'hsl(var(--card))' }}
                          strokeWidth={active ? 2.5 : 1.5}
                        />
                        {active ? <circle r={4} className="fill-background" /> : null}
                        {effectiveSettings.showLabels && (
                          <text y={r + 16} textAnchor="middle" className="fill-foreground text-[11px]" style={{ pointerEvents: 'none', userSelect: 'none' }}>
                            {short}
                          </text>
                        )}
                        <title>{label}{node.folder_name ? `\nFolder: ${node.folder_name}` : '\nVault root'}</title>
                      </g>
                    )
                  })}
                </g>
              </g>
            </svg>
          </div>
        )}
      </div>
      <footer className="flex flex-none flex-wrap items-center gap-3 border-t border-border px-4 py-2 text-[11px] text-muted-foreground sm:px-5">
        <span className="inline-flex items-center gap-1"><span className="inline-block size-2 rounded-full bg-primary" />Reference</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block size-2 rounded-full bg-muted-foreground" />Related</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block size-2 rounded-full bg-destructive" />Depends on</span>
        <span className="ml-auto">Tip: drag nodes, scroll/pinch to zoom is browser-dependent; use Fit/Center. Tab + Enter opens nodes.</span>
      </footer>
    </section>
  )
}
