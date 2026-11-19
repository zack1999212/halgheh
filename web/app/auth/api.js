import { API_BASE, apiRequest, clearToken, getToken, setToken } from '../src/api.js'

export function login({ username, password }) {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: { username, password },
    fallbackMessage: 'Login failed',
  })
}

export function register({ username, name, password }) {
  return apiRequest('/auth/register', {
    method: 'POST',
    body: { username, name, password },
    fallbackMessage: 'Registration failed',
  })
}

/**
 * The only user endpoint is GET /auth/users, which returns the current user
 * for an authenticated caller. The schema exposes id, username, name and
 * created_at — there is no email field.
 */
export async function getCurrentUser() {
  const users = await apiRequest('/auth/users', {
    fallbackMessage: 'Could not load your account.',
  })
  return Array.isArray(users) ? users[0] ?? null : null
}

export function getMe() {
  return apiRequest('/auth/me', {
    fallbackMessage: 'Could not load your profile.',
  })
}

export function updateProfile(payload) {
  return apiRequest('/auth/me', {
    method: 'PATCH',
    body: payload,
    fallbackMessage: 'Could not update your profile.',
  })
}

export function changePassword(payload) {
  return apiRequest('/auth/me/password', {
    method: 'POST',
    body: payload,
    fallbackMessage: 'Could not change your password.',
  })
}

export async function uploadAvatar(file) {
  const token = getToken()
  const form = new FormData()
  form.append('file', file)

  let res
  try {
    res = await fetch(`${API_BASE}/auth/me/avatar`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    })
  } catch {
    const err = new Error('Could not reach the server. Check your connection and try again.')
    err.status = 0
    throw err
  }

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = data?.detail
    let message = 'Could not upload profile picture.'
    if (typeof detail === 'string' && detail.trim()) message = detail
    else if (Array.isArray(detail)) {
      const msgs = detail.map((i) => (i && typeof i.msg === 'string' ? i.msg : null)).filter(Boolean)
      if (msgs.length) message = msgs.join(' ')
    }
    const err = new Error(message)
    err.status = res.status
    throw err
  }
  return data
}

export function storeSession(accessToken) {
  setToken(accessToken)
}

export function clearSession() {
  clearToken()
}
