/**
 * Time-grid guide lines (Week and Day views).
 *
 * Draws faint horizontal hairlines that connect every timed event's start and
 * end edges to the hour axis on the left, so an event from 9:00 to 12:00
 * visually "points" at the 9am and 12pm labels. The lines are recomputed while
 * events are dragged or resized, because FullCalendar mutates the event
 * elements' inline styles during those gestures.
 *
 * The overlay lives inside `.fc-timegrid-body`, which contains both the hour
 * slots and the day columns, so positions measured against that element
 * already account for scroll and stay valid while the grid scrolls.
 */

const OVERLAY_CLASS = 'tg-guides-overlay'
const LINE_CLASS = 'tg-guide-line'

export function createTimeGridGuides(root) {
  let overlay = null
  let observer = null
  let frame = 0
  let lastSignature = ''

  function removeOverlay() {
    overlay?.remove()
    overlay = null
    // The next draw must repaint even with identical geometry: the overlay
    // element itself was destroyed with the previous view.
    lastSignature = ''
  }

  /** Returns the positioning context, or null when not in a time-grid view. */
  function ensureOverlay() {
    const timegridBody = root.querySelector('.fc-timegrid-body')
    if (!timegridBody) {
      removeOverlay()
      return null
    }
    if (!overlay || overlay.parentElement !== timegridBody) {
      removeOverlay()
      overlay = document.createElement('div')
      overlay.className = OVERLAY_CLASS
      overlay.setAttribute('aria-hidden', 'true')
      timegridBody.appendChild(overlay)
    }
    return timegridBody
  }

  function draw() {
    frame = 0
    const timegridBody = ensureOverlay()
    if (!timegridBody) {
      return
    }

    const base = timegridBody.getBoundingClientRect()
    // One line per distinct edge: "start" lines and "end" lines share the
    // drawing but keep the event's left edge so each line stops where its
    // event begins.
    const edges = new Map()
    for (const event of timegridBody.querySelectorAll('.fc-timegrid-event')) {
      const rect = event.getBoundingClientRect()
      if (rect.height <= 0) {
        continue
      }
      const top = Math.round(rect.top - base.top)
      const bottom = Math.round(rect.bottom - base.top)
      const left = Math.round(rect.left - base.left)
      edges.set(`t${top}`, { y: top, x: left })
      edges.set(`b${bottom}`, { y: bottom, x: left })
    }

    // Skip DOM writes when nothing moved: appending/removing children here
    // would otherwise re-trigger the observer on every resize tick.
    const signature = [...edges.keys()].join('|')
    if (signature === lastSignature) {
      return
    }
    lastSignature = signature

    const fragment = document.createDocumentFragment()
    for (const { y, x } of edges.values()) {
      const line = document.createElement('div')
      line.className = LINE_CLASS
      line.style.top = `${y}px`
      line.style.width = `${Math.max(x, 0)}px`
      fragment.appendChild(line)
    }
    overlay.replaceChildren(fragment)
  }

  /** Coalesces bursts of mutations (drag/resize reflows) into one repaint. */
  function schedule() {
    if (!frame) {
      frame = requestAnimationFrame(draw)
    }
  }

  function refresh() {
    schedule()
  }

  observer = new MutationObserver(schedule)
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['style'],
  })
  schedule()

  return {
    refresh,
    destroy() {
      observer.disconnect()
      if (frame) {
        cancelAnimationFrame(frame)
        frame = 0
      }
      removeOverlay()
      lastSignature = ''
    },
  }
}
