import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  CalendarDays,
  Check,
  Files,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const MODULES = [
  { key: 'workspace', name: 'Workspace', to: '/workspace', icon: LayoutDashboard },
  { key: 'calendar', name: 'Calendar', to: '/calendar', icon: CalendarDays },
  { key: 'tasks', name: 'Tasks', to: '/tasks', icon: ListChecks },
  { key: 'documents', name: 'Documents', to: '/documents', icon: Files },
]

function isModuleActive(pathname, to) {
  return pathname === to || pathname.startsWith(`${to}/`)
}

export default function ModuleSwitcher() {
  const location = useLocation()
  const navigate = useNavigate()

  const activeKey = useMemo(() => {
    const match = MODULES.find((module) => isModuleActive(location.pathname, module.to))
    return match?.key || null
  }, [location.pathname])

  return (
    <DropdownMenu>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-[34px] text-muted-foreground hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
                aria-label="Switch module"
              >
                <LayoutGrid className="size-[18px]" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">Switch module</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <DropdownMenuContent align="end" sideOffset={8} className="w-56 rounded-[var(--radius-md)] p-1.5">
        <DropdownMenuLabel className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          Modules
        </DropdownMenuLabel>
        {MODULES.map((module) => {
          const Icon = module.icon
          const active = activeKey === module.key
          return (
            <DropdownMenuItem
              key={module.key}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-2 text-sm',
                active && 'bg-accent font-medium text-accent-foreground'
              )}
              onSelect={() => navigate(module.to)}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="flex-1">{module.name}</span>
              {active && <Check className="size-4 shrink-0 text-foreground" aria-hidden="true" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
