import { useState } from 'react'
import { SmilePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

const QUICK_EMOJIS = ['👍', '❤️', '🎉', '👀', '🚀', '💡']

export default function ProjectReactionBar({
  reactions = [],
  canReact = false,
  disabled = false,
  onToggle,
  compact = false,
}) {
  const [pickerOpen, setPickerOpen] = useState(false)

  async function handleToggle(emoji, currentlyReacted = false) {
    if (!canReact || disabled) return
    await onToggle?.(emoji, currentlyReacted)
    setPickerOpen(false)
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', compact && 'gap-1')}>
      {reactions.map((r) => {
        const active = Boolean(r.reacted_by_me)
        return (
          <button
            key={r.emoji}
            type="button"
            disabled={disabled || (!canReact && !active)}
            onClick={() => handleToggle(r.emoji, active)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-all duration-150',
              compact ? 'px-2 py-0.5 text-[11px] gap-1' : '',
              active
                ? 'border-[#F0D76A] bg-[#FFF7D6] text-[#6F5600] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]'
                : 'border-[#E7E1D8] bg-white text-[#6B665F] shadow-[0_1px_1px_rgba(25,25,25,0.02)] hover:border-[#D9D2C5] hover:bg-[#FBFAF7] hover:text-[#191919]',
              (disabled || (!canReact && !active)) && 'cursor-default opacity-90',
            )}
            aria-pressed={active}
            aria-label={`${r.emoji} reaction, ${r.count}${active ? ', you reacted' : ''}`}
          >
            <span aria-hidden="true">{r.emoji}</span>
            <span className="font-medium tabular-nums">{r.count}</span>
          </button>
        )
      })}

      {canReact && (
        <DropdownMenu open={pickerOpen} onOpenChange={setPickerOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              className={cn(
                'h-7 rounded-full border-[#E7E1D8] bg-white px-2.5 text-[#6B665F] shadow-[0_1px_1px_rgba(25,25,25,0.02)] hover:bg-[#F7F5F1] hover:text-[#191919]',
                compact && 'h-6 px-2 text-[11px]',
              )}
              aria-label="Add reaction"
            >
              <SmilePlus size={14} aria-hidden="true" />
              {!compact && <span className="text-[12px]">React</span>}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-auto rounded-xl border-[#E7E1D8] p-2 shadow-[0_8px_24px_rgba(25,25,25,0.08)]">
            <div className="flex items-center gap-1">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="grid size-8 place-items-center rounded-lg text-lg transition-colors hover:bg-[#F7F5F1]"
                  onClick={() => handleToggle(emoji, Boolean(reactions.find((r) => r.emoji === emoji)?.reacted_by_me))}
                  aria-label={`React with ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
