import type { ComponentType, JSX } from "react"
import { cn } from "@some-ui/core-utils"
import { useIsMobile } from "@some-ui/react-hooks"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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
import {
  BookOpenText,
  ChevronLeft,
  FileText,
  Home,
  Keyboard,
  ListVideo,
  Settings,
  SlidersHorizontal,
  User,
} from "lucide-react"

import { authority } from "@/lib/authority"
import { MOBILE_APP } from "@/lib/build-profile"
import { useIsTerminal } from "@/lib/orchestrator"
import { useIsDeclaredBounded } from "@/lib/route-bounds"
import { navOf, owns, webSettingsOf, wingOf } from "@/lib/wings"
import { AudioIndicator } from "@/components/audio/audio-indicator"
import { AccountUnavailableBanner } from "@/components/auth/account-unavailable-banner"
import { DeviceHomeGlyph, HomeLanes } from "@/components/device-home-glyph"
import { LocIndicator } from "@/components/loc/loc-indicator"
import {
  barOf,
  MobileNav,
  MobileSettingsLink,
  MobileWayOut,
} from "@/components/mobile-shell"
import { ProvenanceStrip } from "@/components/provenance-strip"
import { DeviceStoragePrompt } from "@/components/settings/device-storage"
import { SiteLauncher } from "@/components/site-launcher"
import { ThemeSwitcher } from "@/components/theme-switcher"
import { WingGlyph } from "@/components/wing-glyph"

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

/**
 * Each sidebar room's icon, by room id. Typed wide so the lucide glyphs and
 * the shared ones sit together; the sidebar's `[&>svg]:size-4` sizes both.
 */
const NAV_ICONS: Partial<
  Record<string, ComponentType<{ className?: string }>>
> = {
  dashboard: Home,
  sessions: ListVideo,
  profile: User,
  lessons: BookOpenText,
  rounds: Keyboard,
  "resume-build": FileText,
  resume: FileText,
}

/**
 * The web app's sidebar, by wing (lib/wings): the way back to the foyer, the
 * wing's name, its rooms and its settings, and the front desk at the foot.
 * Outside every wing (the front desk itself) only the way back and the front
 * desk remain. The Android app has its own bar (`MobileNav`).
 */
const DashboardSidebarContent = ({
  pathname,
}: {
  pathname: string
}): JSX.Element => {
  const { setOpenMobile, isMobile } = useSidebar()
  const wing = wingOf(pathname)
  const settings = wing && webSettingsOf(wing)
  const closeOnPhone = (): void => {
    if (isMobile) setOpenMobile(false)
  }
  const items = wing
    ? [
        ...navOf(wing).map((room) => ({
          to: room.roots[0],
          label: room.nav,
          icon: NAV_ICONS[room.id],
        })),
        ...(settings
          ? [
              {
                to: settings,
                label: `${wing.name} settings`,
                icon: SlidersHorizontal,
              },
            ]
          : []),
      ]
    : []

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Where to?">
              <Link to="/" className="text-muted-foreground">
                <ChevronLeft />
                <span>Where to?</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {wing && (
            <SidebarMenuItem>
              <div className="flex items-center gap-2 px-2 py-1.5">
                <span className="bg-brand/30 text-brand-foreground dark:text-brand flex size-8 shrink-0 items-center justify-center rounded-lg empty:hidden">
                  <WingGlyph wing={wing.id} className="size-4" />
                </span>
                <span className="text-gradient-accent text-base font-semibold">
                  {wing.name}
                </span>
              </div>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild isActive={owns(item.to, pathname)}>
                    <Link to={item.to} onClick={closeOnPhone}>
                      {item.icon && <item.icon />}
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={owns("/settings", pathname)}>
              <Link to="/settings" onClick={closeOnPhone}>
                <Settings />
                <span>Front desk</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
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
      {/* The drain: what this phone keeps goes to its paired home from any screen (LA15). */}
      {import.meta.env.VITE_DEVICE_BACKEND === "true" && <HomeLanes />}
      {/* The phone navigates by the bar along the bottom instead. */}
      {!MOBILE_APP && <DashboardSidebarContent pathname={pathname} />}
      <SidebarInset
        className={cn(
          !isBoundedRoute && barOf(pathname).length > 0 && "rail:pl-[6rem]"
        )}
      >
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
            {/* The wing's sharing mark: where its record is kept, and what waits (LA15). */}
            {import.meta.env.VITE_DEVICE_BACKEND === "true" && wing && (
              <DeviceHomeGlyph wing={wing.id} />
            )}
          </header>
        )}
        {!bareViewport && <AccountUnavailableBanner />}
        {!MOBILE_APP && wing?.exposure && (
          <ProvenanceStrip exposure={wing.exposure} />
        )}
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
