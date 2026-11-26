export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001'
const CSRF_COOKIE = 'halgheh_csrf'
const CSRF_HEADER = 'X-CSRF-Token'
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** Error carrying the HTTP status so callers can react to 401s. */
export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** The CSRF cookie is intentionally readable by JavaScript (double submit). */
export function getCsrfToken() {
  const prefix = `${CSRF_COOKIE}=`
  const entry = document.cookie.split('; ').find((item) => item.startsWith(prefix))
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : ''
}

export function hasSessionHint() {
  return Boolean(getCsrfToken())
}

export function clearCsrfCookie() {
  document.cookie = `${CSRF_COOKIE}=; Max-Age=0; path=/; SameSite=Lax`
}

function notifySessionExpired() {
  window.dispatchEvent(new CustomEvent('halgheh:session-expired'))
}

/**
 * FastAPI reports errors as `detail`, a string or a list of validation errors.
 */
function readDetail(detail) {
  if (typeof detail === 'string' && detail.trim()) {
    return detail
  }
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => item && typeof item.msg === 'string' ? item.msg : null)
      .filter(Boolean)
    if (messages.length) return messages.join(' ')
  }
  return null
}

async function refreshSession() {
  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: getCsrfToken() ? { [CSRF_HEADER]: getCsrfToken() } : {},
  })
  if (!response.ok) {
    clearCsrfCookie()
    return false
  }
  const data = await response.json().catch(() => null)
  return Boolean(data?.csrf_token)
}

/**
 * Shared request helper. Auth is cookie-based (HttpOnly access + refresh),
 * with a readable CSRF cookie echoed back in a header on mutating calls.
 * A 401 triggers one silent refresh + retry before surfacing an error.
 */
export async function apiRequest(
  path,
  {
    method = 'GET',
    body,
    fallbackMessage = 'Something went wrong. Please try again.',
    signal,
    _retried = false,
  } = {},
) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const csrf = getCsrfToken()
  if (csrf && (MUTATING.has(method.toUpperCase()) || method.toUpperCase() === 'GET')) {
    headers[CSRF_HEADER] = csrf
  }

  let res
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'include',
      signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(
      'Could not reach the server. Check your connection and try again.',
      0,
    )
  }

  if (res.status === 401 && !_retried && !path.startsWith('/auth/')) {
    const refreshed = await refreshSession()
    if (refreshed) {
      return apiRequest(path, {
        method,
        body,
        fallbackMessage,
        signal,
        _retried: true,
      })
    }
    notifySessionExpired()
  }

  if (res.status === 204) return null

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ApiError(readDetail(data?.detail) || fallbackMessage, res.status)
  }
  return data
}
