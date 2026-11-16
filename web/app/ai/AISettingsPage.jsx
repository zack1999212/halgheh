import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Check,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Server,
  Trash2,
  Wrench,
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

const EMPTY_MODEL_FORM = {
  upstream: '',
  displayName: '',
  description: '',
  contextWindow: '',
  maxOutputTokens: '',
  tools: 'unknown',
  pricing: 'unknown',
  inputPrice: '',
  outputPrice: '',
  enabled: true,
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

function pricingText(model) {
  if (model.pricing_class === 'free') return 'Free'
  if (model.pricing_class === 'paid') {
    const input = model.input_price_per_mtok
    const output = model.output_price_per_mtok
    if (input != null && output != null) {
      return `Paid · $${input}/$${output} per 1M`
    }
    return 'Paid'
  }
  return 'Pricing unknown'
}

function pricingTone(model) {
  if (model.pricing_class === 'free') return 'ai-badge--free'
  if (model.pricing_class === 'paid') return 'ai-badge--paid'
  return 'ai-badge--unknown'
}

function toolsText(model) {
  if (model.supports_tools === true) return 'Tools: yes'
  if (model.supports_tools === false) return 'Tools: no'
  return 'Tools: unknown'
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
    models,
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
    addModel,
    editModel,
    removeModel,
    reloadModels,
    probeTools,
    dismissMessages,
  } = settings

  const [form, setForm] = useState(EMPTY_FORM)
  const [mode, setMode] = useState('create')
  const [editingId, setEditingId] = useState(null)
  const [confirmingId, setConfirmingId] = useState(null)

  const [modelForm, setModelForm] = useState(EMPTY_MODEL_FORM)
  const [modelFormOpen, setModelFormOpen] = useState(false)
  const [modelFormMode, setModelFormMode] = useState('create')
  const [modelFormId, setModelFormId] = useState(null)
  const [confirmingModelId, setConfirmingModelId] = useState(null)
  const [catalogueProvider, setCatalogueProvider] = useState('')

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
      const firstModel = models.find(
        (model) => model.provider === first.id && model.enabled,
      )
      return {
        ...current,
        provider: first.id,
        model: firstModel ? firstModel.upstream_model_id : '',
      }
    })
    setCatalogueProvider((current) => current || providers[0].id)
  }, [providers, models])

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === form.provider) || null,
    [providers, form.provider],
  )

  const providerModels = useMemo(
    () => models.filter((model) => model.provider === form.provider),
    [models, form.provider],
  )

  const enabledProviderModels = useMemo(
    () => providerModels.filter((model) => model.enabled),
    [providerModels],
  )

  const catalogueProviderSpec = useMemo(
    () => providers.find((provider) => provider.id === catalogueProvider) || null,
    [providers, catalogueProvider],
  )

  const catalogueModels = useMemo(
    () => models.filter((model) => model.provider === catalogueProvider),
    [models, catalogueProvider],
  )

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function handleProviderChange(providerId) {
    const firstModel = models.find(
      (model) => model.provider === providerId && model.enabled,
    )
    setForm((current) => ({
      ...current,
      provider: providerId,
      model: firstModel ? firstModel.upstream_model_id : '',
    }))
  }

  function resetForm() {
    const first = providers[0]
    const firstModel = models.find(
      (model) => model?.provider === first?.id && model.enabled,
    )
    setMode('create')
    setEditingId(null)
    setForm({
      ...EMPTY_FORM,
      provider: first?.id || '',
      model: firstModel ? firstModel.upstream_model_id : '',
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

  // --- Model catalogue actions ---

  function openCreateModel() {
    setModelFormMode('create')
    setModelFormId(null)
    setModelForm(EMPTY_MODEL_FORM)
    setModelFormOpen(true)
    dismissMessages()
  }

  function openEditModel(model) {
    setModelFormMode('edit')
    setModelFormId(model.id)
    setModelForm({
      upstream: model.upstream_model_id,
      displayName: model.label,
      description: model.description || '',
      contextWindow: model.context_window ? String(model.context_window) : '',
      maxOutputTokens: model.max_output_tokens
        ? String(model.max_output_tokens)
        : '',
      tools:
        model.supports_tools === true
          ? 'yes'
          : model.supports_tools === false
            ? 'no'
            : 'unknown',
      pricing: model.pricing_class || 'unknown',
      inputPrice:
        model.input_price_per_mtok != null
          ? String(model.input_price_per_mtok)
          : '',
      outputPrice:
        model.output_price_per_mtok != null
          ? String(model.output_price_per_mtok)
          : '',
      enabled: model.enabled,
    })
    setModelFormOpen(true)
    dismissMessages()
  }

  function updateModelField(field, value) {
    setModelForm((current) => ({ ...current, [field]: value }))
  }

  function parseCount(value) {
    const trimmed = String(value).trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null
  }

  function parsePrice(value) {
    const trimmed = String(value).trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
  }

  function toolsValue(value) {
    if (value === 'yes') return true
    if (value === 'no') return false
    return null
  }

  async function handleModelSubmit(event) {
    event.preventDefault()
    if (!catalogueProvider) return

    const payload = {
      display_name: modelForm.displayName.trim(),
      description: modelForm.description.trim() || null,
      context_window: parseCount(modelForm.contextWindow),
      max_output_tokens: parseCount(modelForm.maxOutputTokens),
      supports_tools: toolsValue(modelForm.tools),
      pricing_class: modelForm.pricing,
      input_price_per_mtok: parsePrice(modelForm.inputPrice),
      output_price_per_mtok: parsePrice(modelForm.outputPrice),
      enabled: modelForm.enabled,
    }

    const ok =
      modelFormMode === 'edit' && modelFormId != null
        ? await editModel(modelFormId, payload)
        : await addModel(catalogueProvider, {
            ...payload,
            upstream_model_id: modelForm.upstream.trim(),
          })
    if (ok) {
      setModelFormOpen(false)
      setModelForm(EMPTY_MODEL_FORM)
      setModelFormId(null)
    }
  }

  async function handleToggleModel(model) {
    await editModel(model.id, { enabled: !model.enabled })
  }

  async function handleDeleteModel(model) {
    setConfirmingModelId(null)
    await removeModel(model.id)
  }

  async function handleProbeTools(model) {
    await probeTools(model.id)
  }

  async function handleUseModel(model) {
    const providerCredentials = credentials.filter(
      (credential) => credential.provider === model.provider,
    )
    const target =
      providerCredentials.find((credential) => credential.is_active) ||
      providerCredentials[0]

    if (!target) {
      // Nothing to update yet: pre-fill the personal configuration form.
      setMode('create')
      setForm({
        ...EMPTY_FORM,
        provider: model.provider,
        model: model.upstream_model_id,
        activate: true,
      })
      dismissMessages()
      return
    }

    const ok = await update(target.id, { model: model.upstream_model_id })
    if (ok && !target.is_active) {
      await activate(target.id)
    }
    if (ok) {
      setForm((current) => ({
        ...current,
        model: model.upstream_model_id,
      }))
    }
  }

  const formDisabled = saving
  const canSubmit =
    Boolean(form.provider) &&
    Boolean(form.model.trim()) &&
    (mode === 'edit' || Boolean(form.apiKey.trim()))

  const canSubmitModel =
    Boolean(catalogueProvider) &&
    Boolean(modelForm.displayName.trim()) &&
    (modelFormMode === 'edit' || Boolean(modelForm.upstream.trim()))

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
                <strong className="ai-effective-value">
                  {effective.model_label || effective.model}
                </strong>
                <span className="ai-effective-detail ai-effective-value--mono">
                  {effective.model}
                </span>
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
              <span
                className={`ai-badge ${
                  effective.pricing_class === 'free'
                    ? 'ai-badge--free'
                    : effective.pricing_class === 'paid'
                      ? 'ai-badge--paid'
                      : 'ai-badge--unknown'
                }`}
              >
                {effective.pricing_class === 'free'
                  ? 'Free model'
                  : effective.pricing_class === 'paid'
                    ? 'Paid model'
                    : 'Pricing unknown'}
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

      <section className="ai-card" aria-labelledby="ai-models-title">
        <div className="ai-card-head">
          <div>
            <h3 className="ai-card-title" id="ai-models-title">
              Provider models
            </h3>
            <p className="ai-hint ai-hint--tight">
              Halgheh sends the exact upstream model ID shown here. Free models
              are labelled, so a paid model is never selected by accident.
            </p>
          </div>
          <div className="ai-card-head-actions">
            <select
              className="ai-input ai-select"
              aria-label="Catalogue provider"
              value={catalogueProvider}
              onChange={(event) => setCatalogueProvider(event.target.value)}
              disabled={saving || !providers.length}
            >
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
            {catalogueProviderSpec?.supports_model_discovery && (
              <button
                type="button"
                className="button-secondary ai-small-button"
                onClick={() => reloadModels(catalogueProvider)}
                disabled={saving || !catalogueProvider}
                title="Ask the provider for its model list"
              >
                <RefreshCw size={13} aria-hidden="true" />
                Refresh catalogue
              </button>
            )}
            <button
              type="button"
              className="button-secondary ai-small-button"
              onClick={openCreateModel}
              disabled={saving || !catalogueProvider}
            >
              <Plus size={13} aria-hidden="true" />
              Add model
            </button>
          </div>
        </div>

        {catalogueProviderSpec && (
          <div className="ai-badges ai-model-provider-meta">
            <span className="ai-badge">
              <Server size={12} aria-hidden="true" />
              {effective?.provider === catalogueProviderSpec.id
                ? effective.base_url || catalogueProviderSpec.default_base_url
                : catalogueProviderSpec.default_base_url ||
                  'Set the endpoint in your configuration'}
            </span>
            <span className="ai-badge">
              <KeyRound size={12} aria-hidden="true" />
              {credentials.some(
                (credential) =>
                  credential.provider === catalogueProviderSpec.id &&
                  credential.has_credentials,
              )
                ? 'Credential stored'
                : 'No personal credential'}
            </span>
          </div>
        )}

        {modelFormOpen && (
          <form className="ai-model-form" onSubmit={handleModelSubmit}>
            <div className="ai-form-row">
              <div className="ai-field">
                <label className="ai-label" htmlFor="model-display">
                  Display name
                </label>
                <input
                  id="model-display"
                  className="ai-input"
                  value={modelForm.displayName}
                  disabled={formDisabled}
                  placeholder="GLM-4.5-Flash"
                  onChange={(event) =>
                    updateModelField('displayName', event.target.value)
                  }
                />
              </div>
              <div className="ai-field">
                <label className="ai-label" htmlFor="model-upstream">
                  Upstream model ID
                </label>
                <input
                  id="model-upstream"
                  className="ai-input ai-input--mono"
                  value={modelForm.upstream}
                  disabled={formDisabled || modelFormMode === 'edit'}
                  placeholder="glm-4.5-flash"
                  onChange={(event) =>
                    updateModelField('upstream', event.target.value)
                  }
                />
              </div>
            </div>

            <div className="ai-form-row">
              <div className="ai-field">
                <label className="ai-label" htmlFor="model-tools">
                  Tool calling
                </label>
                <select
                  id="model-tools"
                  className="ai-input"
                  value={modelForm.tools}
                  disabled={formDisabled}
                  onChange={(event) =>
                    updateModelField('tools', event.target.value)
                  }
                >
                  <option value="unknown">Unknown (verify first)</option>
                  <option value="yes">Supported</option>
                  <option value="no">Not supported</option>
                </select>
              </div>
              <div className="ai-field">
                <label className="ai-label" htmlFor="model-pricing">
                  Pricing
                </label>
                <select
                  id="model-pricing"
                  className="ai-input"
                  value={modelForm.pricing}
                  disabled={formDisabled}
                  onChange={(event) =>
                    updateModelField('pricing', event.target.value)
                  }
                >
                  <option value="free">Free</option>
                  <option value="paid">Paid</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>
            </div>

            <div className="ai-form-row">
              <div className="ai-field">
                <label className="ai-label" htmlFor="model-context">
                  Context window
                </label>
                <input
                  id="model-context"
                  className="ai-input"
                  inputMode="numeric"
                  value={modelForm.contextWindow}
                  disabled={formDisabled}
                  placeholder="200000"
                  onChange={(event) =>
                    updateModelField('contextWindow', event.target.value)
                  }
                />
              </div>
              <div className="ai-field">
                <label className="ai-label" htmlFor="model-max-output">
                  Max output tokens
                </label>
                <input
                  id="model-max-output"
                  className="ai-input"
                  inputMode="numeric"
                  value={modelForm.maxOutputTokens}
                  disabled={formDisabled}
                  placeholder="Optional"
                  onChange={(event) =>
                    updateModelField('maxOutputTokens', event.target.value)
                  }
                />
              </div>
            </div>

            {modelForm.pricing === 'paid' && (
              <div className="ai-form-row">
                <div className="ai-field">
                  <label className="ai-label" htmlFor="model-input-price">
                    Input price (USD / 1M tokens)
                  </label>
                  <input
                    id="model-input-price"
                    className="ai-input"
                    inputMode="decimal"
                    value={modelForm.inputPrice}
                    disabled={formDisabled}
                    onChange={(event) =>
                      updateModelField('inputPrice', event.target.value)
                    }
                  />
                </div>
                <div className="ai-field">
                  <label className="ai-label" htmlFor="model-output-price">
                    Output price (USD / 1M tokens)
                  </label>
                  <input
                    id="model-output-price"
                    className="ai-input"
                    inputMode="decimal"
                    value={modelForm.outputPrice}
                    disabled={formDisabled}
                    onChange={(event) =>
                      updateModelField('outputPrice', event.target.value)
                    }
                  />
                </div>
              </div>
            )}

            <div className="ai-field">
              <label className="ai-label" htmlFor="model-description">
                Description <span className="ai-optional">(optional)</span>
              </label>
              <input
                id="model-description"
                className="ai-input"
                value={modelForm.description}
                disabled={formDisabled}
                onChange={(event) =>
                  updateModelField('description', event.target.value)
                }
              />
            </div>

            <div className="ai-form-actions">
              <button
                type="button"
                className="button-secondary"
                onClick={() => setModelFormOpen(false)}
                disabled={formDisabled}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button-primary"
                disabled={formDisabled || !canSubmitModel}
              >
                {modelFormMode === 'edit' ? 'Save model' : 'Add model'}
              </button>
            </div>
          </form>
        )}

        {catalogueModels.length === 0 ? (
          <p className="ai-muted">No models in this catalogue yet.</p>
        ) : (
          <ul className="ai-model-list">
            {catalogueModels.map((model) => (
              <li
                className={`ai-model${model.enabled ? '' : ' is-disabled'}`}
                key={model.id}
              >
                <div className="ai-model-main">
                  <div className="ai-model-title">
                    <strong>{model.label}</strong>
                    <code className="ai-model-id">
                      {model.upstream_model_id}
                    </code>
                    {model.is_custom && (
                      <span className="ai-badge">Custom</span>
                    )}
                    {!model.enabled && (
                      <span className="ai-badge ai-badge--off">Disabled</span>
                    )}
                  </div>
                  <div className="ai-model-badges">
                    <span className={`ai-badge ${pricingTone(model)}`}>
                      {pricingText(model)}
                    </span>
                    <span
                      className={`ai-badge ${
                        model.supports_tools === false
                          ? 'ai-badge--warn'
                          : model.supports_tools === true
                            ? ''
                            : 'ai-badge--unknown'
                      }`}
                    >
                      <Wrench size={11} aria-hidden="true" />
                      {toolsText(model)}
                    </span>
                    {model.context_window && (
                      <span className="ai-badge">
                        {Math.round(model.context_window / 1000)}K context
                      </span>
                    )}
                    {model.max_output_tokens && (
                      <span className="ai-badge">
                        {Math.round(model.max_output_tokens / 1000)}K max output
                      </span>
                    )}
                  </div>
                  {model.description && (
                    <p className="ai-model-description">{model.description}</p>
                  )}
                </div>

                <div className="ai-model-actions">
                  <button
                    type="button"
                    className="button-secondary ai-small-button"
                    onClick={() => handleUseModel(model)}
                    disabled={saving}
                    title="Use this model for my configuration"
                  >
                    Use
                  </button>
                  {model.supports_tools == null && (
                    <button
                      type="button"
                      className="button-secondary ai-small-button"
                      onClick={() => handleProbeTools(model)}
                      disabled={saving}
                      title="Send a small tool-calling request to verify support"
                    >
                      Check tools
                    </button>
                  )}
                  <button
                    type="button"
                    className="button-secondary ai-small-button"
                    onClick={() => handleToggleModel(model)}
                    disabled={saving}
                  >
                    {model.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    type="button"
                    className="ai-icon-button"
                    onClick={() => openEditModel(model)}
                    disabled={saving}
                    aria-label={`Edit ${model.label}`}
                    title="Edit metadata"
                  >
                    <Pencil size={13} aria-hidden="true" />
                  </button>
                  {model.is_custom &&
                    (confirmingModelId === model.id ? (
                      <span className="ai-confirm">
                        <span>Remove?</span>
                        <button
                          type="button"
                          className="ai-danger-button"
                          onClick={() => handleDeleteModel(model)}
                          disabled={saving}
                        >
                          Remove
                        </button>
                        <button
                          type="button"
                          className="ai-link-button"
                          onClick={() => setConfirmingModelId(null)}
                          disabled={saving}
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="ai-icon-button"
                        onClick={() => setConfirmingModelId(model.id)}
                        disabled={saving}
                        aria-label={`Remove ${model.label}`}
                        title="Remove custom model"
                      >
                        <Trash2 size={13} aria-hidden="true" />
                      </button>
                    ))}
                </div>
              </li>
            ))}
          </ul>
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
              <select
                id="ai-model"
                className="ai-input"
                value={form.model}
                disabled={formDisabled || enabledProviderModels.length === 0}
                onChange={(event) => updateField('model', event.target.value)}
              >
                {enabledProviderModels.length === 0 && (
                  <option value="">No enabled models</option>
                )}
                {enabledProviderModels.map((model) => (
                  <option
                    key={model.id}
                    value={model.upstream_model_id}
                  >
                    {model.label} · {model.upstream_model_id}
                    {model.pricing_class === 'free'
                      ? ' · Free'
                      : model.pricing_class === 'paid'
                        ? ' · Paid'
                        : ''}
                  </option>
                ))}
              </select>
              <p className="ai-hint ai-hint--tight">
                {selectedProvider?.supports_manual_model
                  ? 'Pick a catalogue model. Add a custom model above if yours is missing.'
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
            <p className="ai-hint ai-hint--tight">
              Z.ai pay-as-you-go uses https://api.z.ai/api/paas/v4. GLM Coding
              Plan uses https://api.z.ai/api/coding/paas/v4 — Halgheh never
              switches between them by itself.
            </p>
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
                    <span>{credential.model_label || credential.model}</span>
                    <span className="ai-item-id">{credential.model}</span>
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
