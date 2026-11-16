import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Check,
  KeyRound,
  Plus,
  RefreshCw,
  RotateCcw,
  Server,
  Trash2,
} from 'lucide-react'
import useAISettings from './useAISettings.js'
import { clearSession } from '../auth/api.js'
import './ai-settings.css'

const EMPTY_FORM = {
  name: '',
  provider: '',
  model: '',
  baseUrl: '',
  apiKey: '',
  activate: true,
}

function capabilityLabel(caps) {
  if (!caps || caps.tool_calling == null) {
    return 'Tool calling: unknown'
  }
  return caps.tool_calling
    ? 'Tool calling supported'
    : 'Tool calling not supported'
}

function sourceLabel(source) {
  return source === 'personal' ? 'Personal configuration' : 'Application default'
}

export default function AISettingsPage() {
  const navigate = useNavigate()
  const handleUnauthorized = useCallback(() => {
    clearSession()
    navigate('/login', { replace: true })
  }, [navigate])

  const settings = useAISettings({ onUnauthorized: handleUnauthorized })
  const {
    providers,
    credentials,
    effective,
    loading,
    error,
    saving,
    actionError,
    notice,
    reload,
    create,
    update,
    remove,
    activate,
    revert,
    dismissMessages,
  } = settings

  const [form, setForm] = useState(EMPTY_FORM)
  const [mode, setMode] = useState('create')
  const [editingId, setEditingId] = useState(null)
  const [confirmingId, setConfirmingId] = useState(null)

  // Seed the form with the first provider once the catalogue arrives.
  useEffect(() => {
    if (!providers.length) {
      return
    }
    setForm((current) => {
      if (current.provider) {
        return current
      }
      const first = providers[0]
      return {
        ...current,
        provider: first.id,
        model: first.default_model,
      }
    })
  }, [providers])

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === form.provider) || null,
    [providers, form.provider],
  )

  const knownModels = selectedProvider?.models || []

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function handleProviderChange(providerId) {
    const provider = providers.find((item) => item.id === providerId)
    setForm((current) => ({
      ...current,
      provider: providerId,
      model: provider ? provider.default_model : current.model,
    }))
  }

  function resetForm() {
    const first = providers[0]
    setMode('create')
    setEditingId(null)
    setForm({
      ...EMPTY_FORM,
      provider: first?.id || '',
      model: first?.default_model || '',
    })
    dismissMessages()
  }

  function startEdit(credential) {
    setMode('edit')
    setEditingId(credential.id)
    setForm({
      name: credential.name || '',
      provider: credential.provider,
      model: credential.model,
      baseUrl: credential.base_url || '',
      apiKey: '',
      activate: false,
    })
    dismissMessages()
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const baseUrl = form.baseUrl.trim()
    const name = form.name.trim()

    if (mode === 'edit' && editingId != null) {
      const payload = {
        provider: form.provider,
        model: form.model.trim(),
        name: name || null,
        base_url: baseUrl || null,
      }
      if (form.apiKey.trim()) {
        payload.api_key = form.apiKey.trim()
      }
      const ok = await update(editingId, payload)
      if (ok) {
        resetForm()
      }
      return
    }

    const payload = {
      provider: form.provider,
      model: form.model.trim(),
      api_key: form.apiKey.trim(),
      name: name || null,
      base_url: baseUrl || null,
      activate: form.activate,
    }
    const ok = await create(payload)
    if (ok) {
      resetForm()
    }
  }

  async function handleActivate(credential) {
    if (credential.is_active) {
      return
    }
    await activate(credential.id)
  }

  async function handleRemove(credential) {
    setConfirmingId(null)
    await remove(credential.id)
    if (editingId === credential.id) {
      resetForm()
    }
  }

  const formDisabled = saving
  const canSubmit =
    Boolean(form.provider) &&
    Boolean(form.model.trim()) &&
    (mode === 'edit' || Boolean(form.apiKey.trim()))

  return (
    <section className="ai-page" aria-labelledby="ai-settings-title">
      <header className="ai-page-head">
        <div>
          <h2 className="ai-page-title" id="ai-settings-title">
            AI provider
          </h2>
          <p className="ai-page-subtitle">
            Choose the provider and model used by Halgheh's assistants. Your API
            key is stored encrypted and never shown again.
          </p>
        </div>
        <button
          type="button"
          className="button-secondary"
          onClick={reload}
          disabled={loading}
        >
          <RefreshCw size={14} aria-hidden="true" />
          Refresh
        </button>
      </header>

      {error && (
        <div className="ai-alert ai-alert--error" role="alert">
          <span>{error}</span>
          <button type="button" className="ai-link-button" onClick={reload}>
            Retry
          </button>
        </div>
      )}
      {notice && (
        <div className="ai-alert ai-alert--success" role="status">
          {notice}
        </div>
      )}
      {actionError && (
        <div className="ai-alert ai-alert--error" role="alert">
          {actionError}
        </div>
      )}

      <section className="ai-card" aria-labelledby="ai-current-title">
        <h3 className="ai-card-title" id="ai-current-title">
          Current configuration
        </h3>
        {loading && !effective ? (
          <p className="ai-muted">Loading configuration…</p>
        ) : effective ? (
          <>
            <div className="ai-effective-grid">
              <div className="ai-effective-item">
                <span className="ai-effective-label">Source</span>
                <strong className="ai-effective-value">
                  {sourceLabel(effective.source)}
                </strong>
              </div>
              <div className="ai-effective-item">
                <span className="ai-effective-label">Provider</span>
                <strong className="ai-effective-value">
                  {effective.provider_label}
                </strong>
              </div>
              <div className="ai-effective-item">
                <span className="ai-effective-label">Model</span>
                <strong className="ai-effective-value">{effective.model}</strong>
              </div>
              <div className="ai-effective-item">
                <span className="ai-effective-label">Endpoint</span>
                <strong className="ai-effective-value ai-effective-value--mono">
                  {effective.base_url || 'Provider default'}
                </strong>
              </div>
            </div>

            <div className="ai-badges">
              <span className="ai-badge">
                <KeyRound size={12} aria-hidden="true" />
                {effective.has_credentials
                  ? 'Credentials configured'
                  : 'No credentials'}
              </span>
              <span className="ai-badge">
                {capabilityLabel(effective.capabilities)}
              </span>
              {!effective.model_known && (
                <span className="ai-badge ai-badge--warn">
                  Unknown model identifier
                </span>
              )}
            </div>

            {effective.source === 'personal' && (
              <div className="ai-card-actions">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={revert}
                  disabled={saving}
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  Use application default
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="ai-muted">Configuration unavailable.</p>
        )}
      </section>

      <section className="ai-card" aria-labelledby="ai-form-title">
        <h3 className="ai-card-title" id="ai-form-title">
          {mode === 'edit' ? 'Edit personal configuration' : 'Add personal configuration'}
        </h3>
        <p className="ai-hint">
          A personal configuration takes priority over the shared application
          default. Leave the endpoint blank to reuse the administrator's
          endpoint.
        </p>

        <form className="ai-form" onSubmit={handleSubmit}>
          <div className="ai-form-row">
            <div className="ai-field">
              <label className="ai-label" htmlFor="ai-provider">
                Provider
              </label>
              <select
                id="ai-provider"
                className="ai-input"
                value={form.provider}
                disabled={formDisabled}
                onChange={(event) => handleProviderChange(event.target.value)}
              >
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="ai-field">
              <label className="ai-label" htmlFor="ai-model">
                Model
              </label>
              <input
                id="ai-model"
                className="ai-input"
                list="ai-model-options"
                value={form.model}
                disabled={formDisabled}
                placeholder="e.g. glm-4.5"
                onChange={(event) => updateField('model', event.target.value)}
              />
              <datalist id="ai-model-options">
                {knownModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </datalist>
              <p className="ai-hint ai-hint--tight">
                {selectedProvider?.supports_manual_model
                  ? 'Pick a known model or enter a model identifier.'
                  : 'Choose a model from the catalogue.'}
              </p>
            </div>
          </div>

          <div className="ai-field">
            <label className="ai-label" htmlFor="ai-base-url">
              API base URL <span className="ai-optional">(optional)</span>
            </label>
            <input
              id="ai-base-url"
              className="ai-input ai-input--mono"
              value={form.baseUrl}
              disabled={formDisabled}
              placeholder="https://…"
              onChange={(event) => updateField('baseUrl', event.target.value)}
            />
          </div>

          <div className="ai-field">
            <label className="ai-label" htmlFor="ai-api-key">
              API key
            </label>
            <input
              id="ai-api-key"
              className="ai-input ai-input--mono"
              type="password"
              autoComplete="off"
              value={form.apiKey}
              disabled={formDisabled}
              placeholder={
                mode === 'edit'
                  ? 'Leave blank to keep the current key'
                  : 'Paste your provider API key'
              }
              onChange={(event) => updateField('apiKey', event.target.value)}
            />
            <p className="ai-hint ai-hint--tight">
              Keys are encrypted at rest and never returned to the browser.
            </p>
          </div>

          <div className="ai-field">
            <label className="ai-label" htmlFor="ai-name">
              Label <span className="ai-optional">(optional)</span>
            </label>
            <input
              id="ai-name"
              className="ai-input"
              value={form.name}
              disabled={formDisabled}
              placeholder="e.g. Work key"
              onChange={(event) => updateField('name', event.target.value)}
            />
          </div>

          {mode === 'create' && (
            <label className="ai-checkbox">
              <input
                type="checkbox"
                checked={form.activate}
                disabled={formDisabled}
                onChange={(event) => updateField('activate', event.target.checked)}
              />
              Use this configuration immediately
            </label>
          )}

          <div className="ai-form-actions">
            {mode === 'edit' && (
              <button
                type="button"
                className="button-secondary"
                onClick={resetForm}
                disabled={formDisabled}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="button-primary"
              disabled={formDisabled || !canSubmit}
            >
              {mode === 'edit' ? (
                'Save changes'
              ) : (
                <>
                  <Plus size={14} aria-hidden="true" />
                  Save configuration
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      <section className="ai-card" aria-labelledby="ai-list-title">
        <h3 className="ai-card-title" id="ai-list-title">
          Your configurations
        </h3>
        {credentials.length === 0 ? (
          <p className="ai-muted">
            No personal configurations yet. You are using the shared application
            default.
          </p>
        ) : (
          <ul className="ai-list">
            {credentials.map((credential) => (
              <li className="ai-item" key={credential.id}>
                <div className="ai-item-main">
                  <div className="ai-item-title">
                    {credential.name || credential.provider_label}
                    {credential.is_active && (
                      <span className="ai-badge ai-badge--active">
                        <Check size={11} aria-hidden="true" />
                        Active
                      </span>
                    )}
                  </div>
                  <div className="ai-item-meta">
                    <span>{credential.provider_label}</span>
                    <span aria-hidden="true">·</span>
                    <span>{credential.model}</span>
                    <span aria-hidden="true">·</span>
                    <span className="ai-item-key">
                      <KeyRound size={11} aria-hidden="true" />
                      {credential.has_credentials
                        ? credential.api_key_masked
                        : 'No key'}
                    </span>
                  </div>
                  <div className="ai-item-meta">
                    <Server size={11} aria-hidden="true" />
                    {credential.base_url || 'Uses application endpoint'}
                    <span aria-hidden="true">·</span>
                    {capabilityLabel(credential.capabilities)}
                  </div>
                </div>

                <div className="ai-item-actions">
                  {!credential.is_active && (
                    <button
                      type="button"
                      className="button-secondary ai-small-button"
                      onClick={() => handleActivate(credential)}
                      disabled={saving}
                    >
                      Use
                    </button>
                  )}
                  <button
                    type="button"
                    className="button-secondary ai-small-button"
                    onClick={() => startEdit(credential)}
                    disabled={saving}
                  >
                    Edit
                  </button>
                  {confirmingId === credential.id ? (
                    <span className="ai-confirm">
                      <span>Remove?</span>
                      <button
                        type="button"
                        className="ai-danger-button"
                        onClick={() => handleRemove(credential)}
                        disabled={saving}
                      >
                        Remove
                      </button>
                      <button
                        type="button"
                        className="ai-link-button"
                        onClick={() => setConfirmingId(null)}
                        disabled={saving}
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="ai-icon-button"
                      onClick={() => setConfirmingId(credential.id)}
                      disabled={saving}
                      aria-label={`Remove ${credential.name || credential.provider_label}`}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}
