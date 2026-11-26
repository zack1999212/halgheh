import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { LoaderCircle } from 'lucide-react'
import AuthLayout from './components/AuthLayout.jsx'
import FormError from '@/components/shared/FormError'
import { verifyEmail } from './api.js'

export default function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    if (!token) {
      setStatus('error')
      setMessage('This verification link is missing its token.')
      return undefined
    }
    verifyEmail(token)
      .then(() => active && setStatus('success'))
      .catch((err) => {
        if (!active) return
        setStatus('error')
        setMessage(err.message || 'Could not verify this link.')
      })
    return () => {
      active = false
    }
  }, [token])

  return (
    <AuthLayout
      title="Email verification"
      description="Confirming your address…"
      footer={
        <Link to="/home" className="font-medium underline-offset-4 hover:underline">
          Continue to your workspace
        </Link>
      }
    >
      {status === 'loading' && (
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground" role="status">
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          Verifying…
        </p>
      )}
      {status === 'success' && (
        <p className="text-[13px]">Your email is verified. You can continue.</p>
      )}
      {status === 'error' && <FormError>{message}</FormError>}
    </AuthLayout>
  )
}
