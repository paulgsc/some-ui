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
  useSidebar,
} from "@some-ui/shared"
import {
  createFileRoute,
  Link,
  Outlet,
  useRouterState,
} from "@tanstack/react-router"
import { Briefcase, FileText, ListVideo, Settings, User } from "lucide-react"
import { cn, useIsMobile, useIsTerminal } from "some-ui-utils"

import { AmbientIntentStatus } from "@/lib/intent/render"
import { useMigrationSignal } from "@/lib/tenant/migration-signal"
import { AudioIndicator } from "@/components/audio/audio-indicator"
import { HexCombMark } from "@/components/brand/hex-comb-mark"
import { ThemeSwitcher } from "@/components/theme-switcher"

/**
 * Matches only the session player route (/sessions/$sessionId), whose
 * content owns a fixed viewport V (see docs/session-viewport) — the
 * dashboard shell must not let the page scroll here, or V is never
 * genuinely bounded.
 */
const SESSION_PLAYER_PATH = /^\/sessions\/(?!new$)[^/]+$/

/**
 * The composer (/sessions/new), the shell's second bounded surface.
 *
 * A wizard is not an article. It is fixed chrome — a step rail on top, Back
 * and Continue on the bottom — around one variable body, and the whole point
 * of the chrome is that it stays reachable while you work the body. Rendered
 * as an ordinary scrolling document it stopped being that: the body was a
 * design-time constant (`h-72 sm:h-80`) that matched no viewport, so a tall
 * phone left a third of the box empty and paged a four-item catalogue into
 * four pages, while a landscape phone grew the document to twice the window
 * and pushed Continue below the fold.
 *
 * Bounding it is what makes "the layout chooses the size" true here rather
 * than aspirational (docs/ui-fit): the body becomes `flex-1 min-h-0` and
 * every step fits by construction, at every viewport, instead of each step
 * inventing its own constant for how much it guesses it has.
 */
const COMPOSER_PATH = /^\/sessions\/new$/

function isViewportPath(pathname: string): boolean {
  return SESSION_PLAYER_PATH.test(pathname)
}

function isComposerPath(pathname: string): boolean {
  return COMPOSER_PATH.test(pathname)
}

type NavItem = {
  to: "/app" | "/sessions" | "/resume" | "/jobs" | "/profile" | "/settings"
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
  { to: "/jobs", label: "Jobs", icon: Briefcase },
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
                  <HexCombMark tone="brand" className="size-6" />
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
  const isViewportRoute = isViewportPath(pathname)
  const isMobile = useIsMobile()
  const isTerminal = useIsTerminal()
  const migrationSignal = useMigrationSignal()

  /**
   * `V` (the fixed, bounded, non-scrolling viewport) only exists while
   * `LivePlayer` is actually rendering the live `SessionViewport`. Once a
   * session is terminal, it swaps that for `CompletionSummary` - an
   * ordinary, possibly-tall card that needs to scroll like any other route,
   * not be clipped to whatever height `V`'s contract left it. So every
   * viewport-only affordance below (the fixed-height/no-scroll shell *and*
   * `bareViewport`, its bare-chrome subset) is gated on `!isTerminal`, not
   * just on the route pattern.
   */
  const isLiveViewportRoute = isViewportRoute && !isTerminal

  /**
   * Both surfaces the shell hands a definite height to, and therefore must
   * not let the page scroll behind. `dvh` rather than `svh`: neither of these
   * routes can scroll, so the mobile browser's chrome never retracts and the
   * two units never disagree in practice — but when one arrives from a route
   * that *was* scrolled with the chrome hidden, `dvh` is the height actually
   * on screen and `svh` is short by exactly the chrome.
   */
  const isBoundedRoute = isLiveViewportRoute || isComposerPath(pathname)

  /**
   * The one place the shell gets out of the way entirely.
   *
   * On the session player route at phone width, `V` is the screen. The 56px
   * header and the 24px inset are each defensible on their own and together
   * cost roughly a fifth of a 390×780 viewport — spent on chrome, on the one
   * route whose content is the reason the person is there. Everything the
   * header carried is still reachable, folded into the session's own control
   * (`components/player/session-chrome.tsx`), which paints on the overlay
   * plane above `V` rather than taking a band out of it
   * (`docs/session-viewport/01-overflow-doctrine-and-audit.md` §2).
   *
   * Scoped to this route and this width deliberately. Every other route is
   * an ordinary scrolling document that wants its header, and a wide session
   * player has the room for one.
   */
  const bareViewport = isLiveViewportRoute && isMobile

  return (
    <SidebarProvider className={cn(isBoundedRoute && "h-dvh overflow-hidden")}>
      <DashboardSidebarContent pathname={pathname} />
      <SidebarInset>
        {!bareViewport && (
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
        )}
        <div
          className={cn(
            "flex-1",
            // 24px on every side is a desktop budget. On a phone it is ~12%
            // of the width spent on nothing, which the bounded routes below
            // can least afford - they have exactly the window and no more.
            bareViewport ? "p-0" : "p-4 sm:p-6",
            // scroll-intent: page — an ordinary document route scrolls as a
            // page. The bounded routes take the overflow-hidden branch
            // precisely so they cannot (docs/ui-fit,
            // docs/session-viewport/02-kill-the-cutoff.md). A terminal
            // session on the player route is back to an ordinary document.
            isBoundedRoute ? "min-h-0 overflow-hidden" : "overflow-auto"
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
