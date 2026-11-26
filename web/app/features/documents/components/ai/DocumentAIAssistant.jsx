import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Bot, Check, Copy, LoaderCircle, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import {
  aiAskDocument,
  aiGenerateDocument,
  aiImproveDocument,
  aiSummarizeDocument,
} from '../../api/client.js'

const ACTIONS = [
  { id: 'summary', label: 'Summary' },
  { id: 'ask', label: 'Ask' },
  { id: 'improve', label: 'Improve' },
  { id: 'generate', label: 'Generate' },
]

const IMPROVE_ACTIONS = [
  { value: 'rewrite', label: 'Rewrite' },
  { value: 'clarify', label: 'Clarify' },
  { value: 'grammar', label: 'Grammar' },
  { value: 'format', label: 'Format' },
]

function friendlyError(error) {
  const msg = error?.message || 'The AI request failed.'
  if (error?.name === 'AbortError') return 'The request was cancelled.'
  return msg
}

function ResultBlock({ title, result, onCopy }) {
  if (!result) return null
  return (
    <div className="grid gap-2 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{title}</p>
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-[12px]" onClick={onCopy}>
          <Copy size={13} aria-hidden="true" />Copy
        </Button>
      </div>
      <div dir="auto" className="whitespace-pre-wrap break-words text-start text-[13px] leading-6 text-foreground [unicode-bidi:plaintext]">{result.content}</div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span>AI-generated</span>
        {result.model_label || result.model ? <span>Model: {result.model_label || result.model}</span> : null}
        {result.provider_label || result.provider ? <span>Provider: {result.provider_label || result.provider}</span> : null}
        {result.context_included ? <span>Related context included</span> : null}
        {result.related_documents_used ? <span>{result.related_documents_used} related doc(s) used</span> : null}
        {result.truncated ? <span>Context truncated</span> : null}
      </div>
      {result.warning ? <p dir="auto" className="text-[12px] text-muted-foreground [unicode-bidi:plaintext]">{result.warning}</p> : null}
    </div>
  )
}

