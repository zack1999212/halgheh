import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthLayout from './components/AuthLayout.jsx'
import AuthLink from './components/AuthLink.jsx'
import FormError from '@/components/shared/FormError'
import { useToast } from '@/components/shared/ToastProvider'
import PasswordField from './components/PasswordField.jsx'
import PasswordStrength from './components/PasswordStrength.jsx'
import SubmitButton from './components/SubmitButton.jsx'
import TextField from './components/TextField.jsx'
import { register } from './api.js'
import {
  validateConfirmPassword,
  validateEmail,
  validateName,
  validatePassword,
  validateUsername,
} from './validation.js'

export default function Register() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const toast = useToast()

  const validators = {
    username: validateUsername,
    email: validateEmail,
    name: validateName,
    password: validatePassword,
    confirm: (value) => validateConfirmPassword(password, value),
  }

  function validateField(field, value) {
    setFieldErrors((current) => ({
      ...current,
      [field]: validators[field] ? validators[field](value) : '',
    }))
  }

  function updateField(field, value) {
    if (field === 'username') setUsername(value)
    if (field === 'email') setEmail(value)
    if (field === 'name') setName(value)
    if (field === 'password') setPassword(value)
    if (field === 'confirm') setConfirm(value)
    if (fieldErrors[field]) {
      setFieldErrors((current) => ({ ...current, [field]: '' }))
    }
    if (error) setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const nextErrors = {
      username: validateUsername(username),
      email: validateEmail(email),
      name: validateName(name),
      password: validatePassword(password),
      confirm: validateConfirmPassword(password, confirm),
    }
    setFieldErrors(nextErrors)
    setError('')
    if (Object.values(nextErrors).some(Boolean)) return

    setLoading(true)
    try {
      await register({
        username: username.trim(),
        email: email.trim(),
        name: name.trim(),
        password,
      })
      toast.success('Account created — check your email to verify it, then log in.')
      navigate('/login')
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
      title="Create your account"
      description="Set up your Halgheh workspace in a few seconds."
      footer={
        <>
          Already have an account? <AuthLink to="/login">Login</AuthLink>
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

        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => updateField('email', e.target.value)}
          onBlur={(e) => validateField('email', e.target.value)}
          error={fieldErrors.email}
          disabled={loading}
        />

        <TextField
          label="Name"
          optional
          name="name"
          autoComplete="name"
          placeholder="Your name"
          value={name}
          onChange={(e) => updateField('name', e.target.value)}
          onBlur={(e) => validateField('name', e.target.value)}
          error={fieldErrors.name}
          disabled={loading}
        />

        <PasswordField
          label="Password"
          name="password"
          autoComplete="new-password"
          placeholder="Choose a password"
          value={password}
          onChange={(e) => updateField('password', e.target.value)}
          onBlur={(e) => validateField('password', e.target.value)}
          error={fieldErrors.password}
          disabled={loading}
        />
        <PasswordStrength value={password} />

        <PasswordField
          label="Confirm password"
          name="confirm"
          autoComplete="new-password"
          placeholder="Repeat your password"
          value={confirm}
          onChange={(e) => updateField('confirm', e.target.value)}
          onBlur={(e) => validateField('confirm', e.target.value)}
          error={fieldErrors.confirm}
          disabled={loading}
        />

        <SubmitButton loading={loading} loadingLabel="Creating account…">
          Create account
        </SubmitButton>
      </form>
    </AuthLayout>
  )
}
