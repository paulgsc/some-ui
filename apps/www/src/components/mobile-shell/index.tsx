/**
 * The Android app's navigation: a bottom bar in thumb reach, in place of the
 * sidebar. Home is the hub, each tool a tab; the + is only a shortcut into
 * those tools.
 *
 * Route links, not tabs (`BottomTabBar` switches panes in one page), so a
 * `<nav>` with `aria-current="page"`. Phone build only (`MOBILE_APP`); every
 * link targets an "apk" page behind `hasAudience` (A3,
 * packages/some-vite-config/AUDIENCES.md).
 */
import type { ComponentType, JSX } from "react"
import { useState } from "react"
import { cn } from "@some-ui/core-utils"
import {
  HomeGlyph,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  StudyGlyph,
  TalkGlyph,
  TrendGlyph,
} from "@some-ui/shared"
import { Link } from "@tanstack/react-router"
import { ChevronLeft, Plus } from "lucide-react"

import { hasAudience } from "@/lib/build-profile"

type Tab = {
  to: "/today" | "/sessions" | "/soundbites" | "/aph"
  label: string
  icon: ComponentType<{ className?: string }>
}

/** Either side of the +. */
const LEFT: ReadonlyArray<Tab> = [
  { to: "/today", label: "Home", icon: HomeGlyph },
  { to: "/sessions", label: "Study", icon: StudyGlyph },
]
const RIGHT: ReadonlyArray<Tab> = [
  { to: "/soundbites", label: "Bites", icon: TalkGlyph },
  { to: "/aph", label: "aph", icon: TrendGlyph },
]

function isActive(to: Tab["to"], pathname: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`)
}

const TabLink = ({
  tab,
  pathname,
}: {
  tab: Tab
  pathname: string
}): JSX.Element => {
  const active = isActive(tab.to, pathname)
  return (
    <Link
      to={tab.to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-xs",
        active
          ? "text-foreground font-bold"
          : "text-muted-foreground font-medium"
      )}
    >
      {/* The active tab sits in a soft pill of the theme's mochi. */}
      <span
        className={cn(
          "flex h-7 w-12 items-center justify-center rounded-full",
          active && "bg-brand/30 text-brand-foreground dark:text-brand"
        )}
      >
        <tab.icon aria-hidden className="size-5" />
      </span>
      {tab.label}
    </Link>
  )
}

export const MobileNav = ({
  pathname,
}: {
  pathname: string
}): JSX.Element | null => {
  // The page the + sheet was opened over. Android's back changes the page
  // under an open sheet, which then closes rather than stay over a page it
  // was not opened on, and is forgotten so a later visit there does not
  // reopen it.
  const [quickOpenOn, setQuickOpenOn] = useState<string | null>(null)
  if (quickOpenOn !== null && quickOpenOn !== pathname) setQuickOpenOn(null)
  if (!hasAudience("apk")) return null
  const quickOpen = quickOpenOn === pathname

  return (
    <>
      {/* A floating bar rather than a ruled-off strip: the page runs on
          under it, so the screen ends in the room and not at a line. */}
      <nav
        aria-label="Main"
        className="bg-card border-border/50 sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 mx-3 mb-[max(0.75rem,env(safe-area-inset-bottom))] flex h-[4.5rem] shrink-0 items-center rounded-[1.75rem] border px-1 shadow-lg"
      >
        {LEFT.map((tab) => (
          <TabLink key={tab.to} tab={tab} pathname={pathname} />
        ))}
        <span className="flex min-w-0 flex-1 justify-center">
          <button
            type="button"
            aria-label="Quick entry"
            aria-haspopup="dialog"
            onClick={() => setQuickOpenOn(pathname)}
            className="bg-brand text-brand-foreground ring-background -mt-7 flex size-14 items-center justify-center rounded-full shadow-md ring-[6px]"
          >
            <Plus aria-hidden className="size-7" strokeWidth={3} />
          </button>
        </span>
        {RIGHT.map((tab) => (
          <TabLink key={tab.to} tab={tab} pathname={pathname} />
        ))}
      </nav>
      <QuickEntry
        open={quickOpen}
        onOpenChange={(open) => setQuickOpenOn(open ? pathname : null)}
      />
    </>
  )
}

/**
 * The way home while the bar steps aside (the composer, the player on a wide
 * window): the header carries it instead, so no screen can only be left by
 * finishing it. Android's back does the same from any page, through the
 * history (apps/mobile `MainActivity`); this is the one you can see.
 */
export const MobileHomeLink = (): JSX.Element | null => {
  if (!hasAudience("apk")) return null
  return (
    <Link
      to="/today"
      className="hover:bg-accent -ml-2 flex h-10 items-center gap-0.5 rounded-md pr-3 pl-1 text-sm font-medium"
    >
      <ChevronLeft aria-hidden className="size-5" />
      Home
    </Link>
  )
}

/**
 * The + sheet: one tap into the entry each tool already has. Nothing here
 * records anything itself.
 */
const QuickEntry = ({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): JSX.Element => {
  const close = (): void => onOpenChange(false)
  const tile =
    "bg-card hover:bg-accent border-border/50 flex min-h-20 flex-col justify-center gap-1 rounded-2xl border p-3 text-left"
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto flex max-w-md flex-col gap-4">
          <SheetHeader className="text-left">
            <SheetTitle>Quick entry</SheetTitle>
            <SheetDescription>
              Straight into a tool, ready to go.
            </SheetDescription>
          </SheetHeader>
          <Link
            to="/soundbites"
            search={{ say: "capture" }}
            onClick={close}
            className="bg-brand text-brand-foreground flex h-16 items-center justify-center gap-3 rounded-full text-base font-bold"
          >
            <TalkGlyph aria-hidden className="size-6" />
            Talk now
          </Link>
          <div className="grid grid-cols-2 gap-2">
            <Link to="/aph" onClick={close} className={tile}>
              <span className="flex items-center gap-2 text-sm font-semibold">
                <TrendGlyph aria-hidden className="size-4" />
                aph: mine
              </span>
              <span className="text-muted-foreground text-xs">
                what I see now
              </span>
            </Link>
            <Link
              to="/aph"
              search={{ side: "theirs" }}
              onClick={close}
              className={tile}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <TrendGlyph aria-hidden className="size-4" />
                aph: theirs
              </span>
              <span className="text-muted-foreground text-xs">
                a figure they reported
              </span>
            </Link>
            <Link
              to="/sessions/new"
              onClick={close}
              className={cn(tile, "col-span-2")}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <StudyGlyph aria-hidden className="size-4" />
                Start a session
              </span>
              <span className="text-muted-foreground text-xs">
                TOPIK, LeetType
              </span>
            </Link>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
