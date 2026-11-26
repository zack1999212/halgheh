import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Check,
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
import { clearSession } from '../../auth/api.js'
import { getEffectiveConfig, listModels } from '../../ai/api.js'
import { getBrowserTimeZone } from '../time.js'
import ConfirmationCard from './ConfirmationCard.jsx'
import ConversationHistory from './ConversationHistory.jsx'
import ToolActivity from './ToolActivity.jsx'
import IconButton from '@/components/shared/IconButton'
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'halgheh.calendarAgent.activeConversation'

const SUGGESTIONS = [
  "What's on my calendar this week?",
  'Create a meeting tomorrow at 10 AM',
  'Find a free 30-minute slot tomorrow',
  'Remind me 15 minutes before my next meeting',
]

const STATUS_DOT = {
  ready: 'bg-emerald-500',
  busy: 'bg-amber-500',
  warning: 'bg-amber-500',
  idle: 'bg-muted-foreground/40',
}

const PRICE_LABEL = { free: 'Free', paid: 'Paid', unknown: 'Unknown' }

function readStoredId() {
  const value = Number(localStorage.getItem(STORAGE_KEY))
  return Number.isFinite(value) && value > 0 ? value : null
}

/** True below 640px, where the assistant becomes a full-screen sheet. */
function useNarrowViewport() {
  const [narrow, setNarrow] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 639px)').matches,
  )
  useEffect(() => {
    const query = window.matchMedia('(max-width: 639px)')
    const handleChange = () => setNarrow(query.matches)
    handleChange()
    query.addEventListener('change', handleChange)
    return () => query.removeEventListener('change', handleChange)
  }, [])
  return narrow
}

/** Compact inline notice used for provider setup and send errors. */
function AgentAlert({ title, children, action }) {
  return (
    <Alert className="gap-0 py-2.5 text-[12px] [&>svg~*]:pl-6">
      <CircleAlert aria-hidden="true" />
      <AlertTitle className="text-[12px] font-semibold">{title}</AlertTitle>
      <AlertDescription className="text-[11.5px] text-muted-foreground">
        {children}
        {action}
      </AlertDescription>
    </Alert>
  )
}

/**
 * Floating Calendar Assistant. Mounted only by CalendarPage, so the assistant
 * never appears on other sections. All AI requests and confirmations go through
 * the existing agent backend.
 */
