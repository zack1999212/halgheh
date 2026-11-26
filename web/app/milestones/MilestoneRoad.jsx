import { Check } from 'lucide-react'

const STEP_GAP = 190
const START_X = 100
const BASE_Y = 170
const TOP_Y = 74
const BOTTOM_Y = 266
const NODE_SIZE = 108
const CORNER = 30

const ARROW_STATES = ['done', 'current', 'pending']

/**
 * The winding roadmap from reference/milestone.webp: a thin rail across the
 * middle and a rounded pointer that climbs above / dips below it for every
 * step. The road grows horizontally with the number of steps.
 */
export default function MilestoneRoad({ milestone, onStepClick }) {
  const steps = milestone?.steps || []
  const startX = START_X
  const finishX = startX + (steps.length + 1) * STEP_GAP
  const railStart = startX + NODE_SIZE / 2
  const railEnd = finishX - NODE_SIZE / 2 - 8
  const width = finishX + START_X
  const height = 340

  let previousX = railStart
  const segments = steps.map((step, index) => {
    const x = startX + (index + 1) * STEP_GAP
    const nodeY = index % 2 === 0 ? TOP_Y : BOTTOM_Y
    const turnY = nodeY + (nodeY === TOP_Y ? CORNER : -CORNER)
    const path = [
      `M ${previousX} ${BASE_Y}`,
      `L ${previousX} ${turnY}`,
      `Q ${previousX} ${nodeY} ${previousX + CORNER} ${nodeY}`,
      `L ${x - CORNER} ${nodeY}`,
      `Q ${x} ${nodeY} ${x} ${turnY}`,
      `L ${x} ${BASE_Y}`,
    ].join(' ')
    const state =
      step.is_completed || milestone.status === 'completed'
        ? 'done'
        : milestone.current_step_id === step.id
          ? 'current'
          : 'pending'
    previousX = x
    return { step, x, nodeY, path, state, index }
  })

  return (
    <div className="milestone-road-scroll">
      <div className="milestone-road" style={{ width, height }}>
        <svg
          className="milestone-road-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden="true"
        >
          <defs>
            {ARROW_STATES.map((state) => (
              <marker
                key={state}
                id={`milestone-arrow-${state}`}
                markerWidth="16"
                markerHeight="16"
                refX="13"
                refY="8"
                viewBox="0 0 16 16"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path
                  d="M 2 2 L 14 8 L 2 14 z"
                  className={`milestone-arrow-head milestone-arrow-head--${state}`}
                />
              </marker>
            ))}
          </defs>

          <line
            x1={railStart}
            y1={BASE_Y}
            x2={railEnd}
            y2={BASE_Y}
            className="milestone-rail"
          />

          {segments.map((segment) => (
            <g key={segment.step.id}>
              <path
                d={segment.path}
                className={`milestone-turn milestone-turn--${segment.state}`}
                markerEnd={`url(#milestone-arrow-${segment.state})`}
              />
              <path d={segment.path} className="milestone-turn-gloss" />
            </g>
          ))}

          <path
            d={`M ${previousX} ${BASE_Y} L ${railEnd} ${BASE_Y}`}
            className="milestone-turn milestone-turn--done"
            markerEnd="url(#milestone-arrow-done)"
          />
          <path
            d={`M ${previousX} ${BASE_Y} L ${railEnd} ${BASE_Y}`}
            className="milestone-turn-gloss"
          />
        </svg>

        <div
          className="milestone-endpoint milestone-endpoint--start"
          style={{ left: startX - NODE_SIZE / 2, top: BASE_Y - NODE_SIZE / 2 }}
        >
          Start
        </div>

        {segments.map((segment) => (
          <button
            key={segment.step.id}
            type="button"
            className={`milestone-node milestone-node--${segment.state}`}
            style={{
              left: segment.x - NODE_SIZE / 2,
              top: segment.nodeY - NODE_SIZE / 2,
            }}
            onClick={() => onStepClick(segment.step)}
            aria-label={`Step ${segment.index + 1}: ${segment.step.title}. ${segment.step.completed_tasks} of ${segment.step.total_tasks} tasks done.`}
          >
            <span className="milestone-node-number">
              {String(segment.index + 1).padStart(2, '0')}
            </span>
            <span className="milestone-node-title">{segment.step.title}</span>
            {segment.step.is_completed && (
              <span className="milestone-node-check" aria-hidden="true">
                <Check size={12} strokeWidth={3} />
              </span>
            )}
          </button>
        ))}

        <div
          className="milestone-endpoint milestone-endpoint--finish"
          style={{ left: finishX - NODE_SIZE / 2, top: BASE_Y - NODE_SIZE / 2 }}
        >
          Finish
        </div>
      </div>
    </div>
  )
}
