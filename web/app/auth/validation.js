// Mirrors service/auth/schemas.py and security.py.

export function validateUsername(value, { required = true } = {}) {
  const username = value.trim().toLowerCase()
  if (!username) return required ? 'Please enter your username.' : ''
  if (username.length < 3) return 'Username must be at least 3 characters.'
  if (username.length > 64) return 'Username must be 64 characters or fewer.'
  if (!/^[a-z0-9._-]+$/.test(username)) {
    return 'Use only letters, numbers, ".", "_" and "-".'
  }
  return ''
}

export function validateEmail(value) {
  const email = value.trim()
  if (!email) return 'Please enter your email address.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Enter a valid email address.'
  }
  return ''
}

export function validatePassword(value) {
  if (!value) return 'Please enter your password.'
  if (value.length < 10) return 'Password must be at least 10 characters.'
  if (new TextEncoder().encode(value).length > 72) {
    return 'Password must be 72 bytes or fewer.'
  }
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return 'Include at least one letter and one number.'
  }
  return ''
}

/** Login accepts legacy usernames; only presence is checked client-side. */
export function validateLoginUsername(value) {
  return value.trim() ? '' : 'Please enter your username.'
}

/** Login only checks presence — legacy accounts may have older passwords. */
export function validateLoginPassword(value) {
  return value ? '' : 'Please enter your password.'
}

export function validateConfirmPassword(password, confirm) {
  if (!confirm) return 'Please confirm your password.'
  if (password !== confirm) return 'Passwords do not match.'
  return ''
}

export function validateName(value) {
  if (value.trim().length > 128) return 'Name must be 128 characters or fewer.'
  return ''
}

/** 0..4 strength score used by the registration meter. */
export function passwordStrength(value) {
  if (!value) return 0
  let score = 0
  if (value.length >= 10) score += 1
  if (value.length >= 14) score += 1
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score += 1
  return Math.min(score, 4)
}