export default function CalendarAgent({ onCalendarChanged }) {
  const navigate = useNavigate()
  const narrow = useNarrowViewport()
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
    clearSession()
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

  // Keep the newest message visible unless the user scrolled back to read.
  useEffect(() => {
    if (!open) return
    const viewport = listRef.current?.querySelector(
      '[data-radix-scroll-area-viewport]',
    )
    if (!viewport) return
    const distanceFromBottom =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
    if (distanceFromBottom < 160) {
      viewport.scrollTop = viewport.scrollHeight
    }
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
  // The mobile sheet manages its own focus and scroll lock.
  useEffect(() => {
    if (!open || narrow) return undefined
    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open, narrow])

  useEffect(() => {
    if (!open) return undefined
    function handleKeyDown(event) {
      if (event.key !== 'Escape') return
      // Radix overlays (history dialog, model menu, mobile sheet) own Escape.
      if (
        document.querySelector(
          '[role="dialog"][data-state="open"], [role="menu"][data-state="open"]',
        )
      ) {
        return
      }
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
        if (!/ask an administrator/i.test(message)) {
          setErrorNeedsSettings(true)
        }
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

  const panel = (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        <header className="flex items-start justify-between gap-2 border-b border-border px-3.5 py-2.5">
          <div className="flex min-w-0 items-start gap-2">
            <span
              className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-foreground text-background"
              aria-hidden="true"
            >
              <Sparkles size={14} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="truncate text-[13px] font-semibold leading-tight">
                  Calendar Assistant
                </h2>
                <span
                  className={cn(
                    'size-1.5 shrink-0 rounded-full',
                    STATUS_DOT[statusTone],
                  )}
                  title={statusLabel}
                  aria-label={statusLabel}
                  role="img"
                />
              </div>
              <DropdownMenu
                open={modelPickerOpen}
                onOpenChange={setModelPickerOpen}
              >
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-1 mt-0.5 h-6 max-w-full gap-1 px-1 text-[11px] font-normal text-muted-foreground hover:text-foreground"
                    aria-label="Change model"
                    title="Change the model for this conversation"
                  >
                    <span className="truncate">{providerText}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'shrink-0 px-1 py-0 text-[9px] font-medium uppercase tracking-wide',
                        activePricing === 'free' &&
                          'border-emerald-300/60 text-emerald-700',
                      )}
                    >
                      {PRICE_LABEL[activePricing] || PRICE_LABEL.unknown}
                    </Badge>
                    <ChevronDown size={11} aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-[300px] max-w-[calc(100vw-2rem)]"
                >
                  <DropdownMenuLabel className="text-[11px] font-medium">
                    {activeId
                      ? 'Model for this conversation'
                      : 'Model for new conversations'}
                  </DropdownMenuLabel>
                  <p className="px-2 pb-2 text-[11px] leading-relaxed text-muted-foreground">
                    Switching keeps this conversation’s history. Only models
                    with tool calling are listed.
                  </p>
                  {modelsError && (
                    <p className="px-2 pb-2 text-[11px] text-destructive">
                      {modelsError}
                    </p>
                  )}
                  {models.length === 0 && !modelsError && (
                    <p className="px-2 pb-2 text-[11px] text-muted-foreground">
                      No compatible models are available.
                    </p>
                  )}
                  {models.length > 0 && <DropdownMenuSeparator />}
                  {models.map((model) => {
                    const isActive = activeId
                      ? conversationModelMeta?.id === model.id
                      : pendingModel
                        ? pendingModelMeta?.id === model.id
                        : aiConfig?.provider === model.provider &&
                          aiConfig?.model === model.upstream_model_id
                    return (
                      <DropdownMenuItem
                        key={model.id}
                        disabled={switchingModel}
                        onSelect={() => handleSelectModel(model)}
                        className="flex-col items-start gap-0.5 py-1.5"
                      >
                        <span className="flex w-full items-center gap-2">
                          <span className="truncate text-[12px] font-medium">
                            {model.label}
                          </span>
                          {isActive && (
                            <Check
                              className="size-3.5 shrink-0"
                              aria-hidden="true"
                            />
                          )}
                          <Badge
                            variant="outline"
                            className={cn(
                              'ml-auto shrink-0 px-1 py-0 text-[9px] font-medium uppercase tracking-wide',
                              model.pricing_class === 'free' &&
                                'border-emerald-300/60 text-emerald-700',
                            )}
                            title={
                              model.pricing_class === 'paid' &&
                              model.input_price_per_mtok != null
                                ? `$${model.input_price_per_mtok} input / $${model.output_price_per_mtok} output per 1M tokens`
                                : undefined
                            }
                          >
                            {PRICE_LABEL[model.pricing_class] ||
                              PRICE_LABEL.unknown}
                          </Badge>
                        </span>
                        <code className="text-[10px] text-muted-foreground">
                          {model.upstream_model_id}
                        </code>
                      </DropdownMenuItem>
                    )
                  })}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={openSettings}
                    className="gap-2 text-[12px]"
                  >
                    <Settings size={13} aria-hidden="true" />
                    Manage models in AI settings
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <IconButton
              label="Conversation history"
              tooltip="History"
              aria-expanded={historyOpen}
              onClick={() => setHistoryOpen((current) => !current)}
              className={cn(
                historyOpen && 'bg-accent text-foreground',
                'size-7 text-muted-foreground hover:text-foreground',
              )}
            >
              <History size={15} aria-hidden="true" />
            </IconButton>
            <IconButton
              label="Start a new conversation"
              tooltip="New conversation"
              onClick={startNewChat}
            >
              <SquarePen size={15} aria-hidden="true" />
            </IconButton>
            <IconButton
              label="Open AI provider settings"
              tooltip="AI settings"
              onClick={openSettings}
            >
              <Settings size={15} aria-hidden="true" />
            </IconButton>
            <IconButton label="Close Calendar Assistant" onClick={closePanel}>
              <X size={16} aria-hidden="true" />
            </IconButton>
          </div>
        </header>

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

        <ScrollArea ref={listRef} className="min-h-0 flex-1">
          <div
            className="flex flex-col gap-3 px-3.5 py-3"
            aria-live="polite"
          >
            {missingCredentials && (
              <AgentAlert
                title="AI provider not configured"
                action={
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="mt-1 h-auto p-0 text-[11.5px]"
                    onClick={openSettings}
                  >
                    Open AI settings
                  </Button>
                }
              >
                Add an API key so the Calendar Assistant can use its calendar
                tools.
              </AgentAlert>
            )}

            {toolCallingUnsupported && (
              <AgentAlert
                title="This model can’t use calendar tools"
                action={
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="mt-1 h-auto p-0 text-[11.5px]"
                    onClick={openSettings}
                  >
                    Open AI settings
                  </Button>
                }
              >
                Calendar actions need a model with tool calling support. Choose
                a compatible model in AI settings.
              </AgentAlert>
            )}

            {aiConfigError && !missingCredentials && (
              <AgentAlert
                title="Provider information unavailable"
                action={
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="mt-1 h-auto p-0 text-[11.5px]"
                    onClick={openSettings}
                  >
                    Open AI settings
                  </Button>
                }
              >
                {aiConfigError}
              </AgentAlert>
            )}

            {error && (
              <AgentAlert
                title="Something went wrong"
                action={
                  errorNeedsSettings ? (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="mt-1 h-auto p-0 text-[11.5px]"
                      onClick={openSettings}
                    >
                      Open AI settings
                    </Button>
                  ) : null
                }
              >
                {error}
              </AgentAlert>
            )}

            {detailLoading && !detail && (
              <div className="flex flex-col gap-2" aria-hidden="true">
                <Skeleton className="h-9 w-2/3 self-end rounded-[var(--radius-md)]" />
                <Skeleton className="h-16 w-full rounded-[var(--radius-md)]" />
                <Skeleton className="h-12 w-4/5 rounded-[var(--radius-md)]" />
              </div>
            )}

            {showEmptyState && (
              <div className="flex flex-col items-center gap-3 px-1 py-5 text-center">
                <span
                  className="grid size-9 place-items-center rounded-[var(--radius-md)] bg-foreground text-background"
                  aria-hidden="true"
                >
                  <Sparkles size={17} />
                </span>
                <div className="grid gap-1">
                  <h3 className="text-[13px] font-semibold">
                    Ask about your calendar
                  </h3>
                  <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                    Create, move, find or clear events and reminders in plain
                    language.
                  </p>
                </div>
                <div className="grid w-full gap-1.5">
                  {SUGGESTIONS.map((suggestion) => (
                    <Button
                      key={suggestion}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-auto justify-start whitespace-normal px-2.5 py-1.5 text-left text-[11.5px] font-normal"
                      onClick={() => useSuggestion(suggestion)}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => {
              if (message.role === 'user') {
                return (
                  <div
                    key={message.id}
                    className="flex max-w-[85%] flex-col items-end gap-0.5 self-end"
                  >
                    <div className="rounded-[var(--radius-md)] bg-foreground px-3 py-1.5 text-[12.5px] leading-relaxed text-background">
                      <p className="whitespace-pre-wrap break-words">
                        {message.content}
                      </p>
                    </div>
                    <time
                      className="text-[10px] text-muted-foreground"
                      dateTime={message.created_at}
                    >
                      {formatTime(message.created_at)}
                    </time>
                  </div>
                )
              }
              if (message.role === 'assistant') {
                if (!message.content?.trim()) return null
                return (
                  <div
                    key={message.id}
                    className="flex max-w-full flex-col items-start gap-0.5"
                  >
                    <p className="whitespace-pre-wrap break-words text-[12.5px] leading-relaxed">
                      {message.content}
                    </p>
                    <time
                      className="text-[10px] text-muted-foreground"
                      dateTime={message.created_at}
                    >
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
              <div
                className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground"
                role="status"
              >
                <LoaderCircle
                  size={12}
                  className="animate-spin"
                  aria-hidden="true"
                />
                Thinking…
              </div>
            )}

            {pendingActions.length > 0 && (
              <section
                className="grid gap-2 border-t border-border pt-2.5"
                aria-label="Pending confirmations"
              >
                <h3 className="text-[10.5px] font-medium uppercase tracking-[0.07em] text-muted-foreground">
                  Needs your approval
                </h3>
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
        </ScrollArea>

        {notice && (
          <div
            className="border-t border-border bg-muted/40 px-3.5 py-1.5 text-[11px] text-muted-foreground"
            role="status"
          >
            {notice}
          </div>
        )}

        <form
          className="border-t border-border p-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom,0px))]"
          onSubmit={(event) => {
            event.preventDefault()
            handleSend()
          }}
        >
          <div className="flex items-end gap-1.5 rounded-[var(--radius-md)] border border-input bg-background px-1.5 py-1 focus-within:ring-1 focus-within:ring-ring">
            <Textarea
              ref={inputRef}
              className="max-h-[120px] min-h-[32px] flex-1 resize-none border-0 bg-transparent px-1 py-1 text-[16px] shadow-none focus-visible:ring-0 sm:text-[12.5px]"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="Ask about your calendar…"
              rows={1}
              maxLength={8000}
              aria-label="Message the Calendar Assistant"
            />
            <Button
              type="submit"
              size="icon"
              className="size-8 shrink-0 rounded-[var(--radius-sm)]"
              disabled={!input.trim() || sending}
              aria-label="Send message"
              title="Send"
            >
              {sending ? (
                <LoaderCircle
                  size={15}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Send size={15} aria-hidden="true" />
              )}
            </Button>
          </div>
          <p className="mt-1 px-1 text-[10px] text-muted-foreground">
            Enter to send · Shift+Enter for a new line
          </p>
        </form>
      </div>
    </TooltipProvider>
  )

  return (
    <>
      <Button
        ref={fabRef}
        type="button"
        size="icon"
        className={cn(
          'fixed bottom-6 right-4 z-40 size-12 rounded-full shadow-[0_12px_32px_-12px_rgba(16,24,40,0.55)] sm:right-6',
          open && 'pointer-events-none opacity-0',
        )}
        onClick={() => setOpen(true)}
        aria-label="Open Calendar Assistant"
        aria-expanded={open}
        aria-controls="calendar-agent-panel"
        tabIndex={open ? -1 : 0}
      >
        <Sparkles size={20} aria-hidden="true" />
      </Button>

      {open && !narrow && (
        <div
          id="calendar-agent-panel"
          ref={panelRef}
          className="fixed bottom-6 right-4 z-50 flex h-[min(620px,calc(100dvh-7rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card shadow-[0_24px_64px_-28px_rgba(16,24,40,0.4)] focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-2 sm:right-6"
          role="dialog"
          aria-label="Calendar Assistant"
          tabIndex={-1}
        >
          {panel}
        </div>
      )}

      {narrow && (
        <Sheet
          open={open}
          onOpenChange={(next) => {
            if (!next) closePanel()
          }}
        >
          <SheetContent
            id="calendar-agent-panel"
            side="right"
            ref={panelRef}
            data-agent-panel="true"
            className="cal-sheet flex w-full max-w-none flex-col gap-0 border-l-0 p-0 pt-[env(safe-area-inset-top,0px)] [&>button]:hidden"
            aria-label="Calendar Assistant"
          >
            <SheetTitle className="sr-only">Calendar Assistant</SheetTitle>
            <SheetDescription className="sr-only">
              Ask the assistant about your calendar.
            </SheetDescription>
            {open ? panel : null}
          </SheetContent>
        </Sheet>
      )}
    </>
  )
}
