import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthLayout from './components/AuthLayout.jsx'
import AuthLink from './components/AuthLink.jsx'
import FormError from '@/components/shared/FormError'
import { useToast } from '@/components/shared/ToastProvider'
import SubmitButton from './components/SubmitButton.jsx'
import TextField from './components/TextField.jsx'
import { forgotPassword } from './api.js'
import { validateEmail } from './validation.js'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const toast = useToast()

  async function handleSubmit(event) {
    event.preventDefault()
    const message = validateEmail(email)
    setFieldError(message)
    if (message) return

    setLoading(true)
    setError('')
    try {
      await forgotPassword(email.trim())
      toast.success('If that address exists, a reset link has been sent.')
      navigate('/login')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      description="Enter your email and we will send you a reset link."
      footer={<AuthLink to="/login">Back to login</AuthLink>}
    >
      <form className="grid gap-4 pt-2" onSubmit={handleSubmit} noValidate>
        <FormError>{error}</FormError>
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value)
            if (fieldError) setFieldError('')
          }}
          onBlur={(event) => setFieldError(validateEmail(event.target.value))}
          error={fieldError}
          disabled={loading}
          autoFocus
        />
        <SubmitButton loading={loading} loadingLabel="Sending…">
          Send reset link
        </SubmitButton>
      </form>
    </AuthLayout>
  )
}
