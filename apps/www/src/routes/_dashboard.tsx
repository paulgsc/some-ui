import type { JSX } from "react"
import {
  createFileRoute,
  Link,
  Outlet,
  useRouterState,
} from "@tanstack/react-router"
import { FileText, Home, ListVideo, Settings, User } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "some-ui-shared"
import { cn } from "some-ui-utils"

import { ThemeSwitcher } from "@/components/theme-switcher"

/**
 * Matches only the session player route (/sessions/$sessionId), whose
 * content owns a fixed viewport V (see docs/session-viewport) — the
 * dashboard shell must not let the page scroll here, or V is never
 * genuinely bounded. Every other route, including /sessions and
 * /sessions/new, stays an ordinary scrolling document.
 */
const SESSION_PLAYER_PATH = /^\/sessions\/(?!new$)[^/]+$/

function isViewportPath(pathname: string): boolean {
  return SESSION_PLAYER_PATH.test(pathname)
}

type NavItem = {
  to: "/app" | "/sessions" | "/resume" | "/profile" | "/settings"
  label: string
  icon: typeof Home
}

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { to: "/app", label: "Home", icon: Home },
  { to: "/sessions", label: "Sessions", icon: ListVideo },
  { to: "/resume", label: "Résumé", icon: FileText },
  { to: "/profile", label: "Profile", icon: User },
  { to: "/settings", label: "Settings", icon: Settings },
]

function isNavItemActive(itemPath: NavItem["to"], pathname: string): boolean {
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`)
}

const DashboardLayout = (): JSX.Element => {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const isViewportRoute = isViewportPath(pathname)

  return (
    <SidebarProvider className={cn(isViewportRoute && "h-svh overflow-hidden")}>
      <Sidebar>
        <SidebarHeader>
          <div className="text-gradient-accent px-2 py-1.5 text-sm font-semibold">
            Some UI
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_ITEMS.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      isActive={isNavItemActive(item.to, pathname)}
                    >
                      <Link to={item.to}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <ThemeSwitcher />
        </header>
        <div
          className={cn(
            "flex-1 p-6",
            isViewportRoute ? "min-h-0 overflow-hidden" : "overflow-auto"
          )}
        >
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export const Route = createFileRoute("/_dashboard")({
  component: DashboardLayout,
})
