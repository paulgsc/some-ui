/**
 * The Android app's navigation, by wing (lib/wings): a bar along the bottom
 * holding the current wing's rooms and nothing of another wing's, and a header
 * that names the wing and leads back to the foyer, where a wing is chosen.
 * The front desk (Settings) has a bar of its own, of its pages, the same shape
 * (`deskBar`, lib/front-desk; MY-DATA MD1, paulgsc/some-ui#2475).
 *
 * Route links, not tabs (`BottomTabBar` switches panes in one page), so a
 * `<nav>` with `aria-current="page"`. Phone build only (`MOBILE_APP`); every
 * link targets an "apk" page behind `hasAudience` (A3,
 * packages/some-vite-config/AUDIENCES.md).
 */
import type { ComponentType, JSX } from "react"
import type { FileRoutesByTo } from "@/routeTree.gen"
import { cn } from "@some-ui/core-utils"
import {
  BrandMark,
  HomeGlyph,
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  StudyGlyph,
  TalkGlyph,
} from "@some-ui/shared"
import { Link } from "@tanstack/react-router"
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Database,
  Ellipsis,
  House,
  Settings,
  Smartphone,
  Trophy,
} from "lucide-react"

import { isOnMobileSurface } from "@/lib/app-surface"
import { hasAudience } from "@/lib/build-profile"
import { DESK_ROOT, deskBar, FRONT_DESK_WORDS, pageOf } from "@/lib/front-desk"
import { FOYER, owns, tabsOf, wingOf } from "@/lib/wings"

type Glyph = ComponentType<{ className?: string }>

/** Each tab's glyph, by room or desk page; one without gets no icon. */
const GLYPHS: Partial<Record<string, Glyph>> = {
  "practice-home": HomeGlyph,
  sessions: StudyGlyph,
  soundbites: TalkGlyph,
  journal: Clapperboard,
  "game-week": Trophy,
  status: Activity,
  phone: Smartphone,
  home: House,
  data: Database,
}

/** One tab of a bar: a room of the wing, or a page of the desk. */
type BarTab = {
  readonly id: string
  readonly label: string
  readonly to: keyof FileRoutesByTo
  /** One line under its label in More's list. */
  readonly lead?: string
  readonly active: boolean
}

/** A bar: its tabs, and what More lists (none in a wing). */
export type Bar = {
  readonly name: string
  readonly tabs: ReadonlyArray<BarTab>
  readonly more: ReadonlyArray<BarTab>
}

/**
 * A bar of more than three tabs (the desk's five) stands them closer on the
 * rail, so all five fit a phone on its side, 360px tall among them
 * (`tests/ui-fit/settings-bar-fit.spec.ts`).
 */
const DENSE_FROM = 4

const tabLook = (active: boolean, dense: boolean): string =>
  cn(
    "flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-xs rail:w-full rail:flex-none",
    dense && "rail:py-1",
    active ? "text-foreground font-bold" : "text-muted-foreground font-medium"
  )

const TabMark = ({
  glyph: Glyph,
  active,
}: {
  glyph: Glyph | undefined
  active: boolean
}): JSX.Element => (
  <span
    className={cn(
      "flex h-7 w-12 items-center justify-center rounded-full",
      // The honey itself, its ink on it (7.2:1 in mochi; PL1).
      active && "bg-brand text-brand-foreground"
    )}
  >
    {Glyph && <Glyph aria-hidden className="size-5" />}
  </span>
)

const TabLink = ({
  tab,
  dense,
}: {
  tab: BarTab
  dense: boolean
}): JSX.Element => (
  <Link
    to={tab.to}
    aria-current={tab.active ? "page" : undefined}
    className={tabLook(tab.active, dense)}
  >
    <TabMark glyph={GLYPHS[tab.id]} active={tab.active} />
    {tab.label}
  </Link>
)

/**
 * More: a tab that opens the rest of the bar's pages as a list from the
 * bottom. It reads as current while one of them is open. The bar keys it by
 * the page, so any way of leaving one (Android's back) closes the list.
 */
