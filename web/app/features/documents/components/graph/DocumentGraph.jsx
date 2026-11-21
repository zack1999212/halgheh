import { useEffect, useMemo, useState } from 'react'
import { Network } from 'lucide-react'
import EmptyState from '@/components/shared/EmptyState.jsx'
import ErrorState from '@/components/shared/ErrorState.jsx'
import { cn } from '@/lib/utils'
import { getDocumentGraph } from '../../api/client.js'

const WIDTH = 900
const HEIGHT = 560
const PADDING = 80
// Mirrors the backend page limit: larger workspaces are truncated server-side
// and the response carries `truncated`, which we surface to the user (L2).
const NODE_LIMIT = 10000

function computeLayout(nodes) {
  if (!nodes.length) return new Map()
  const cx = WIDTH / 2
  const cy = HEIGHT / 2
  const radius = Math.max(120, Math.min(WIDTH, HEIGHT) / 2 - PADDING)
  const positions = new Map()
  if (nodes.length === 1) {
    positions.set(nodes[0].id, { x: cx, y: cy })
    return positions
  }
  nodes.forEach((node, index) => {
    const angle = (Math.PI * 2 * index) / nodes.length - Math.PI / 2
    positions.set(node.id, {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    })
  })
  return positions
}

// Edge classes use theme tokens only (no arbitrary colors, L3).
const EDGE_CLASSES = {
  related: 'stroke-muted-foreground',
  reference: 'stroke-primary',
  depends_on: 'stroke-destructive',
}

/**
 * Workspace document graph rendered as SVG (no external graph library).
 *
 * Shows accessible, non-deleted documents and their links. Nodes are
 * keyboard-focusable and activate navigation on Enter/Space/click.
 */
export default function DocumentGraph({ workspaceId, activeDocumentId, onOpenDocument }) {
  const [state, setState] = useState({ status: 'idle', data: null, error: null })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!workspaceId) {
      setState({ status: 'idle', data: null, error: null })
      return undefined
    }
    let cancelled = false
    setState({ status: 'loading', data: null, error: null })
    getDocumentGraph(workspaceId)
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data, error: null })
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'error', data: null, error })
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId, reloadKey])

  const nodes = state.data?.nodes || []
  const edges = state.data?.edges || []
  const positions = useMemo(() => computeLayout(nodes), [nodes])

  if (!workspaceId) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-[13px] text-muted-foreground">Select a workspace to view its graph.</p>
      </div>
    )
  }

  if (state.status === 'loading') {
    return (
      <div className="grid h-full place-items-center p-6" role="status" aria-label="Loading graph">
        <p className="text-[13px] text-muted-foreground">Loading document graph…</p>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <ErrorState
          title="Graph could not be loaded"
          message={state.error?.message}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      </div>
    )
  }

  if (!nodes.length) {
    return (
      <EmptyState
        className="h-full justify-center"
        icon={Network}
        title="No documents to graph"
        description="Create documents and links in this workspace to see relationships here."
      />
    )
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Document graph">
      <header className="flex flex-none flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Document graph</h2>
          <p className="text-[12.5px] text-muted-foreground">
            {nodes.length} documents · {edges.length} links. Accessible, non-deleted items only.
          </p>
          {state.data?.truncated && (
            <p
              role="status"
              className="mt-1 flex items-center gap-1.5 text-[12.5px] text-destructive"
            >
              This workspace has more than {NODE_LIMIT.toLocaleString()} documents, so only
              the first {NODE_LIMIT.toLocaleString()} are graphed and relationships to the
              rest are missing.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><span className="inline-block size-2 rounded-full bg-primary" />Reference</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block size-2 rounded-full bg-muted-foreground" />Related</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block size-2 rounded-full bg-destructive" />Depends on</span>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-5 pb-6">
        <div className="rounded-lg border border-border bg-card p-2">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-auto w-full min-w-[480px]"
            role="group"
            aria-label="Document relationship graph"
          >
            <g aria-label="Links">
              {edges.map((edge) => {
                const from = positions.get(edge.source_document_id)
                const to = positions.get(edge.target_document_id)
                if (!from || !to) return null
                const strokeClass =
                  EDGE_CLASSES[edge.link_type] || 'stroke-muted-foreground'
                return (
                  <line
                    key={edge.id}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    className={cn('transition-colors', strokeClass)}
                    strokeOpacity="0.45"
                    strokeWidth="2"
                  />
                )
              })}
            </g>
            <g aria-label="Documents">
              {nodes.map((node) => {
                const pos = positions.get(node.id)
                if (!pos) return null
                const active = node.id === activeDocumentId
                const label = node.title || `Document #${node.id}`
                const short = label.length > 22 ? `${label.slice(0, 21)}…` : label
                return (
                  <g
                    key={node.id}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open document ${label}${node.folder_name ? ` in ${node.folder_name}` : ''}`}
                    className="group cursor-pointer outline-none"
                    onClick={() => onOpenDocument(node.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onOpenDocument(node.id)
                      }
                    }}
                  >
                    {/* Keyboard focus indicator (M4): box-shadow/ring does not
                        render on SVG shapes, so a stroke ring in the theme
                        `ring` color is drawn around the node on focus-visible.
                        The default outline stays suppressed because this ring
                        is the visible replacement. */}
                    <circle
                      r={(active ? 28 : 24) + 5}
                      aria-hidden="true"
                      className="fill-none stroke-ring stroke-2 opacity-0 transition-opacity group-focus-visible:opacity-100"
                    />
                    <circle
                      r={active ? 28 : 24}
                      className={cn(
                        'transition-colors',
                        active
                          ? 'fill-foreground stroke-foreground'
                          : 'fill-background stroke-border',
                      )}
                      strokeWidth={active ? 2.5 : 1.5}
                    />
                    <title>
                      {label}
                      {node.folder_name ? `\nFolder: ${node.folder_name}` : '\nWorkspace root'}
                    </title>
                    <text
                      y={42}
                      textAnchor="middle"
                      className="fill-foreground text-[11px]"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {short}
                    </text>
                    {active ? (
                      <circle r="4" className="fill-background" />
                    ) : null}
                  </g>
                )
              })}
            </g>
          </svg>
        </div>
        <p className="mt-3 text-[12px] text-muted-foreground">
          Tip: use Tab to focus nodes and Enter/Space to open a document. Edge colors indicate relationship type.
        </p>
      </div>
    </section>
  )
}
