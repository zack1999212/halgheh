// Limits mirror the backend schemas in service/auth/schemas.py.

export function validateUsername(value, { required = true } = {}) {
  const username = value.trim()
  if (!username) {
    return required ? 'Please enter your username.' : ''
  }
  if (username.length > 64) {
    return 'Username must be 64 characters or fewer.'
  }
  return ''
}

export function validatePassword(value) {
  if (!value) {
    return 'Please enter your password.'
  }
  if (value.length > 128) {
    return 'Password must be 128 characters or fewer.'
  }
  return ''
}

export function validateName(value) {
  if (value.trim().length > 128) {
    return 'Name must be 128 characters or fewer.'
  }
  return ''
}
