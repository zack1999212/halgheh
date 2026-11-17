const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001'
const TOKEN_KEY = 'token'

/** Error carrying the HTTP status so callers can react to 401s. */
export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

/**
 * FastAPI reports errors as `detail`, which is a string for raised
 * HTTPExceptions and an array of validation objects for 422 responses.
 */
function readDetail(detail) {
  if (typeof detail === 'string' && detail.trim()) {
    return detail
  }
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => (item && typeof item.msg === 'string' ? item.msg : null))
      .filter(Boolean)
    if (messages.length) {
      return messages.join(' ')
    }
  }
  return null
}

/**
 * Single request helper shared by every feature. Attaches the bearer token
 * that the existing login flow stores under `localStorage.token`.
 */
export async function apiRequest(
  path,
  {
    method = 'GET',
    body,
    fallbackMessage = 'Something went wrong. Please try again.',
    signal,
  } = {},
) {
  const headers = {}
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  const token = getToken()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  let res
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err
    }
    throw new ApiError(
      'Could not reach the server. Check your connection and try again.',
      0,
    )
  }

  if (res.status === 204) {
    return null
  }

  const data = await res.json().catch(() => null)

  if (!res.ok) {
    throw new ApiError(readDetail(data?.detail) || fallbackMessage, res.status)
  }

  return data
}
