import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronDown,
  CircleAlert,
  History,
  LoaderCircle,
  Send,
  Settings,
  Sparkles,
  SquarePen,
  X,
} from 'lucide-react'
import { clearToken } from '../../src/api.js'
import { getEffectiveConfig, listModels } from '../../ai/api.js'
import { getBrowserTimeZone } from '../time.js'
import ConfirmationCard from './ConfirmationCard.jsx'
import ConversationHistory from './ConversationHistory.jsx'
import ToolActivity from './ToolActivity.jsx'
import {
  CALENDAR_AGENT_ID,
  approvePendingAction,
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  rejectPendingAction,
  renameConversation,
  sendMessage as sendAgentMessage,
  setConversationModel,
} from './api.js'
import { formatTime, isWriteTool } from './format.js'
import './agent.css'

const STORAGE_KEY = 'halgheh.calendarAgent.activeConversation'

const SUGGESTIONS = [
  "What's on my calendar this week?",
  'Create a meeting tomorrow at 10 AM',
  'Find a free 30-minute slot tomorrow',
  'Remind me 15 minutes before my next meeting',
]

function readStoredId() {
  const value = Number(localStorage.getItem(STORAGE_KEY))
  return Number.isFinite(value) && value > 0 ? value : null
}

/**
 * Floating Calendar Assistant. Mounted only by CalendarPage, so the assistant
 * never appears on other sections. All AI requests and confirmations go through
 * the existing agent backend.
 */