const MoreTab = ({
  more,
  dense,
}: {
  more: ReadonlyArray<BarTab>
  dense: boolean
}): JSX.Element => {
  const active = more.some((tab) => tab.active)
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-current={active ? "page" : undefined}
          className={tabLook(active, dense)}
        >
          <TabMark glyph={Ellipsis} active={active} />
          {FRONT_DESK_WORDS.more}
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-3xl px-3 pt-6 pb-8">
        <SheetHeader className="px-2 text-left">
          <SheetTitle>{FRONT_DESK_WORDS.more}</SheetTitle>
        </SheetHeader>
        <ul className="mt-2">
          {more.map((tab) => (
            <li key={tab.id}>
              <SheetClose asChild>
                <Link
                  to={tab.to}
                  aria-current={tab.active ? "page" : undefined}
                  className="hover:bg-accent flex min-h-12 items-center gap-3 rounded-xl px-2 py-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{tab.label}</span>
                    {tab.lead === undefined ? null : (
                      <span className="text-muted-foreground block text-sm">
                        {tab.lead}
                      </span>
                    )}
                  </span>
                  <ChevronRight
                    aria-hidden
                    className="text-muted-foreground size-5 shrink-0"
                  />
                </Link>
              </SheetClose>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  )
}

/** The desk's bar at `pathname`, on the phone and inside the desk alone. */
function deskBarAt(pathname: string): Bar | null {
  const bar = deskBar()
  if (bar === null || !owns(DESK_ROOT, pathname)) {
    return null
  }
  const asTab = (page: (typeof bar.tabs)[number]): BarTab => ({
    id: page.id,
    label: page.tab,
    to: pageOf(page.id),
    lead: page.lead,
    active: owns(pageOf(page.id), pathname),
  })
  return {
    name: FRONT_DESK_WORDS.bar,
    tabs: bar.tabs.map(asTab),
    more: bar.more.map(asTab),
  }
}

/**
 * The bar at `pathname`: its wing's rooms on this surface, or the desk's
 * pages; none where a wing's bar would hold fewer than two. The shell asks
 * too, to make room for the bar where it is a rail (`rail:`).
 */
export function barOf(pathname: string): Bar | null {
  const wing = wingOf(pathname)
  if (wing === undefined) return deskBarAt(pathname)
  const tabs = tabsOf(wing.id).filter((room) =>
    room.roots.every(isOnMobileSurface)
  )
  if (tabs.length < 2) return null
  return {
    name: wing.name,
    tabs: tabs.map((room) => ({
      id: room.id,
      label: room.tab,
      to: room.roots[0],
      active: room.roots.some((root) => owns(root, pathname)),
    })),
    more: [],
  }
}

/**
 * The current wing's bar, or the desk's. A wing of one room (Self) has none:
 * its room's own views are the only navigation it needs. The foyer has none
 * either.
 */
export const MobileNav = ({
  pathname,
}: {
  pathname: string
}): JSX.Element | null => {
  const bar = barOf(pathname)
  if (bar === null) return null
  const dense = bar.tabs.length + (bar.more.length > 0 ? 1 : 0) >= DENSE_FROM
  return (
    // Floating: the page runs on under it, so the screen ends in the room
    // and not at a line.
    <nav
      aria-label={bar.name}
      className={cn(
        "bg-card border-border/50 sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 mx-3 mb-[max(0.75rem,env(safe-area-inset-bottom))] flex h-[4.5rem] shrink-0 items-center rounded-[1.75rem] border px-1 shadow-lg rail:fixed rail:top-3 rail:bottom-3 rail:left-3 rail:m-0 rail:h-auto rail:w-[5.25rem] rail:flex-col rail:justify-center rail:px-0 rail:py-3",
        dense ? "rail:gap-1" : "rail:gap-3"
      )}
    >
      {bar.tabs.map((tab) => (
        <TabLink key={tab.id} tab={tab} dense={dense} />
      ))}
      {bar.more.length > 0 ? (
        <MoreTab key={pathname} more={bar.more} dense={dense} />
      ) : null}
    </nav>
  )
}

/**
 * The header's way out, by where you are. On a bounded screen (the composer,
 * the player), where the bar steps aside, it leads back to the wing's Home,
 * so no screen can only be left by finishing it. Elsewhere it is the mark and
 * the wing's name, leading to the foyer to choose another wing. Android's
 * back walks the history either way (apps/mobile `MainActivity`).
 */
export const MobileWayOut = ({
  pathname,
  bounded,
}: {
  pathname: string
  bounded: boolean
}): JSX.Element | null => {
  if (!hasAudience("apk") || pathname === FOYER) return null
  const wing = wingOf(pathname)
  if (bounded && wing?.home) {
    return (
      <Link
        to={wing.home}
        className="hover:bg-accent -ml-2 flex h-10 items-center gap-0.5 rounded-md pr-3 pl-1 text-sm font-medium"
      >
        <ChevronLeft aria-hidden className="size-5" />
        {wing.name}
      </Link>
    )
  }
  return (
    <Link
      to={FOYER}
      aria-label={wing ? `${wing.name}: choose another wing` : "Where to?"}
      className="hover:bg-accent -ml-2 flex h-10 items-center gap-2 rounded-md pr-3 pl-1 text-sm font-semibold"
    >
      <BrandMark tone="brand" className="size-7 shrink-0" />
      {wing?.name}
    </Link>
  )
}

/**
 * The gear: in a wing, that wing's own settings, if it has any; in the foyer,
 * the front desk (`/settings`: this phone, the theme). Nothing on the front
 * desk itself.
 */
export const MobileSettingsLink = ({
  pathname,
}: {
  pathname: string
}): JSX.Element | null => {
  if (!hasAudience("apk")) return null
  const wing = wingOf(pathname)
  const to = wing ? wing.settings : pathname === FOYER ? "/settings" : null
  if (to === null || pathname === to) return null
  return (
    <Link
      to={to}
      aria-label={wing ? `${wing.name} settings` : "Settings"}
      className="hover:bg-accent ml-auto flex size-10 items-center justify-center rounded-md"
    >
      <Settings className="size-5" />
    </Link>
  )
}
