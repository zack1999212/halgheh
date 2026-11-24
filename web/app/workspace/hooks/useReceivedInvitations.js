import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '@/components/shared/ToastProvider'
import {
  acceptWorkspaceInvitation,
  declineWorkspaceInvitation,
  listReceivedWorkspaceInvitations,
} from '../api.js'

/**
 * Owns the invitations received by the current user: the list, the pending
 * count for the header entry point, and accept/decline actions. Loading
 * happens once on mount, on demand when the selector or dialog opens, and
 * after failed actions so expired/revoked invitations stay in sync — no
 * polling. Accepting notifies the caller so the global workspace list can
 * be reloaded without changing the active selection.
 */
export default function useReceivedInvitations({ onUnauthorized, onAccepted } = {}) {
  const toast = useToast()
  const unauthorizedRef = useRef(onUnauthorized)
  const acceptedRef = useRef(onAccepted)
  useEffect(() => {
    unauthorizedRef.current = onUnauthorized
    acceptedRef.current = onAccepted
  }, [onUnauthorized, onAccepted])

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const refresh = useCallback(async ({ showLoading = false } = {}) => {
    if (showLoading) setLoading(true)
    setError('')
    try {
      const list = await listReceivedWorkspaceInvitations()
      setItems(Array.isArray(list) ? list : [])
    } catch (err) {
      if (err?.status === 401) {
        unauthorizedRef.current?.()
        return
      }
      setError(err?.message || 'Could not load your invitations.')
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh({ showLoading: true })
  }, [refresh])

  const accept = useCallback(
    async (invitation) => {
      if (!invitation || busyId != null) return
      setBusyId(invitation.id)
      try {
        const updated = await acceptWorkspaceInvitation(invitation.id)
        setItems((current) =>
          current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
        )
        toast.success(`You joined ${updated.workspace_name || invitation.workspace_name || 'the workspace'}.`)
        acceptedRef.current?.(updated)
      } catch (err) {
        if (err?.status === 401) {
          unauthorizedRef.current?.()
          return
        }
        toast.error(err?.message || 'Could not accept the invitation.')
        refresh()
      } finally {
        setBusyId(null)
      }
    },
    [busyId, refresh, toast],
  )

  const decline = useCallback(
    async (invitation) => {
      if (!invitation || busyId != null) return
      setBusyId(invitation.id)
      try {
        const updated = await declineWorkspaceInvitation(invitation.id)
        // Keep the row in the store with its terminal status so the
        // notification window can reflect the outcome; the received
        // invitations dialog hides declined rows from its visible list.
        setItems((current) =>
          current.map((item) =>
            item.id === invitation.id
              ? { ...item, ...updated, status: updated?.status || 'declined' }
              : item,
          ),
        )
        toast.info('Invitation declined.')
      } catch (err) {
        if (err?.status === 401) {
          unauthorizedRef.current?.()
          return
        }
        toast.error(err?.message || 'Could not decline the invitation.')
        refresh()
      } finally {
        setBusyId(null)
      }
    },
    [busyId, refresh, toast],
  )

  const pendingCount = items.filter((item) => item.status === 'pending').length

  return {
    items,
    pendingCount,
    loading,
    error,
    busyId,
    refresh,
    accept,
    decline,
  }
}