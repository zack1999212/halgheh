import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ALL_WORKSPACES } from '../constants.js'

function scopeValue(value) {
  if (value === ALL_WORKSPACES) return ALL_WORKSPACES
  if (value == null || value === '') return ''
  return String(value)
}

export default function WorkspaceScopeSelect({
  value,
  onValueChange,
  workspaces = [],
  includeAll = true,
  disabled = false,
  className = '',
  triggerClassName = '',
  ariaLabel = 'Workspace filter',
}) {
  const items = Array.isArray(workspaces) ? workspaces : []
  return (
    <Select
      value={scopeValue(value)}
      onValueChange={(next) => {
        if (next === ALL_WORKSPACES) {
          onValueChange?.(ALL_WORKSPACES)
          return
        }
        const parsed = Number(next)
        onValueChange?.(Number.isFinite(parsed) ? parsed : next)
      }}
      disabled={disabled}
    >
      <SelectTrigger
        className={triggerClassName || className || 'h-9 w-[220px]'}
        aria-label={ariaLabel}
      >
        <SelectValue placeholder="Select workspace" />
      </SelectTrigger>
      <SelectContent>
        {includeAll && (
          <SelectItem value={ALL_WORKSPACES}>All Workspaces</SelectItem>
        )}
        {items.map((workspace) => (
          <SelectItem key={workspace.id} value={String(workspace.id)}>
            {workspace.name}
            {workspace.workspace_type === 'personal' ? ' (Personal)' : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
