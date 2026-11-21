import { useEffect, useMemo, useState } from 'react'
import DialogShell from '@/components/shared/DialogShell'
import FormError from '@/components/shared/FormError'
import FormField, { fieldInputClass } from '@/components/shared/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { createProject, updateProject } from '../api.js'
import { PROJECT_COLORS, PROJECT_ICON_OPTIONS, PROJECT_STATUSES } from '../utils/projectConstants.js'
import { getProjectIcon } from '../utils/projectFormat.js'

const NO_COLOR = '__none__'
const NO_ICON = '__none__'

function normalizeOptional(value) {
  const trimmed = typeof value === 'string' ? value.trim() : value
  return trimmed ? trimmed : null
}

function buildPayload(form) {
  return {
    name: form.name.trim(),
    description: normalizeOptional(form.description),
    start_date: form.startDate || null,
    target_date: form.targetDate || null,
    color: form.color === NO_COLOR ? null : form.color,
    icon: form.icon === NO_ICON ? null : form.icon,
  }
}

function getInitialForm(project) {
  if (!project) {
    return {
      name: '',
      description: '',
      status: 'active',
      startDate: '',
      targetDate: '',
      color: NO_COLOR,
      icon: NO_ICON,
    }
  }
  return {
    name: project.name || '',
    description: project.description || '',
    status: project.status || 'active',
    startDate: project.start_date || '',
    targetDate: project.target_date || '',
    color: project.color || NO_COLOR,
    icon: project.icon || NO_ICON,
  }
}

export default function ProjectDialog({
  open,
  mode = 'create',
  project = null,
  onClose,
  onSaved,
}) {
  const isEdit = mode === 'edit' && Boolean(project)
  const [form, setForm] = useState(() => getInitialForm(project))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  useEffect(() => {
    if (!open) return
    setForm(getInitialForm(project))
    setSaving(false)
    setError('')
    setFieldErrors({})
  }, [open, project, isEdit])

  const editableStatuses = useMemo(
    () => PROJECT_STATUSES.filter((s) => s.id !== 'archived'),
    [],
  )

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setFieldErrors((prev) => ({ ...prev, [key]: '' }))
  }

  function validate() {
    const errs = {}
    if (!form.name.trim()) errs.name = 'Project name is required.'
    else if (form.name.trim().length > 200) errs.name = 'Project name must be 200 characters or fewer.'
    if (form.startDate && form.targetDate && form.targetDate < form.startDate) {
      errs.targetDate = 'Target date must not be earlier than start date.'
    }
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (saving) return
    setError('')
    if (!validate()) return

    setSaving(true)
    try {
      const payload = buildPayload(form)
      let saved
      if (!isEdit) {
        saved = await createProject(payload)
      } else {
        const patch = {}
        if (payload.name !== (project.name || '')) patch.name = payload.name
        if ((payload.description || null) !== (project.description || null)) patch.description = payload.description
        if ((payload.start_date || null) !== (project.start_date || null)) patch.start_date = payload.start_date
        if ((payload.target_date || null) !== (project.target_date || null)) patch.target_date = payload.target_date
        if ((payload.color || null) !== (project.color || null)) patch.color = payload.color
        if ((payload.icon || null) !== (project.icon || null)) patch.icon = payload.icon
        // Allow status changes among non-archived states here; archive/restore use dedicated actions.
        if (form.status && form.status !== 'archived' && form.status !== project.status && project.status !== 'archived') {
          patch.status = form.status
        }
        if (Object.keys(patch).length === 0) {
          onClose?.()
          return
        }
        saved = await updateProject(project.id, patch)
      }
      onSaved?.(saved, { mode: isEdit ? 'edit' : 'create' })
      onClose?.()
    } catch (err) {
      setError(err?.message || 'Could not save the project.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <DialogShell
      open={open}
      wide
      title={isEdit ? 'Edit project' : 'New project'}
      description={isEdit ? 'Update project details and settings.' : 'Create a new project. You will be set as the project owner.'}
      onClose={saving ? () => {} : onClose}
      footer={
        <>
          <Button type="button" variant="outline" className="h-9" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="project-dialog-form" className="h-9" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create project'}
          </Button>
        </>
      }
    >
      <form id="project-dialog-form" className="grid gap-4" onSubmit={handleSubmit}>
        <FormError>{error}</FormError>

        <FormField id="project-name" label="Project name" error={fieldErrors.name}>
          {(field) => (
            <Input
              {...field}
              className={cn(fieldInputClass, fieldErrors.name && 'border-destructive/40 focus-visible:ring-destructive/30')}
              value={form.name}
              maxLength={200}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="e.g. Website Redesign"
              disabled={saving}
              autoFocus
            />
          )}
        </FormField>

        <div className="grid gap-2">
          <Label htmlFor="project-description" className="text-[13px] font-medium">
            Description <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="project-description"
            className="min-h-[96px] rounded-[var(--radius-md)] px-3 py-2 text-base md:text-[15px]"
            value={form.description}
            onChange={(e) => updateField('description', e.target.value)}
            disabled={saving}
            placeholder="What is this project about?"
          />
        </div>

        {isEdit && project?.status !== 'archived' && (
          <div className="grid gap-2">
            <Label htmlFor="project-status" className="text-[13px] font-medium">Status</Label>
            <Select value={form.status} onValueChange={(v) => updateField('status', v)} disabled={saving}>
              <SelectTrigger id="project-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {editableStatuses.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[12px] text-muted-foreground">Use the Archive action for archived projects.</p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="project-start-date" className="text-[13px] font-medium">Start date</Label>
            <Input
              id="project-start-date"
              type="date"
              className={fieldInputClass}
              value={form.startDate}
              onChange={(e) => updateField('startDate', e.target.value)}
              disabled={saving}
            />
          </div>
          <FormField id="project-target-date" label="Target date" error={fieldErrors.targetDate}>
            {(field) => (
              <Input
                {...field}
                type="date"
                className={cn(fieldInputClass, fieldErrors.targetDate && 'border-destructive/40 focus-visible:ring-destructive/30')}
                value={form.targetDate}
                onChange={(e) => updateField('targetDate', e.target.value)}
                disabled={saving}
              />
            )}
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label className="text-[13px] font-medium">Project color <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => updateField('color', NO_COLOR)}
                className={cn(
                  'h-8 rounded-full border px-3 text-[12px] font-medium',
                  form.color === NO_COLOR ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-foreground hover:bg-accent/60'
                )}
                disabled={saving}
              >
                None
              </button>
              {PROJECT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  title={color}
                  aria-label={`Select color ${color}`}
                  onClick={() => updateField('color', color)}
                  disabled={saving}
                  className={cn(
                    'size-8 rounded-full border-2 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    form.color === color ? 'scale-110 border-foreground' : 'border-transparent hover:scale-105'
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="project-icon" className="text-[13px] font-medium">Project icon <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Select value={form.icon} onValueChange={(v) => updateField('icon', v)} disabled={saving}>
              <SelectTrigger id="project-icon"><SelectValue placeholder="Select icon" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ICON}>None</SelectItem>
                {PROJECT_ICON_OPTIONS.map((opt) => {
                  const Icon = getProjectIcon(opt.id)
                  return (
                    <SelectItem key={opt.id} value={opt.id}>
                      <span className="inline-flex items-center gap-2">
                        <Icon size={14} aria-hidden="true" />
                        {opt.label}
                      </span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>
        </div>
      </form>
    </DialogShell>
  )
}
