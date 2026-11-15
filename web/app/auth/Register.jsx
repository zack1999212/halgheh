import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout from './components/AuthLayout.jsx'
import FormError from './components/FormError.jsx'
import PasswordField from './components/PasswordField.jsx'
import SubmitButton from './components/SubmitButton.jsx'
import TextField from './components/TextField.jsx'
import { register } from './api.js'
import {
  validateName,
  validatePassword,
  validateUsername,
} from './validation.js'

export default function Register() {
  const [username, setUsername] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  function updateField(field, value) {
    if (field === 'username') setUsername(value)
    if (field === 'name') setName(value)
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
      name: validateName(name),
      password: validatePassword(password),
    }
    setFieldErrors(nextErrors)
    setError('')

    if (nextErrors.username || nextErrors.name || nextErrors.password) {
      return
    }

    setLoading(true)
    try {
      await register({
        username: username.trim(),
        name: name.trim(),
        password,
      })
      navigate('/login')
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      description="Set up your Halgheh workspace in a few seconds."
      footer={
        <>
          Already have an account? <Link to="/login">Login</Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
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

        <TextField
          label="Name"
          optional
          name="name"
          autoComplete="name"
          placeholder="Your name"
          value={name}
          onChange={(e) => updateField('name', e.target.value)}
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
          error={fieldErrors.password}
          disabled={loading}
        />

        <SubmitButton loading={loading} loadingLabel="Creating account…">
          Create account
        </SubmitButton>
      </form>
    </AuthLayout>
  )
}