export default function CalendarAgent({ onCalendarChanged }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [conversations, setConversations] = useState([])
  const [conversationsLoading, setConversationsLoading] = useState(false)
  const [activeId, setActiveId] = useState(readStoredId)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [errorNeedsSettings, setErrorNeedsSettings] = useState(false)
  const [notice, setNotice] = useState('')
  const [actionErrors, setActionErrors] = useState({})
  const [busyActions, setBusyActions] = useState({})
  const [aiConfig, setAiConfig] = useState(null)
  const [aiConfigError, setAiConfigError] = useState('')
  const [needsToolCapableModel, setNeedsToolCapableModel] = useState(false)
  const [models, setModels] = useState([])
  const [modelsError, setModelsError] = useState('')
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [pendingModel, setPendingModel] = useState(null)
  const [switchingModel, setSwitchingModel] = useState(false)

  const panelRef = useRef(null)
  const fabRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const handleUnauthorized = useCallback(() => {
    clearToken()
    navigate('/login', { replace: true })
  }, [navigate])

  const openSettings = useCallback(() => {
    setOpen(false)
    setHistoryOpen(false)
    navigate('/settings/ai')
  }, [navigate])

  const closePanel = useCallback(() => {
    setOpen(false)
    setHistoryOpen(false)
    setError('')
    setErrorNeedsSettings(false)
    window.requestAnimationFrame(() => {
      fabRef.current?.focus({ preventScroll: true })
    })
  }, [])

  const loadConfig = useCallback(async () => {
    setAiConfigError('')
    try {
      const config = await getEffectiveConfig()
      setAiConfig(config || null)
      if (config?.capabilities?.tool_calling === true) {
        setNeedsToolCapableModel(false)
      }
    } catch (err) {
      if (err?.status === 401) {
        handleUnauthorized()
        return
      }
      setAiConfigError(err?.message || 'Could not load the AI provider.')
    }
  }, [handleUnauthorized])

  // Only enabled models with verified tool calling may run the Calendar Agent.
  const loadModels = useCallback(async () => {
    setModelsError('')
    try {
      const rows = await listModels({
        enabledOnly: true,
        compatibleWithAgent: CALENDAR_AGENT_ID,
      })
      setModels(Array.isArray(rows) ? rows : [])
    } catch (err) {
      if (err?.status === 401) {
        handleUnauthorized()
        return
      }
      setModelsError(err?.message || 'Could not load the model list.')
    }
  }, [handleUnauthorized])

  const refreshConversations = useCallback(async () => {
    setConversationsLoading(true)
    try {
      const rows = await listConversations(CALENDAR_AGENT_ID)
      const list = Array.isArray(rows) ? rows : []
      setConversations(list)
      return list
    } catch (err) {
      if (err?.status === 401) {
        handleUnauthorized()
        return []
      }
      setError(err?.message || 'Could not load conversations.')
      return []
    } finally {
      setConversationsLoading(false)
    }
  }, [handleUnauthorized])

  const loadConversation = useCallback(
    async (conversationId, { silent = false } = {}) => {
      if (!silent) setDetailLoading(true)
      setError('')
      setErrorNeedsSettings(false)
      try {
        const data = await getConversation(
          CALENDAR_AGENT_ID,
          conversationId,
        )
        setDetail(data)
        setActiveId(conversationId)
        localStorage.setItem(STORAGE_KEY, String(conversationId))
        return data
      } catch (err) {
        if (err?.status === 404) {
          localStorage.removeItem(STORAGE_KEY)
          setActiveId(null)
          setDetail(null)
          setConversations((current) =>
            current.filter((conversation) => conversation.id !== conversationId),
          )
          setError('That conversation no longer exists. Start a new chat.')
          return null
        }
        if (err?.status === 401) {
          handleUnauthorized()
          return null
        }
        setError(err?.message || 'Could not load this conversation.')
        return null
      } finally {
        if (!silent) setDetailLoading(false)
      }
    },
    [handleUnauthorized],
  )

  // Provider information loads with the page; opening the panel refreshes it.
  useEffect(() => {
    loadConfig()
    loadModels()
  }, [loadConfig, loadModels])

  // Restore the most recent (or last selected) conversation on each open.
  useEffect(() => {
    if (!open) {
      return undefined
    }
    let cancelled = false

    async function bootstrap() {
      loadConfig()
      loadModels()
      const rows = await refreshConversations()
      if (cancelled) return
      const storedId = readStoredId()
      const next =
        rows.find((conversation) => conversation.id === activeId) ||
        rows.find((conversation) => conversation.id === storedId) ||
        rows[0]
      if (!next) {
        setActiveId(null)
        setDetail(null)
        return
      }
      await loadConversation(next.id, { silent: Boolean(detail) })
    }

    bootstrap()
    return () => {
      cancelled = true
    }
    // The bootstrap intentionally runs on open transitions only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Keep the newest message visible.
  useEffect(() => {
    if (!open) return
    const element = listRef.current
    if (!element) return
    element.scrollTop = element.scrollHeight
  }, [
    open,
    detail?.messages?.length,
    detail?.pending_actions?.length,
    sending,
    detailLoading,
  ])

  // Grow the composer with its content, up to a compact maximum.
  useEffect(() => {
    const element = inputRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 120)}px`
  }, [input, open])

  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(''), 5000)
    return () => window.clearTimeout(timer)
  }, [notice])

  // Move focus into the floating window without disturbing calendar scroll.
  useEffect(() => {
    if (!open) return undefined
    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  // Full-screen mobile chatroom locks background scrolling.
  useEffect(() => {
    if (!open) return undefined
    if (!window.matchMedia('(max-width: 640px)').matches) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    function handleKeyDown(event) {
      if (event.key !== 'Escape') return
      if (historyOpen) {
        setHistoryOpen(false)
        return
      }
      closePanel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, historyOpen, closePanel])

  async function handleSend() {
    const text = input.trim()
    if (!text || sending) return

    setSending(true)
    setError('')
    setErrorNeedsSettings(false)
    setNotice('')
    const previousInput = input
    setInput('')

    try {
      let conversationId = activeId
      if (!conversationId) {
        const created = await createConversation(CALENDAR_AGENT_ID, {
          title: text.slice(0, 80),
          timezone: getBrowserTimeZone(),
          provider: pendingModel?.provider,
          model: pendingModel?.model,
        })
        conversationId = created.id
        setPendingModel(null)
        setActiveId(created.id)
        localStorage.setItem(STORAGE_KEY, String(created.id))
        setConversations((current) => [
          created,
          ...current.filter((conversation) => conversation.id !== created.id),
        ])
      }

      const response = await sendAgentMessage(
        CALENDAR_AGENT_ID,
        conversationId,
        text,
      )
      const newMessages = Array.isArray(response?.messages)
        ? response.messages
        : []
      const newPending = Array.isArray(response?.pending_actions)
        ? response.pending_actions
        : []

      setDetail((current) => {
        if (!current || current.conversation?.id !== conversationId) {
          return current
        }
        const messageIds = new Set(current.messages.map((message) => message.id))
        const pendingIds = new Set(
          (current.pending_actions || []).map((action) => action.id),
        )
        return {
          ...current,
          messages: [
            ...current.messages,
            ...newMessages.filter((message) => !messageIds.has(message.id)),
          ],
          pending_actions: [
            ...(current.pending_actions || []),
            ...newPending.filter((action) => !pendingIds.has(action.id)),
          ],
        }
      })

      if (!detail || detail.conversation?.id !== conversationId) {
        await loadConversation(conversationId, { silent: Boolean(detail) })
      } else {
        // Reconcile with the persisted conversation (title, tool rows, pending).
        await loadConversation(conversationId, { silent: true })
      }

      await refreshConversations()

      const changedCalendar = newMessages.some(
        (message) =>
          message.role === 'tool' &&
          isWriteTool(message.tool_name) &&
          !message.tool_result?.error &&
          message.tool_result?.status !== 'pending_confirmation',
      )
      if (changedCalendar) {
        onCalendarChanged?.()
      }
    } catch (err) {
      if (err?.status === 401) {
        handleUnauthorized()
        return
      }
      const message =
        err?.message || 'The assistant could not respond. Please try again.'
      setInput(previousInput)
      setError(message)
      if (
        err?.status === 422 &&
        /tool calling|compatible model/i.test(message)
      ) {
        setNeedsToolCapableModel(true)
        setErrorNeedsSettings(true)
      } else if (
        err?.status === 400 &&
        /not configured|api key|endpoint/i.test(message)
      ) {
        setErrorNeedsSettings(true)
      }
    } finally {
      setSending(false)
    }
  }

  function handleComposerKeyDown(event) {
    if (event.nativeEvent?.isComposing) return
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }

  async function handleSelectModel(model) {
    setModelPickerOpen(false)
    setError('')
    setErrorNeedsSettings(false)
    setNotice('')

    if (!activeId) {
      setPendingModel({
        provider: model.provider,
        model: model.upstream_model_id,
      })
      setNotice(`New conversations will use ${model.label}.`)
      return
    }

    setSwitchingModel(true)
    try {
      const updated = await setConversationModel(CALENDAR_AGENT_ID, activeId, {
        provider: model.provider,
        model: model.upstream_model_id,
      })
      setDetail((current) =>
        current && current.conversation?.id === updated.id
          ? {
              ...current,
              conversation: {
                ...current.conversation,
                provider: updated.provider,
                model: updated.model,
              },
            }
          : current,
      )
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === updated.id
            ? {
                ...conversation,
                provider: updated.provider,
                model: updated.model,
              }
            : conversation,
        ),
      )
      setNotice(`This conversation now uses ${model.label}.`)
    } catch (err) {
      if (err?.status === 401) {
        handleUnauthorized()
        return
      }
      setError(
        err?.message || 'Could not change the model for this conversation.',
      )
      if (err?.status === 409 || err?.status === 422) {
        setErrorNeedsSettings(true)
      }
    } finally {
      setSwitchingModel(false)
    }
  }

  function startNewChat() {
    setHistoryOpen(false)
    setModelPickerOpen(false)
    setPendingModel(null)
    setActiveId(null)
    setDetail(null)
    setError('')
    setErrorNeedsSettings(false)
    setNotice('')
    setInput('')
    localStorage.removeItem(STORAGE_KEY)
    window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true })
    })
  }

  function selectConversation(conversationId) {
    setHistoryOpen(false)
    if (conversationId === activeId && detail) return
    loadConversation(conversationId)
  }

  async function handleRename(conversationId, title) {
    try {
      const updated = await renameConversation(
        CALENDAR_AGENT_ID,
        conversationId,
        title,
      )
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                title: updated.title,
                updated_at: updated.updated_at,
              }
            : conversation,
        ),
      )
      setDetail((current) =>
        current && current.conversation?.id === conversationId
          ? {
              ...current,
              conversation: { ...current.conversation, title: updated.title },
            }
          : current,
      )
      setNotice('Conversation renamed.')
      return true
    } catch (err) {
      if (err?.status === 401) {
        handleUnauthorized()
        return false
      }
      setError(err?.message || 'Could not rename the conversation.')
      return false
    }
  }

  async function handleDelete(conversationId) {
    try {
      await deleteConversation(CALENDAR_AGENT_ID, conversationId)
      const remaining = conversations.filter(
        (conversation) => conversation.id !== conversationId,
      )
      setConversations(remaining)
      if (conversationId === activeId) {
        localStorage.removeItem(STORAGE_KEY)
        setActiveId(null)
        setDetail(null)
        if (remaining[0]) {
          await loadConversation(remaining[0].id)
        }
      }
      setNotice('Conversation deleted.')
      return true
    } catch (err) {
      if (err?.status === 401) {
        handleUnauthorized()
        return false
      }
      setError(err?.message || 'Could not delete the conversation.')
      return false
    }
  }

  async function resolveAction(action, decision) {
    if (busyActions[action.id]) return
    setBusyActions((current) => ({ ...current, [action.id]: decision }))
    setActionErrors((current) => {
      const next = { ...current }
      delete next[action.id]
      return next
    })

    try {
      const updated =
        decision === 'approve'
          ? await approvePendingAction(CALENDAR_AGENT_ID, action.id)
          : await rejectPendingAction(CALENDAR_AGENT_ID, action.id)

      setDetail((current) =>
        current
          ? {
              ...current,
              pending_actions: (current.pending_actions || []).filter(
                (pending) => pending.id !== action.id,
              ),
            }
          : current,
      )

      if (decision === 'approve') {
        setNotice(updated?.result?.summary || 'Action approved.')
        onCalendarChanged?.()
      } else {
        setNotice('Action rejected.')
      }

      await refreshConversations()
      if (activeId) {
        await loadConversation(activeId, { silent: true })
      }
    } catch (err) {
      if (err?.status === 401) {
        handleUnauthorized()
        return
      }
      const message =
        err?.message || 'Could not update this request. Please try again.'
      setActionErrors((current) => ({ ...current, [action.id]: message }))
      if (err?.status === 409 || err?.status === 404) {
        setNotice(message)
        if (activeId) {
          await loadConversation(activeId, { silent: true })
        }
      }
    } finally {
      setBusyActions((current) => {
        const next = { ...current }
        delete next[action.id]
        return next
      })
    }
  }

  function useSuggestion(text) {
    setInput(text)
    window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true })
    })
  }

  const missingCredentials = Boolean(
    aiConfig && aiConfig.has_credentials === false,
  )
  const toolCallingUnsupported =
    needsToolCapableModel || aiConfig?.capabilities?.tool_calling === false

  // The conversation's own selection wins over the user/application default,
  // matching the backend precedence exactly.
  const conversationProvider = detail?.conversation?.provider || null
  const conversationModel = detail?.conversation?.model || null
  const conversationModelMeta = models.find(
    (model) =>
      model.provider === conversationProvider &&
      model.upstream_model_id === conversationModel,
  )
  const inheritedModelMeta = models.find(
    (model) =>
      model.provider === aiConfig?.provider &&
      model.upstream_model_id === aiConfig?.model,
  )
  const pendingModelMeta = pendingModel
    ? models.find(
        (model) =>
          model.provider === pendingModel.provider &&
          model.upstream_model_id === pendingModel.model,
      )
    : null
  const activeModelMeta =
    pendingModelMeta || conversationModelMeta || inheritedModelMeta || null
  const activeModelLabel =
    activeModelMeta?.label ||
    conversationModel ||
    aiConfig?.model_label ||
    aiConfig?.model ||
    ''
  const providerText = activeModelLabel
    ? `${aiConfig?.provider_label || 'Provider'} · ${activeModelLabel}`
    : aiConfigError
      ? 'Provider unavailable · Open settings'
      : 'Loading provider…'
  const activePricing = activeModelMeta?.pricing_class || 'unknown'
  const statusTone = sending
    ? 'busy'
    : aiConfig?.has_credentials
      ? 'ready'
      : aiConfig
        ? 'warning'
        : 'idle'
  const statusLabel = sending
    ? 'Thinking'
    : aiConfig?.has_credentials
      ? 'Ready'
      : aiConfig
        ? 'Setup needed'
        : 'Checking'

  const messages = detail?.messages || []
  const pendingActions = detail?.pending_actions || []
  const showEmptyState =
    !detailLoading && messages.length === 0 && pendingActions.length === 0

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        className={`ca-fab${open ? ' is-hidden' : ''}`}
        onClick={() => setOpen(true)}
        aria-label="Open Calendar Assistant"
        aria-expanded={open}
        aria-controls="calendar-agent-panel"
      >
        <Sparkles size={21} aria-hidden="true" />
        <span className="ca-fab-tooltip" aria-hidden="true">
          Calendar Assistant
        </span>
      </button>

      {open && (
        <section
          id="calendar-agent-panel"
          ref={panelRef}
          className="ca-panel"
          role="dialog"
          aria-label="Calendar Assistant"
          tabIndex={-1}
        >
          <header className="ca-header">
            <div className="ca-identity">
              <span className="ca-mark" aria-hidden="true">
                <Sparkles size={15} />
              </span>
              <div className="ca-identity-text">
                <div className="ca-title-row">
                  <h2 className="ca-title">Calendar Assistant</h2>
                  <span
                    className={`ca-status is-${statusTone}`}
                    title={statusLabel}
                    aria-label={statusLabel}
                  />
                </div>
                <button
                  type="button"
                  className={`ca-provider${modelPickerOpen ? ' is-open' : ''}`}
                  onClick={() => setModelPickerOpen((current) => !current)}
                  aria-expanded={modelPickerOpen}
                  aria-haspopup="listbox"
                  title="Change the model for this conversation"
                >
                  <span className="ca-provider-text">{providerText}</span>
                  <span className={`ca-model-price is-${activePricing}`}>
                    {activePricing === 'free'
                      ? 'Free'
                      : activePricing === 'paid'
                        ? 'Paid'
                        : 'Unknown'}
                  </span>
                  <ChevronDown size={12} aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="ca-header-actions">
              <button
                type="button"
                className={`ca-icon-btn${historyOpen ? ' is-active' : ''}`}
                onClick={() => setHistoryOpen((current) => !current)}
                aria-label="Conversation history"
                aria-expanded={historyOpen}
                title="Conversation history"
              >
                <History size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="ca-icon-btn"
                onClick={startNewChat}
                aria-label="Start a new conversation"
                title="New conversation"
              >
                <SquarePen size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="ca-icon-btn"
                onClick={openSettings}
                aria-label="Open AI provider settings"
                title="AI settings"
              >
                <Settings size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="ca-icon-btn"
                onClick={closePanel}
                aria-label="Close Calendar Assistant"
                title="Close"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          </header>

          {modelPickerOpen && (
            <section className="ca-model-menu" aria-label="Choose a model">
              <div className="ca-model-menu-head">
                <strong>
                  {activeId
                    ? 'Model for this conversation'
                    : 'Model for new conversations'}
                </strong>
                <button
                  type="button"
                  className="ca-link"
                  onClick={() => setModelPickerOpen(false)}
                >
                  Close
                </button>
              </div>
              <p className="ca-model-note">
                Switching keeps this conversation’s history. Only models with
                tool calling are listed.
              </p>
              {modelsError && (
                <p className="ca-model-note is-error">{modelsError}</p>
              )}
              {models.length === 0 && !modelsError && (
                <p className="ca-model-note">
                  No compatible models are available.
                </p>
              )}
              <ul className="ca-model-list" role="listbox" aria-label="Available models">
                {models.map((model) => {
                  const isActive = activeId
                    ? conversationModelMeta?.id === model.id
                    : pendingModel
                      ? pendingModelMeta?.id === model.id
                      : aiConfig?.provider === model.provider &&
                        aiConfig?.model === model.upstream_model_id
                  return (
                    <li key={model.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={Boolean(isActive)}
                        className={`ca-model-option${isActive ? ' is-active' : ''}`}
                        onClick={() => handleSelectModel(model)}
                        disabled={switchingModel}
                      >
                        <span className="ca-model-option-main">
                          <span className="ca-model-name">{model.label}</span>
                          <code className="ca-model-upstream">
                            {model.upstream_model_id}
                          </code>
                        </span>
                        <span
                          className={`ca-model-price is-${model.pricing_class}`}
                          title={
                            model.pricing_class === 'paid' &&
                            model.input_price_per_mtok != null
                              ? `$${model.input_price_per_mtok} input / $${model.output_price_per_mtok} output per 1M tokens`
                              : undefined
                          }
                        >
                          {model.pricing_class === 'free'
                            ? 'Free'
                            : model.pricing_class === 'paid'
                              ? 'Paid'
                              : 'Unknown'}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
              <button type="button" className="ca-link" onClick={openSettings}>
                Manage models in AI settings
              </button>
            </section>
          )}

          {historyOpen && (
            <ConversationHistory
              conversations={conversations}
              activeId={activeId}
              loading={conversationsLoading}
              onSelect={selectConversation}
              onNew={startNewChat}
              onRename={handleRename}
              onDelete={handleDelete}
            />
          )}

          <div className="ca-messages" ref={listRef} aria-live="polite">
            {missingCredentials && (
              <div className="ca-alert" role="alert">
                <CircleAlert size={14} aria-hidden="true" />
                <div>
                  <strong>AI provider not configured</strong>
                  <p>
                    Add an API key so the Calendar Assistant can use its
                    calendar tools.
                  </p>
                  <button
                    type="button"
                    className="ca-link"
                    onClick={openSettings}
                  >
                    Open AI settings
                  </button>
                </div>
              </div>
            )}

            {toolCallingUnsupported && (
              <div className="ca-alert" role="alert">
                <CircleAlert size={14} aria-hidden="true" />
                <div>
                  <strong>This model can’t use calendar tools</strong>
                  <p>
                    Calendar actions need a model with tool calling support.
                    Choose a compatible model in AI settings.
                  </p>
                  <button
                    type="button"
                    className="ca-link"
                    onClick={openSettings}
                  >
                    Open AI settings
                  </button>
                </div>
              </div>
            )}

            {aiConfigError && !missingCredentials && (
              <div className="ca-alert" role="alert">
                <CircleAlert size={14} aria-hidden="true" />
                <div>
                  <strong>Provider information unavailable</strong>
                  <p>{aiConfigError}</p>
                  <button
                    type="button"
                    className="ca-link"
                    onClick={openSettings}
                  >
                    Open AI settings
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="ca-alert" role="alert">
                <CircleAlert size={14} aria-hidden="true" />
                <div>
                  <strong>Something went wrong</strong>
                  <p>{error}</p>
                  {errorNeedsSettings && (
                    <button
                      type="button"
                      className="ca-link"
                      onClick={openSettings}
                    >
                      Open AI settings
                    </button>
                  )}
                </div>
              </div>
            )}

            {detailLoading && !detail && (
              <div className="ca-loading">
                <LoaderCircle size={14} className="ca-spin" aria-hidden="true" />
                Loading conversation…
              </div>
            )}

            {showEmptyState && (
              <div className="ca-empty">
                <span className="ca-empty-mark" aria-hidden="true">
                  <Sparkles size={19} />
                </span>
                <h3>Ask about your calendar</h3>
                <p>
                  Create, move, find or clear events and reminders in plain
                  language.
                </p>
                <div className="ca-suggestions">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="ca-suggestion"
                      onClick={() => useSuggestion(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => {
              if (message.role === 'user') {
                return (
                  <div key={message.id} className="ca-msg ca-msg--user">
                    <p>{message.content}</p>
                    <time dateTime={message.created_at}>
                      {formatTime(message.created_at)}
                    </time>
                  </div>
                )
              }
              if (message.role === 'assistant') {
                if (!message.content?.trim()) return null
                return (
                  <div key={message.id} className="ca-msg ca-msg--assistant">
                    <p>{message.content}</p>
                    <time dateTime={message.created_at}>
                      {formatTime(message.created_at)}
                    </time>
                  </div>
                )
              }
              if (message.role === 'tool') {
                return <ToolActivity key={message.id} message={message} />
              }
              return null
            })}

            {sending && (
              <div className="ca-thinking" role="status">
                <LoaderCircle size={13} className="ca-spin" aria-hidden="true" />
                Thinking…
              </div>
            )}

            {pendingActions.length > 0 && (
              <section
                className="ca-pending"
                aria-label="Pending confirmations"
              >
                <h3 className="ca-pending-title">Needs your approval</h3>
                {pendingActions.map((action) => (
                  <ConfirmationCard
                    key={action.id}
                    action={action}
                    busy={Boolean(busyActions[action.id])}
                    busyLabel={
                      busyActions[action.id] === 'reject'
                        ? 'Rejecting…'
                        : 'Approving…'
                    }
                    error={actionErrors[action.id] || ''}
                    onApprove={() => resolveAction(action, 'approve')}
                    onReject={() => resolveAction(action, 'reject')}
                  />
                ))}
              </section>
            )}
          </div>

          {notice && (
            <div className="ca-notice" role="status">
              {notice}
            </div>
          )}

          <form
            className="ca-composer"
            onSubmit={(event) => {
              event.preventDefault()
              handleSend()
            }}
          >
            <textarea
              ref={inputRef}
              className="ca-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="Ask about your calendar…"
              rows={1}
              maxLength={8000}
              aria-label="Message the Calendar Assistant"
            />
            <div className="ca-composer-row">
              <span className="ca-hint">
                Enter to send · Shift+Enter for a new line
              </span>
              <button
                type="submit"
                className="ca-send"
                disabled={!input.trim() || sending}
                aria-label="Send message"
                title="Send"
              >
                {sending ? (
                  <LoaderCircle size={15} className="ca-spin" aria-hidden="true" />
                ) : (
                  <Send size={15} aria-hidden="true" />
                )}
              </button>
            </div>
          </form>
        </section>
      )}
    </>
  )
}
