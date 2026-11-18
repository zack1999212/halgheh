import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthLayout from './components/AuthLayout.jsx'
import AuthLink from './components/AuthLink.jsx'
import FormError from '@/components/shared/FormError'
import PasswordField from './components/PasswordField.jsx'
import SubmitButton from './components/SubmitButton.jsx'
import TextField from './components/TextField.jsx'
import { login, storeSession } from './api.js'
import { validatePassword, validateUsername } from './validation.js'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  function updateField(field, value) {
    if (field === 'username') setUsername(value)
    if (field === 'password') setPassword(value)
    if (fieldErrors[field]) {
      setFieldErrors((current) => ({ ...current, [field]: '' }))
    }
    if (error) setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()

    const nextErrors = {
      username: validateUsername(username),
      password: validatePassword(password),
    }
    setFieldErrors(nextErrors)
    setError('')

    if (nextErrors.username || nextErrors.password) {
      return
    }

    setLoading(true)
    try {
      const data = await login({ username: username.trim(), password })
      storeSession(data.access_token)
      navigate('/home')
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      description="Log in to your Halgheh workspace."
      footer={
        <>
          New to Halgheh? <AuthLink to="/register">Create an account</AuthLink>
        </>
      }
    >
      <form className="grid gap-4 pt-2" onSubmit={handleSubmit} noValidate>
        <FormError>{error}</FormError>

        <TextField
          label="Username"
          name="username"
          autoComplete="username"
          placeholder="your-username"
          value={username}
          onChange={(e) => updateField('username', e.target.value)}
          error={fieldErrors.username}
          disabled={loading}
          autoFocus
        />

        <PasswordField
          label="Password"
          name="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => updateField('password', e.target.value)}
          error={fieldErrors.password}
          disabled={loading}
        />

        <SubmitButton loading={loading} loadingLabel="Logging in…">
          Login
        </SubmitButton>
      </form>
    </AuthLayout>
  )
}
