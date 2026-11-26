import { API_BASE, apiRequest, clearCsrfCookie, getCsrfToken } from '../src/api.js'

export function login({ username, password }) {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: { username, password },
    fallbackMessage: 'Login failed',
  })
}

export function register({ username, email, name, password }) {
  return apiRequest('/auth/register', {
    method: 'POST',
    body: { username, email, name, password },
    fallbackMessage: 'Registration failed',
  })
}

export function getCurrentUser() {
  return apiRequest('/auth/users', {
    fallbackMessage: 'Could not load your account.',
  }).then((users) => (Array.isArray(users) ? users[0] ?? null : null))
}

export function getMe() {
  return apiRequest('/auth/me', { fallbackMessage: 'Could not load your profile.' })
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

export function forgotPassword(email) {
  return apiRequest('/auth/forgot-password', {
    method: 'POST',
    body: { email },
    fallbackMessage: 'Could not send a reset link.',
  })
}

export function resetPassword(token, newPassword) {
  return apiRequest('/auth/reset-password', {
    method: 'POST',
    body: { token, new_password: newPassword },
    fallbackMessage: 'Could not reset your password.',
  })
}

export function verifyEmail(token) {
  return apiRequest('/auth/verify-email', {
    method: 'POST',
    body: { token },
    fallbackMessage: 'Could not verify your email.',
  })
}

export function resendVerification() {
  return apiRequest('/auth/resend-verification', {
    method: 'POST',
    body: {},
    fallbackMessage: 'Could not resend the verification email.',
  })
}

export async function uploadAvatar(file) {
  const form = new FormData()
  form.append('file', file)

  let res
  try {
    res = await fetch(`${API_BASE}/auth/me/avatar`, {
      method: 'POST',
      credentials: 'include',
      headers: getCsrfToken() ? { 'X-CSRF-Token': getCsrfToken() } : {},
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

/** Cookies are set by the server; the client only keeps the readable CSRF cookie. */
export function storeSession(_session) {
  // no-op: HttpOnly cookies are managed by the backend
}

export async function logout() {
  try {
    await apiRequest('/auth/logout', {
      method: 'POST',
      body: { everywhere: false },
      fallbackMessage: 'Could not log out.',
    })
  } finally {
    clearCsrfCookie()
  }
}

export function clearSession() {
  clearCsrfCookie()
}
