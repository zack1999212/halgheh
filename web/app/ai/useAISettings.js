import { useCallback, useEffect, useRef, useState } from 'react'
import {
  activateCredential,
  checkModelTools,
  createCredential,
  createModel,
  deleteCredential,
  deleteModel,
  getEffectiveConfig,
  listCredentials,
  listModels,
  listProviders,
  refreshModels,
  revertToDefault,
  updateCredential,
  updateModel,
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
  const [models, setModels] = useState([])
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
        const [catalog, creds, config, catalogueModels] = await Promise.all([
          listProviders(),
          listCredentials(),
          getEffectiveConfig(),
          listModels(),
        ])
        setProviders(Array.isArray(catalog?.providers) ? catalog.providers : [])
        setCredentials(Array.isArray(creds) ? creds : [])
        setEffective(config || null)
        setModels(Array.isArray(catalogueModels) ? catalogueModels : [])
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

  // --- Model catalogue ---

  const addModel = useCallback(
    (providerId, payload) =>
      run(() => createModel(providerId, payload), 'Model added to the catalogue.'),
    [run],
  )

  const editModel = useCallback(
    (modelId, payload) =>
      run(() => updateModel(modelId, payload), 'Model updated.'),
    [run],
  )

  const removeModel = useCallback(
    (modelId) => run(() => deleteModel(modelId), 'Model removed.'),
    [run],
  )

  const reloadModels = useCallback(
    (providerId) =>
      run(
        async () => {
          const result = await refreshModels(providerId)
          if (result?.discovered === 0) {
            throw new Error('The provider returned no models.')
          }
        },
        'Model catalogue refreshed.',
      ),
    [run],
  )

  const probeTools = useCallback(
    (modelId) =>
      run(async () => {
        const result = await checkModelTools(modelId)
        if (!result?.supported) {
          throw new Error(result?.message || 'Tool calling is not supported.')
        }
      }, 'Tool calling confirmed.'),
    [run],
  )

  const dismissMessages = useCallback(() => {
    setNotice('')
    setActionError('')
  }, [])

  return {
    providers,
    models,
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
    addModel,
    editModel,
    removeModel,
    reloadModels,
    probeTools,
    dismissMessages,
  }
}
