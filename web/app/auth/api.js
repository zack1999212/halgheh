import { apiRequest, clearToken, setToken } from '../src/api.js'

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

export function storeSession(accessToken) {
  setToken(accessToken)
}

export function clearSession() {
  clearToken()
}
