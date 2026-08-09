import type { ComponentType, JSX } from "react"
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
} from "@some-ui/shared"
import {
  createFileRoute,
  Link,
  Outlet,
  useRouterState,
} from "@tanstack/react-router"
import { FileText, ListVideo, Settings, User } from "lucide-react"
import { cn } from "some-ui-utils"

import { AmbientIntentStatus } from "@/lib/intent/render"
import { useMigrationSignal } from "@/lib/tenant/migration-signal"
import { AudioIndicator } from "@/components/audio/audio-indicator"
import { HexCombMark } from "@/components/brand/hex-comb-mark"
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
  // Widened from `typeof Home` so the brand mark sits alongside the lucide
  // glyphs. Both are sized the same way, by the sidebar's own `[&>svg]:size-4`
  // rule rather than by anything either component asks for.
  icon: ComponentType<{ className?: string }>
}

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  // Home is the app's front door, so it gets the mark rather than a generic
  // house — the same seven-cell comb as the favicon and the landing hero.
  { to: "/app", label: "Home", icon: HexCombMark },
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
  const migrationSignal = useMigrationSignal()

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
          {/* Layer 1 of audio disclosure: a standing indicator of what this
              app may play, always visible and never interrupting. It is the
              canonical place a person learns this app has audio, and the
              place the first-use notices point back to. */}
          <AudioIndicator />
          {/* #947: sessions-backend.ts's partial-migration outcome, ambient
              per #940 - quiet unless there's something to say, and never
              silent when there is. */}
          <AmbientIntentStatus state={migrationSignal} className="ml-2" />
        </header>
        <div
          className={cn(
            "flex-1 p-6",
            // scroll-intent: page — an ordinary document route scrolls as a
            // page. The viewport route is the bounded one, and takes the
            // overflow-hidden branch precisely so it cannot (docs/ui-fit,
            // docs/session-viewport/02-kill-the-cutoff.md).
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
