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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@some-ui/shared"
import { Link } from "@tanstack/react-router"
import {
  BookOpen,
  ChevronLeft,
  House,
  Mic,
  Plus,
  TrendingUp,
} from "lucide-react"

import { hasAudience } from "@/lib/build-profile"

type Tab = {
  to: "/today" | "/sessions" | "/soundbites" | "/aph"
  label: string
  icon: ComponentType<{ className?: string }>
}

/** Either side of the +. */
const LEFT: ReadonlyArray<Tab> = [
  { to: "/today", label: "Home", icon: House },
  { to: "/sessions", label: "Study", icon: BookOpen },
]
const RIGHT: ReadonlyArray<Tab> = [
  { to: "/soundbites", label: "Bites", icon: Mic },
  { to: "/aph", label: "aph", icon: TrendingUp },
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
        "flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[11px]",
        active ? "text-foreground font-semibold" : "text-muted-foreground"
      )}
    >
      <tab.icon
        aria-hidden
        className={cn("size-5", active && "text-primary")}
      />
      {tab.label}
    </Link>
  )
}

export const MobileNav = ({
  pathname,
}: {
  pathname: string
}): JSX.Element | null => {
  const [quickOpen, setQuickOpen] = useState(false)
  if (!hasAudience("apk")) return null

  return (
    <>
      <nav
        aria-label="Main"
        className="bg-background sticky bottom-0 z-10 flex shrink-0 items-center border-t pb-[env(safe-area-inset-bottom)]"
      >
        {LEFT.map((tab) => (
          <TabLink key={tab.to} tab={tab} pathname={pathname} />
        ))}
        <span className="flex min-w-0 flex-1 justify-center">
          <button
            type="button"
            aria-label="Quick entry"
            aria-haspopup="dialog"
            onClick={() => setQuickOpen(true)}
            className="bg-primary text-primary-foreground flex size-12 items-center justify-center rounded-2xl shadow-[var(--glow-primary)]"
          >
            <Plus aria-hidden className="size-6" />
          </button>
        </span>
        {RIGHT.map((tab) => (
          <TabLink key={tab.to} tab={tab} pathname={pathname} />
        ))}
      </nav>
      <QuickEntry open={quickOpen} onOpenChange={setQuickOpen} />
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
    "bg-card hover:bg-accent flex min-h-20 flex-col justify-center gap-1 rounded-xl border p-3 text-left"
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
            className="bg-primary text-primary-foreground flex h-16 items-center justify-center gap-3 rounded-xl text-base font-semibold"
          >
            <Mic aria-hidden className="size-6" />
            Talk now
          </Link>
          <div className="grid grid-cols-2 gap-2">
            <Link to="/aph" onClick={close} className={tile}>
              <span className="flex items-center gap-2 text-sm font-semibold">
                <TrendingUp aria-hidden className="size-4" />
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
                <TrendingUp aria-hidden className="size-4" />
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
                <BookOpen aria-hidden className="size-4" />
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
