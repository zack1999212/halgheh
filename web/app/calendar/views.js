/** FullCalendar view types used by the Halgheh calendar, in toolbar order. */
export const CALENDAR_VIEWS = [
  { id: 'dayGridMonth', label: 'Month', period: 'month', type: 'dayGridMonth' },
  { id: 'timeGridWeek', label: 'Week', period: 'week', type: 'timeGridWeek' },
  { id: 'timeGridDay', label: 'Day', period: 'day', type: 'timeGridDay' },
  { id: 'listMonth', label: 'Agenda', period: 'month', type: 'listMonth' },
]

export const DEFAULT_VIEW = 'dayGridMonth'

export function viewDef(viewId) {
  return CALENDAR_VIEWS.find((view) => view.id === viewId) || null
}

export function periodName(viewId) {
  return viewDef(viewId)?.period || 'month'
}

export function fcViewType(viewId) {
  return viewDef(viewId)?.type || viewId
}
