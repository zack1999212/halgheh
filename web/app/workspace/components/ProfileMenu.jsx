import { Bot, ChevronDown, LogOut, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

function initialsFor(user) {
  const source = (user?.name || user?.username || '').trim()
  if (!source) {
    return '·'
  }
  const parts = source.split(/\s+/).slice(0, 2)
  return parts.map((part) => part.charAt(0).toUpperCase()).join('')
}

function memberSince(user) {
  if (!user?.created_at) {
    return null
  }
  return new Date(user.created_at).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Account menu for the application header.
 *
 * The identity summary, the disabled profile-settings entry and the log-out
 * action are the same as the previous hand-rolled panel, now rendered with
 * shadcn/ui DropdownMenu and Avatar for focus handling and dismissal.
 */
export default function ProfileMenu({ user, onLogout }) {
  const navigate = useNavigate()
  const displayName = user?.name?.trim() || user?.username || 'Your account'
  const initials = initialsFor(user)
  const since = memberSince(user)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full border border-transparent py-[3px] pl-[3px] pr-1.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-accent"
          aria-label="Open profile menu"
        >
          <Avatar className="size-7">
            <AvatarFallback className="bg-foreground text-[11px] font-semibold tracking-[0.02em] text-background">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="max-w-[140px] truncate text-[13px] font-medium max-sm:hidden">
            {displayName}
          </span>
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-64 rounded-[var(--radius-md)] p-2"
      >
        <DropdownMenuLabel className="flex items-start gap-3 px-2 pb-3 pt-2 font-normal">
          <Avatar className="size-7">
            <AvatarFallback className="bg-foreground text-[11px] font-semibold tracking-[0.02em] text-background">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="flex min-w-0 flex-col gap-px">
            <span className="truncate text-[13px] font-semibold">{displayName}</span>
            {user?.username && (
              <span className="text-xs text-muted-foreground">@{user.username}</span>
            )}
            {since && (
              <span className="mt-0.5 text-[11px] text-muted-foreground/70">
                Member since {since}
              </span>
            )}
          </span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem disabled className="gap-2 px-2 py-[7px]">
          <Settings size={15} aria-hidden="true" />
          Profile settings
          <span className="ml-auto text-[10.5px] text-muted-foreground">Soon</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          onSelect={() => navigate('/settings/ai')}
          className="gap-2 px-2 py-[7px]"
        >
          <Bot size={15} aria-hidden="true" />
          AI agent config
        </DropdownMenuItem>

        <DropdownMenuItem
          onSelect={onLogout}
          className="gap-2 px-2 py-[7px] text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut size={15} aria-hidden="true" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
