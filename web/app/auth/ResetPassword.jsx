import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import AuthLayout from './components/AuthLayout.jsx'
import AuthLink from './components/AuthLink.jsx'
import FormError from '@/components/shared/FormError'
import { useToast } from '@/components/shared/ToastProvider'
import PasswordField from './components/PasswordField.jsx'
import PasswordStrength from './components/PasswordStrength.jsx'
import SubmitButton from './components/SubmitButton.jsx'
import { resetPassword } from './api.js'
import {
  validateConfirmPassword,
  validatePassword,
} from './validation.js'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const navigate = useNavigate()
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    const next = {
      password: validatePassword(password),
      confirm: validateConfirmPassword(password, confirm),
    }
    setErrors(next)
    if (next.password || next.confirm) return
    if (!token) {
      setError('This reset link is missing its token. Request a new one.')
      return
    }

    setLoading(true)
    setError('')
    try {
      await resetPassword(token, password)
      toast.success('Password reset. Please log in with your new password.')
      navigate('/login')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Choose a new password"
      description="Use at least 10 characters with a letter and a number."
      footer={<AuthLink to="/login">Back to login</AuthLink>}
    >
      <form className="grid gap-4 pt-2" onSubmit={handleSubmit} noValidate>
        <FormError>{error}</FormError>
        <PasswordField
          label="New password"
          name="new-password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
          disabled={loading}
          autoFocus
        />
        <PasswordStrength value={password} />
        <PasswordField
          label="Confirm password"
          name="confirm"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          error={errors.confirm}
          disabled={loading}
        />
        <SubmitButton loading={loading} loadingLabel="Resetting…">
          Reset password
        </SubmitButton>
      </form>
    </AuthLayout>
  )
}
