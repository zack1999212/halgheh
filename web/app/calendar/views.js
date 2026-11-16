/** FullCalendar view types used by the Halgheh calendar, in toolbar order. */
export const CALENDAR_VIEWS = [
  { id: 'dayGridMonth', label: 'Month', period: 'month' },
  { id: 'timeGridWeek', label: 'Week', period: 'week' },
  { id: 'timeGridDay', label: 'Day', period: 'day' },
  { id: 'listMonth', label: 'Agenda', period: 'month' },
]

export const DEFAULT_VIEW = 'dayGridMonth'

export function periodName(viewId) {
  return CALENDAR_VIEWS.find((view) => view.id === viewId)?.period || 'month'
}
