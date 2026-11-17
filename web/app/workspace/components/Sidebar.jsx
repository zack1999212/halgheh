import { NavLink, useLocation } from 'react-router-dom'
import {
  Sidebar as SidebarRoot,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { NAV_ITEMS, isNavItemActive } from '../navigation.js'

function BrandMark() {
  return (
    <span
      className="flex size-[30px] shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-white/15 bg-white/[0.08]"
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-[18px]">
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="2.6" fill="currentColor" />
      </svg>
    </span>
  )
}

/**
 * Primary application navigation.
 *
 * Built on the shadcn/ui Sidebar primitives: docked and collapsible to icons
 * above 1024px, a Sheet below it. Labels collapse away with the sidebar width
 * and reappear as tooltips, and every destination comes from `navigation.js`
 * so the routes stay defined in one place.
 */
export default function Sidebar({ items = NAV_ITEMS }) {
  const { pathname } = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()

  // The mobile sidebar lives in a Sheet; a chosen destination closes it.
  function handleNavigate() {
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  return (
    <SidebarRoot collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-3 pb-4 pt-1 text-sidebar-primary group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <BrandMark />
          <span className="truncate text-[15px] font-semibold tracking-[-0.01em] group-data-[collapsible=icon]:hidden">
            Halgheh
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="pb-2 pt-0">
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const Icon = item.icon
                const active = isNavItemActive(item, pathname)

                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                      className="relative h-9 gap-[10px] rounded-[var(--radius-sm)] px-3 font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground before:absolute before:left-0 before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-sidebar-primary before:opacity-0 data-[active=true]:before:opacity-100 group-data-[collapsible=icon]:before:hidden"
                    >
                      <NavLink to={item.to} onClick={handleNavigate}>
                        <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
                        <span>{item.label}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </SidebarRoot>
  )
}
