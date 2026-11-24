import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import DialogShell from '@/components/shared/DialogShell'
import FormError from '@/components/shared/FormError'
import FormField, { fieldInputClass } from '@/components/shared/FormField'
import { useToast } from '@/components/shared/ToastProvider'
import { createWorkspaceInvitation } from '../api.js'
import { useWorkspaceTheme } from '../hooks/useWorkspaceTheme.js'
import { INVITABLE_ROLES, roleLabel } from './InvitationBadges.jsx'

/**
 * Owner-only dialog inviting an existing user to a shared workspace by
 * username. Role selection is limited to admin/editor/viewer — ownership
 * cannot be granted through an invitation. Backend validation errors
 * (unknown user, self-invite, existing member, duplicate pending invite)
 * are surfaced verbatim through FormError.
 */
export default function InviteToWorkspaceDialog({
  open,
  workspace,
  onClose,
  onInvited,
  onUnauthorized,
}) {
  const toast = useToast()
  const { theme } = useWorkspaceTheme()
  const [username, setUsername] = useState('')
  const [role, setRole] = useState('viewer')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [usernameError, setUsernameError] = useState('')

  function reset() {
    setUsername('')
    setRole('viewer')
    setError('')
    setUsernameError('')
  }

  function handleClose() {
    if (busy) return
    reset()
    onClose()
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy || !workspace?.id) return
    const trimmed = username.trim()
    if (!trimmed) {
      setUsernameError('Enter a username to invite.')
      return
    }
    if (!INVITABLE_ROLES.includes(role)) {
      setError('Choose a valid role for the invitation.')
      return
    }
    setBusy(true)
    setError('')
    setUsernameError('')
    try {
      await createWorkspaceInvitation(workspace.id, { username: trimmed, role })
      toast.success(`Invitation sent to ${trimmed}.`)
      reset()
      onClose()
      onInvited?.()
    } catch (err) {
      if (err?.status === 401) {
        onUnauthorized?.()
        return
      }
      setError(err?.message || 'Could not send the invitation.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogShell
      open={open}
      theme={theme}
      contentClassName="ws-dialog-scope"
      title="Invite to workspace"
      description={
        workspace?.name
          ? `Invite an existing Halgheh user to “${workspace.name}”.`
          : 'Invite an existing Halgheh user to this workspace.'
      }
      onClose={handleClose}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            className="h-9"
            onClick={handleClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="invite-workspace-form"
            className="h-9"
            disabled={busy || !username.trim()}
          >
            {busy ? 'Sending…' : 'Invite'}
          </Button>
        </>
      }
    >
      <form id="invite-workspace-form" className="grid gap-4" onSubmit={handleSubmit}>
        <FormError>{error}</FormError>
        <FormField
          id="invite-workspace-username"
          label="Username"
          error={usernameError}
          hint="The user must already have a Halgheh account."
        >
          {(props) => (
            <Input
              {...props}
              className={fieldInputClass}
              value={username}
              onChange={(event) => {
                setUsername(event.target.value)
                if (usernameError) setUsernameError('')
              }}
              placeholder="username"
              maxLength={255}
              autoComplete="off"
              autoFocus
            />
          )}
        </FormField>
        <FormField id="invite-workspace-role" label="Role">
          {(props) => (
            <Select value={role} onValueChange={setRole} disabled={busy}>
              <SelectTrigger {...props} className={`${fieldInputClass} w-full`}>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {INVITABLE_ROLES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {roleLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      </form>
    </DialogShell>
  )
}