import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { getActivityDescription, getActivityEventConfig, getActivityTarget } from '../utils/activityConfig.js'
import { formatActivityDateTime, formatRelativeTime } from '../utils/projectFormat.js'

const ICON_TONE_CLASSES = {
  task: 'bg-[#FFF7D6] text-[#8A6A00] border-[#F0DCA0]',
  document: 'bg-[#EEF4FF] text-[#3F6FC9] border-[#D7E4FF]',
  milestone: 'bg-[#F3EEFF] text-[#6D4BC3] border-[#DDD0FF]',
  member: 'bg-[#EDF8F2] text-[#2F7A57] border-[#CEEBDD]',
  calendar: 'bg-[#FFF1EB] text-[#C65322] border-[#FFD8C8]',
  default: 'bg-[#F7F5F1] text-[#5F5A51] border-[#E7E1D8]',
}

export default function ProjectActivityItem({ activity, projectId, compact = false }) {
  const cfg = getActivityEventConfig(activity?.event_type)
  const desc = getActivityDescription(activity)
  const Icon = cfg.icon
  const iconTone = ICON_TONE_CLASSES[cfg.tone] || ICON_TONE_CLASSES.default
  const target = getActivityTarget(projectId, activity)
  const relative = formatRelativeTime(activity?.created_at)
  const exact = formatActivityDateTime(activity?.created_at)

  const content = (
    <>
      <div className={cn('min-w-0 flex-1', compact ? '' : '')}>
        <p className={cn('text-[#191919]', compact ? 'text-[13px] leading-snug' : 'text-[14px] leading-relaxed')}>
          <span className="font-semibold text-[#191919]">{desc.actor}</span>{' '}
          <span className="text-[#6B665F]">{desc.action}</span>
          {desc.target ? (
            <>
              {' '}
              <span className="font-semibold text-[#191919]">{desc.target}</span>
            </>
          ) : null}
        </p>

        {desc.detail ? (
          <p className={cn('mt-1 text-[#6B665F]', compact ? 'text-[12px]' : 'text-[13px]')}>
            {desc.detail}
          </p>
        ) : null}

        <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-[#8A847B]', compact ? 'mt-1 text-[11.5px]' : 'mt-2.5 text-[12px]')}>
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <time dateTime={activity?.created_at || undefined} className="cursor-default">
                  {relative}
                </time>
              </TooltipTrigger>
              <TooltipContent side="top">{exact}</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {target ? (
            <>
              <span aria-hidden="true" className="text-[#CFC7BC]">•</span>
              <Link
                to={target.to}
                state={target.state}
                className="inline-flex items-center gap-1 font-medium text-[#8A6A00] transition-colors hover:text-[#6F5600] hover:underline"
              >
                {target.label}
                <ArrowUpRight size={12} aria-hidden="true" />
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </>
  )

  if (compact) {
    return (
      <div className="flex min-w-0 items-start gap-3 py-2.5">
        <span
          className={cn(
            'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border',
            iconTone,
          )}
          aria-hidden="true"
        >
          <Icon size={14} />
        </span>
        {content}
      </div>
    )
  }

  return (
    <div className="group relative pl-8 sm:pl-10">
      <span className="project-3d-timeline-line absolute left-[6px] top-[22px] bottom-[-13px] group-last:hidden sm:left-[7px]" aria-hidden="true" />
      <span className="project-3d-timeline-marker absolute left-0 top-[22px] sm:left-[1px]" aria-hidden="true" />

      <div className="project-3d-card project-3d-card-interactive min-w-0 px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          <span
            className={cn(
              'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]',
              iconTone,
            )}
            aria-hidden="true"
          >
            <Icon size={16} strokeWidth={2} />
          </span>
          {content}
        </div>
      </div>
    </div>
  )
}
