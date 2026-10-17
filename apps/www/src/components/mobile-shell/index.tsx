/**
 * The Android app's navigation, by wing (lib/wings): a bar along the bottom
 * holding the current wing's rooms and nothing of another wing's, and a header
 * that names the wing and leads back to the foyer, where a wing is chosen.
 *
 * Route links, not tabs (`BottomTabBar` switches panes in one page), so a
 * `<nav>` with `aria-current="page"`. Phone build only (`MOBILE_APP`); every
 * link targets an "apk" page behind `hasAudience` (A3,
 * packages/some-vite-config/AUDIENCES.md).
 */
import type { ComponentType, JSX } from "react"
import { cn } from "@some-ui/core-utils"
import { BrandMark, HomeGlyph, StudyGlyph, TalkGlyph } from "@some-ui/shared"
import { Link } from "@tanstack/react-router"
import { ChevronLeft, Settings } from "lucide-react"

import { isOnMobileSurface } from "@/lib/app-surface"
import { hasAudience } from "@/lib/build-profile"
import type { Room } from "@/lib/wings"
import { FOYER, tabsOf, wingOf } from "@/lib/wings"

/** Each tab's glyph, by room; a room without one gets no icon. */
const GLYPHS: Partial<Record<string, ComponentType<{ className?: string }>>> = {
  "practice-home": HomeGlyph,
  sessions: StudyGlyph,
  soundbites: TalkGlyph,
}

function isActive(room: Room, pathname: string): boolean {
  return room.roots.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`)
  )
}

const TabLink = ({
  room,
  pathname,
}: {
  room: Room & { tab: string }
  pathname: string
}): JSX.Element => {
  const active = isActive(room, pathname)
  const Glyph = GLYPHS[room.id]
  const [to] = room.roots
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-xs rail:w-full rail:flex-none",
        active
          ? "text-foreground font-bold"
          : "text-muted-foreground font-medium"
      )}
    >
      <span
        className={cn(
          "flex h-7 w-12 items-center justify-center rounded-full",
          active && "bg-brand/30 text-brand-foreground dark:text-brand"
        )}
      >
        {Glyph && <Glyph aria-hidden className="size-5" />}
      </span>
      {room.tab}
    </Link>
  )
}

/**
 * The tabs of the bar at `pathname`: its wing's rooms on this surface, or none
 * where the bar would hold fewer than two. The shell asks too, to make room
 * for the bar where it is a rail (`rail:`).
 */
export function barOf(pathname: string): ReadonlyArray<Room & { tab: string }> {
  if (!hasAudience("apk")) return []
  const wing = wingOf(pathname)
  const tabs = wing
    ? tabsOf(wing.id).filter((room) => room.roots.every(isOnMobileSurface))
    : []
  return tabs.length < 2 ? [] : tabs
}

/**
 * The current wing's bar. A wing of one room (Self, Studio) has none: its
 * room's own views are the only navigation it needs. Outside every wing (the
 * foyer, the front desk) there is no bar either.
 */
export const MobileNav = ({
  pathname,
}: {
  pathname: string
}): JSX.Element | null => {
  const tabs = barOf(pathname)
  if (tabs.length === 0) return null
  const wing = wingOf(pathname)
  return (
    // Floating: the page runs on under it, so the screen ends in the room
    // and not at a line.
    <nav
      aria-label={wing?.name}
      className="bg-card border-border/50 sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 mx-3 mb-[max(0.75rem,env(safe-area-inset-bottom))] flex h-[4.5rem] shrink-0 items-center rounded-[1.75rem] border px-1 shadow-lg rail:fixed rail:top-3 rail:bottom-3 rail:left-3 rail:m-0 rail:h-auto rail:w-[5.25rem] rail:flex-col rail:justify-center rail:gap-3 rail:px-0 rail:py-3"
    >
      {tabs.map((room) => (
        <TabLink key={room.id} room={room} pathname={pathname} />
      ))}
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
