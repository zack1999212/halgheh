/**
 * Centralized event category mapping — the single source of truth for
 * category identifiers, labels, and colors across all Calendar views.
 *
 * Colors: soft pastel background, stronger accent (left border), dark text.
 * Unknown or missing values safely fall back to "other".
 */

export const DEFAULT_CATEGORY = 'other'

export const CATEGORIES = [
  { id: 'work', label: 'Work', background: '#E8F0FE', accent: '#4285F4', text: '#172554' },
  { id: 'personal', label: 'Personal', background: '#E5F4EA', accent: '#299D5B', text: '#14532D' },
  { id: 'meeting', label: 'Meeting', background: '#FFF0DF', accent: '#E58A26', text: '#78350F' },
  { id: 'focus', label: 'Focus', background: '#F0EAFE', accent: '#8656D9', text: '#4C1D95' },
  { id: 'important', label: 'Important', background: '#FCE8EB', accent: '#D94B62', text: '#881337' },
  { id: 'other', label: 'Other', background: '#ECEFF1', accent: '#64748B', text: '#334155' },
]

const CATEGORY_MAP = new Map(CATEGORIES.map((category) => [category.id, category]))

export function categoryOf(value) {
  return CATEGORY_MAP.get(value) ?? CATEGORY_MAP.get(DEFAULT_CATEGORY)
}

export function categoryLabel(value) {
  return categoryOf(value).label
}

/**
 * Inline CSS custom properties consumed by the event card styles in
 * calendar.css (`--evc-bg`, `--evc-accent`, `--evc-text`, with monochrome
 * fallbacks for events that carry no category).
 */
export function categoryStyleVars(value) {
  const category = categoryOf(value)
  return {
    '--evc-bg': category.background,
    '--evc-accent': category.accent,
    '--evc-text': category.text,
  }
}
