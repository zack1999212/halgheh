import { useCallback, useEffect, useRef, useState } from 'react'
import {
  activateCredential,
  createCredential,
  deleteCredential,
  getEffectiveConfig,
  listCredentials,
  listProviders,
  revertToDefault,
  updateCredential,
} from './api.js'

/**
 * Loads the provider catalogue, the effective configuration and the user's
 * personal configurations, and owns every mutation so the page stays
 * presentational.
 */
export default function useAISettings({ onUnauthorized } = {}) {
  const unauthorizedRef = useRef(onUnauthorized)
  useEffect(() => {
    unauthorizedRef.current = onUnauthorized
  }, [onUnauthorized])

  const [providers, setProviders] = useState([])
  const [credentials, setCredentials] = useState([])
  const [effective, setEffective] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')

  const report = useCallback((err, setter) => {
    if (err?.status === 401) {
      unauthorizedRef.current?.()
      return
    }
    setter(err?.message || 'Something went wrong. Please try again.')
  }, [])

  const load = useCallback(
    async ({ showLoading = false } = {}) => {
      if (showLoading) {
        setLoading(true)
      }
      setError('')
      try {
        const [catalog, creds, config] = await Promise.all([
          listProviders(),
          listCredentials(),
          getEffectiveConfig(),
        ])
        setProviders(Array.isArray(catalog?.providers) ? catalog.providers : [])
        setCredentials(Array.isArray(creds) ? creds : [])
        setEffective(config || null)
      } catch (err) {
        report(err, setError)
      } finally {
        if (showLoading) {
          setLoading(false)
        }
      }
    },
    [report],
  )

  useEffect(() => {
    load({ showLoading: true })
  }, [load])

  const run = useCallback(
    async (action, successMessage) => {
      setSaving(true)
      setActionError('')
      setNotice('')
      try {
        await action()
        await load()
        setNotice(successMessage)
        return true
      } catch (err) {
        report(err, setActionError)
        return false
      } finally {
        setSaving(false)
      }
    },
    [load, report],
  )

  const create = useCallback(
    (payload) => run(() => createCredential(payload), 'Provider configuration saved.'),
    [run],
  )

  const update = useCallback(
    (id, payload) =>
      run(() => updateCredential(id, payload), 'Provider configuration updated.'),
    [run],
  )

  const remove = useCallback(
    (id) => run(() => deleteCredential(id), 'Provider configuration removed.'),
    [run],
  )

  const activate = useCallback(
    (id) => run(() => activateCredential(id), 'Active provider switched.'),
    [run],
  )

  const revert = useCallback(
    () => run(() => revertToDefault(), 'Now using the shared application default.'),
    [run],
  )

  const dismissMessages = useCallback(() => {
    setNotice('')
    setActionError('')
  }, [])

  return {
    providers,
    credentials,
    effective,
    loading,
    error,
    saving,
    actionError,
    notice,
    reload: () => load({ showLoading: true }),
    create,
    update,
    remove,
    activate,
    revert,
    dismissMessages,
  }
}