export default function DocumentAIAssistant({
  open,
  onOpenChange,
  document: doc,
  canApply,
  onApplyContent,
  getEditSeq,
}) {
  const [action, setAction] = useState('summary')
  const [question, setQuestion] = useState('')
  const [instruction, setInstruction] = useState('')
  const [improveAction, setImproveAction] = useState('rewrite')
  const [selectedText, setSelectedText] = useState('')
  const [useContext, setUseContext] = useState(true)
  const [includeRelated, setIncludeRelated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [resultMeta, setResultMeta] = useState(null)
  const [applyConfirm, setApplyConfirm] = useState(false)
  const [resultEditSeq, setResultEditSeq] = useState(null)
  const abortRef = useRef(null)
  const inFlightRef = useRef(false)
  const activeDocId = doc?.id

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort()
      abortRef.current = null
      inFlightRef.current = false
      setLoading(false)
    }
  }, [open])

  useEffect(() => {
    // Reset when document changes to avoid leaking results across docs.
    setResult(null)
    setResultMeta(null)
    setError('')
    setApplyConfirm(false)
    setResultEditSeq(null)
    abortRef.current?.abort()
    abortRef.current = null
    inFlightRef.current = false
    setLoading(false)
  }, [activeDocId])

  async function run(requestFn, meta = null) {
    if (!doc?.id || loading || inFlightRef.current) return
    inFlightRef.current = true
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError('')
    setApplyConfirm(false)
    try {
      const response = await requestFn(controller.signal)
      if (controller.signal.aborted) return
      setResult(response)
      setResultMeta(meta)
      setResultEditSeq(getEditSeq ? getEditSeq() : 0)
    } catch (e) {
      if (e?.name === 'AbortError') return
      setError(friendlyError(e))
      setResult(null)
      setResultMeta(null)
      setResultEditSeq(null)
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
        setLoading(false)
      }
      inFlightRef.current = false
    }
  }

  function handleCopy() {
    if (!result?.content) return
    navigator.clipboard?.writeText(result.content).catch(() => {})
  }

  function handleApply() {
    if (!result?.content || !canApply) return
    const currentSeq = getEditSeq ? getEditSeq() : 0
    if (resultEditSeq !== null && currentSeq !== resultEditSeq) {
      setError('The document changed since this AI result was generated. Regenerate the AI result to apply it safely.')
      setApplyConfirm(false)
      return
    }
    if (!applyConfirm) {
      setApplyConfirm(true)
      return
    }
    const applied = onApplyContent(result.content, resultMeta || {})
    if (applied !== true) {
      setError(
        typeof applied === 'string' && applied
          ? applied
          : 'Could not safely apply the selected-text improvement. The original selected text was not found in the current editor.',
      )
      setApplyConfirm(false)
      return
    }
    setApplyConfirm(false)
  }

  const canRun = !loading && !!doc?.id
  const askReady = canRun && question.trim().length > 0
  const improveReady = canRun
  const generateReady = canRun && instruction.trim().length > 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl" aria-label="AI assistant">
        <SheetHeader className="pr-8">
          <SheetTitle className="flex items-center gap-2"><Sparkles size={16} aria-hidden="true" />AI Assistant</SheetTitle>
          <SheetDescription>
            AI-generated suggestions for this document. Review before applying any changes.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 grid gap-4">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="AI actions">
            {ACTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={action === item.id}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  action === item.id ? 'border-foreground bg-foreground text-background' : 'border-border bg-background text-foreground hover:bg-accent',
                )}
                onClick={() => { setAction(item.id); setError(''); setApplyConfirm(false) }}
              >
                {item.label}
              </button>
            ))}
          </div>

          {!canApply && (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground">
              This document is read-only or in the trash. You can review AI results, but applying changes is disabled.
            </div>
          )}

          <label className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-[13px] text-muted-foreground">
            <input type="checkbox" className="mt-0.5" checked={includeRelated} onChange={(e) => setIncludeRelated(e.target.checked)} />
            <span>
              <span className="font-medium text-foreground">Include related documents</span>
              <span className="block text-[12px]">Adds accessible linked documents and backlinks as context. Private/inaccessible docs are never included.</span>
            </span>
          </label>

          {action === 'summary' && (
            <div className="grid gap-2">
              <p className="text-[13px] text-muted-foreground">Generate a concise summary of the current document.</p>
              <Button type="button" onClick={() => run((signal) => aiSummarizeDocument(doc.id, { maxPoints: 6, includeRelated, signal }), { action: 'summary' })} disabled={!canRun}>
                {loading ? <><LoaderCircle size={14} className="mr-2 animate-spin" />Generating...</> : 'Generate summary'}
              </Button>
            </div>
          )}

          {action === 'ask' && (
            <div className="grid gap-2">
              <label className="text-[13px] font-medium" htmlFor="ai-question">Question about this document</label>
              <Textarea id="ai-question" dir="auto" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask a question about the document... / سوال خود را درباره سند بپرسید..." className="min-h-[96px] [unicode-bidi:plaintext]" />
              <Button type="button" onClick={() => run((signal) => aiAskDocument(doc.id, { question: question.trim(), includeRelated, signal }), { action: 'ask' })} disabled={!askReady}>
                {loading ? <><LoaderCircle size={14} className="mr-2 animate-spin" />Asking...</> : 'Ask AI'}
              </Button>
            </div>
          )}

          {action === 'improve' && (
            <div className="grid gap-2">
              <label className="text-[13px] font-medium" htmlFor="ai-improve-action">Improvement type</label>
              <select id="ai-improve-action" className="h-9 rounded-md border border-input bg-background px-3 text-[13px]" value={improveAction} onChange={(e) => setImproveAction(e.target.value)}>
                {IMPROVE_ACTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
              <label className="text-[13px] font-medium" htmlFor="ai-selected-text">Selected text (optional)</label>
              <Textarea id="ai-selected-text" dir="auto" value={selectedText} onChange={(e) => setSelectedText(e.target.value)} placeholder="Paste text to improve, or leave empty to improve the whole document." className="min-h-[96px] [unicode-bidi:plaintext]" />
              <label className="text-[13px] font-medium" htmlFor="ai-improve-instruction">Instruction (optional)</label>
              <Input id="ai-improve-instruction" dir="auto" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="e.g. Make it more concise / مثلا کوتاه‌تر و رسمی‌تر بنویس" className="[unicode-bidi:plaintext]" />
              <Button type="button" onClick={() => run((signal) => aiImproveDocument(doc.id, { action: improveAction, selectedText: selectedText.trim() || null, instruction: instruction.trim() || null, includeRelated, signal }), { action: 'improve', improveAction, selectedText: selectedText.trim() || null })} disabled={!improveReady}>
                {loading ? <><LoaderCircle size={14} className="mr-2 animate-spin" />Improving...</> : 'Generate improvement'}
              </Button>
            </div>
          )}

          {action === 'generate' && (
            <div className="grid gap-2">
              <label className="text-[13px] font-medium" htmlFor="ai-generate-instruction">Draft instruction</label>
              <Textarea id="ai-generate-instruction" dir="auto" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Describe the draft you want... / پیش‌نویس مورد نظر را توضیح دهید..." className="min-h-[110px] [unicode-bidi:plaintext]" />
              <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <input type="checkbox" checked={useContext} onChange={(e) => setUseContext(e.target.checked)} />
                Use current document as context
              </label>
              <Button type="button" onClick={() => run((signal) => aiGenerateDocument(doc.id, { instruction: instruction.trim(), useDocumentContext: useContext, includeRelated, signal }), { action: 'generate' })} disabled={!generateReady}>
                {loading ? <><LoaderCircle size={14} className="mr-2 animate-spin" />Generating...</> : 'Generate draft'}
              </Button>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-[13px] text-muted-foreground">
              <span className="flex items-center gap-2"><LoaderCircle size={14} className="animate-spin" />{action === 'summary' ? 'Generating summary...' : action === 'ask' ? 'Asking AI...' : action === 'improve' ? 'Generating improvement...' : 'Generating draft...'}</span>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => abortRef.current?.abort()}>Cancel</Button>
            </div>
          )}

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span dir="auto" className="[unicode-bidi:plaintext]">{error}</span>
            </div>
          )}

          {result && !loading && (
            <div className="grid gap-3">
              <ResultBlock title={result.kind === 'answer' ? 'AI answer' : result.kind === 'summary' ? 'AI summary' : result.kind === 'improvement' ? 'AI improvement preview' : 'AI draft preview'} result={result} onCopy={handleCopy} />

              {(result.kind === 'improvement' || result.kind === 'draft') && (
                <div className="grid gap-2 rounded-lg border border-border p-3">
                  <p className="text-[13px] font-medium">Apply to document</p>
                  <p className="text-[12px] text-muted-foreground">
                    Preview above is AI-generated. Applying will replace the current editor content only after your explicit confirmation. Unsaved local edits are preserved until you confirm.
                  </p>
                  {!canApply ? (
                    <p className="text-[12px] text-muted-foreground">Applying is disabled for read-only or trashed documents.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant={applyConfirm ? 'default' : 'outline'} onClick={handleApply}>
                        {applyConfirm ? 'Confirm apply to editor' : 'Apply to editor...'}
                      </Button>
                      {applyConfirm && <Button type="button" variant="ghost" onClick={() => setApplyConfirm(false)}>Cancel</Button>}
                    </div>
                  )}
                  {applyConfirm && canApply && (
                    <p className="text-[12px] text-muted-foreground">Click “Confirm apply to editor” to replace the editor draft content. This will use the normal autosave flow.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {!result && !loading && !error && (
            <div className="rounded-md border border-dashed border-border px-3 py-4 text-[13px] text-muted-foreground">
              <div className="flex items-center gap-2 font-medium text-foreground"><Bot size={14} />Ready</div>
              <p className="mt-1">Choose an action to generate an AI summary, answer, improvement, or draft for this document.</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
