import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import AuthLayout from './components/AuthLayout.jsx'
import AuthLink from './components/AuthLink.jsx'
import FormError from '@/components/shared/FormError'
import { useToast } from '@/components/shared/ToastProvider'
import PasswordField from './components/PasswordField.jsx'
import SubmitButton from './components/SubmitButton.jsx'
import TextField from './components/TextField.jsx'
import { login } from './api.js'
import { validateLoginPassword, validateLoginUsername } from './validation.js'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const toast = useToast()

  useEffect(() => {
    if (searchParams.get('expired') === '1') {
      toast.info('Your session expired. Please log in again.')
    }
  }, [searchParams, toast])

  function validateField(field, value) {
    const message =
      field === 'username' ? validateLoginUsername(value) : validateLoginPassword(value)
    setFieldErrors((current) => ({ ...current, [field]: message }))
  }

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
      username: validateLoginUsername(username),
      password: validateLoginPassword(password),
    }
    setFieldErrors(nextErrors)
    setError('')
    if (nextErrors.username || nextErrors.password) return

    setLoading(true)
    try {
      await login({ username: username.trim(), password })
      navigate(location.state?.from || '/home', { replace: true })
    } catch (err) {
      setError(
        err.status === 429
          ? 'Too many attempts. Please wait a moment and try again.'
          : err.message,
      )
    } finally {
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
          onBlur={(e) => validateField('username', e.target.value)}
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
          onBlur={(e) => validateField('password', e.target.value)}
          error={fieldErrors.password}
          disabled={loading}
        />

        <div className="-mt-1 text-right">
          <AuthLink to="/forgot-password" className="text-[12.5px]">
            Forgot password?
          </AuthLink>
        </div>

        <SubmitButton loading={loading} loadingLabel="Logging in…">
          Login
        </SubmitButton>
      </form>
    </AuthLayout>
  )
}
