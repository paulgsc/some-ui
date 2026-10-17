import type { ComponentType, JSX } from "react"
import { cn } from "@some-ui/core-utils"
import { useIsMobile } from "@some-ui/react-hooks"
import {
  BrandMark,
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
  useSidebar,
} from "@some-ui/shared"
import {
  createFileRoute,
  Link,
  Outlet,
  useRouterState,
} from "@tanstack/react-router"
import { FileText, ListVideo, Settings, User } from "lucide-react"

import { authority } from "@/lib/authority"
import { MOBILE_APP } from "@/lib/build-profile"
import { useIsTerminal } from "@/lib/orchestrator"
import { useIsDeclaredBounded } from "@/lib/route-bounds"
import { wingOf } from "@/lib/wings"
import { AudioIndicator } from "@/components/audio/audio-indicator"
import { AccountUnavailableBanner } from "@/components/auth/account-unavailable-banner"
import { LocIndicator } from "@/components/loc/loc-indicator"
import {
  MobileNav,
  MobileSettingsLink,
  MobileWayOut,
} from "@/components/mobile-shell"
import { DeviceStoragePrompt } from "@/components/settings/device-storage"
import { SiteLauncher } from "@/components/site-launcher"
import { ThemeSwitcher } from "@/components/theme-switcher"

/**
 * Matches only the session player route (/sessions/$sessionId), whose
 * content owns a fixed viewport V (docs/session-viewport): the shell must not
 * let the page scroll here, or V is never bounded.
 */
const SESSION_PLAYER_PATH = /^\/sessions\/(?!new$)[^/]+$/

/**
 * The composer (/sessions/new), the shell's second bounded surface: fixed
 * chrome (step rail, Back/Continue) around one variable body, which must stay
 * reachable. Bounding it makes the body `flex-1 min-h-0`, so every step fits
 * by construction at every viewport (docs/ui-fit).
 */
const COMPOSER_PATH = /^\/sessions\/new$/

function isViewportPath(pathname: string): boolean {
  return SESSION_PLAYER_PATH.test(pathname)
}

function isComposerPath(pathname: string): boolean {
  return COMPOSER_PATH.test(pathname)
}

/** The web app's sidebar. The Android app has its own bar (`MobileNav`). */
type NavItem = {
  to: "/app" | "/sessions" | "/resume" | "/profile" | "/settings"
  label: string
  // Widened from `typeof Home` so the brand mark sits alongside the lucide
  // glyphs; the sidebar's `[&>svg]:size-4` sizes both.
  icon: ComponentType<{ className?: string }>
}

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { to: "/app", label: "Home", icon: BrandMark },
  { to: "/sessions", label: "Sessions", icon: ListVideo },
  { to: "/resume", label: "Résumé", icon: FileText },
  { to: "/profile", label: "Profile", icon: User },
  { to: "/settings", label: "Settings", icon: Settings },
]

function isNavItemActive(itemPath: NavItem["to"], pathname: string): boolean {
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`)
}

const DashboardSidebarContent = ({
  pathname,
}: {
  pathname: string
}): JSX.Element => {
  const { setOpenMobile, isMobile } = useSidebar()

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="Some UI home">
              <Link to="/" aria-label="Some UI home">
                <span className="flex size-8 shrink-0 items-center justify-center">
                  <BrandMark tone="brand" className="size-6" />
                </span>
                <span className="text-gradient-accent font-semibold">
                  Some UI
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
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
                    <Link
                      to={item.to}
                      onClick={() => {
                        if (isMobile) {
                          setOpenMobile(false)
                        }
                      }}
                    >
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
  )
}

const DashboardLayout = (): JSX.Element => {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const wing = wingOf(pathname)
  const isViewportRoute = isViewportPath(pathname)
  const isMobile = useIsMobile()
  const isTerminal = useIsTerminal()

  /**
   * `V` only exists while `LivePlayer` renders the live `SessionViewport`; a
   * terminal session shows `CompletionSummary`, an ordinary card that must
   * scroll. So every viewport-only affordance is gated on `!isTerminal` too.
   */
  const isLiveViewportRoute = isViewportRoute && !isTerminal

  /**
   * The surfaces the shell hands a definite height. `dvh`, not `svh`: arriving
   * from a route scrolled with the mobile chrome hidden, `dvh` is what is on
   * screen.
   */
  const isDeclaredBounded = useIsDeclaredBounded()
  const isBoundedRoute =
    isLiveViewportRoute || isComposerPath(pathname) || isDeclaredBounded

  /**
   * The one place the shell gets out of the way: on the session player at
   * phone width, `V` is the screen. The header and inset would cost about a
   * fifth of a 390×780 viewport; what the header carried is folded into
   * `components/player/session-chrome.tsx`, on the overlay plane above `V`
   * (`docs/session-viewport/01-overflow-doctrine-and-audit.md` §2).
   */
  const bareViewport = isLiveViewportRoute && isMobile

  return (
    <SidebarProvider className={cn(isBoundedRoute && "h-dvh overflow-hidden")}>
      {/* The phone navigates by the bar along the bottom instead. */}
      {!MOBILE_APP && <DashboardSidebarContent pathname={pathname} />}
      <SidebarInset>
        {!bareViewport && (
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            {!MOBILE_APP && <SidebarTrigger />}
            {/* The phone's way out: back to the wing's Home where the bar
                steps aside, so the composer can be left without finishing
                it; otherwise to the foyer, to choose another wing. */}
            {MOBILE_APP && (
              <MobileWayOut pathname={pathname} bounded={isBoundedRoute} />
            )}
            {/* On the phone the theme is the front desk's (Settings). */}
            {!MOBILE_APP && <ThemeSwitcher />}
            {/* Layer 1 of audio disclosure: a standing indicator of what this
                app may play, and where first-use notices point back to. On
                the phone only Practice plays anything. */}
            {(!MOBILE_APP || wing?.id === "practice") && <AudioIndicator />}
            {/* Lines written lately (`lib/loc-report`); nothing in a build
                without a snapshot. On the phone it is Studio's: what gets
                made about the build. Before the Settings link `ml-auto`
                pins. */}
            {(!MOBILE_APP || wing?.id === "studio") && <LocIndicator />}
            <SiteLauncher />
            {MOBILE_APP && <MobileSettingsLink pathname={pathname} />}
          </header>
        )}
        {!bareViewport && <AccountUnavailableBanner />}
        {import.meta.env.VITE_DEVICE_BACKEND === "true" ? (
          <DeviceStoragePrompt />
        ) : null}
        <div
          className={cn(
            "flex-1",
            // 24px on every side is a desktop budget the bounded routes on a
            // phone cannot afford.
            bareViewport ? "p-0" : "p-4 sm:p-6",
            // scroll-intent: page — an ordinary document route scrolls as a
            // page; bounded routes take the overflow-hidden branch (docs/ui-fit,
            // docs/session-viewport/02-kill-the-cutoff.md).
            isBoundedRoute ? "min-h-0 overflow-hidden" : "overflow-auto"
          )}
        >
          <Outlet />
        </div>
        {/* A persistent bar may not paint over a bounded surface
            (docs/session-viewport/05-the-mobile-shell.md §4). */}
        {MOBILE_APP && !isBoundedRoute && <MobileNav pathname={pathname} />}
      </SidebarInset>
    </SidebarProvider>
  )
}

export const Route = createFileRoute("/_dashboard")({
  // No page renders against the wrong store: a returning account user waits
  // (once, bounded by the probe's deadline); a device learner does not wait.
  beforeLoad: () => authority.settled(),
  component: DashboardLayout,
})
