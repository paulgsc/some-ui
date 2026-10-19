/**
 * Practice's sharing mark, in the Android app's header (LA11,
 * docs/learner-data-authority.md): where Practice is kept, at a glance, and a
 * sheet with what is on home, since when, and the way to stop sending. Its
 * words are `lib/home-link/practice-words`'s alone. It mounts Practice's
 * watch (`usePracticeHome`), so a standing send runs only while this mark
 * shows.
 */
import type { JSX } from "react"
import { useState } from "react"
import { cn } from "@some-ui/core-utils"
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@some-ui/shared"
import { Link } from "@tanstack/react-router"

import { useHomeLink } from "@/lib/home-link"
import {
  askPractice,
  heldByHome,
  sessionsWaiting,
  stopPracticeOnHome,
  usePracticeHome,
  usePracticeShared,
} from "@/lib/home-link/practice"
import type { Shape } from "@/lib/home-link/practice-words"
import { practiceView, SHEET } from "@/lib/home-link/practice-words"
import { heldCounts } from "@/lib/home-link/sent"
import { useSessions } from "@/lib/tenant"

const HOUSE = "M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"

/** Each shape differs in form, not only in colour. */
const ShapeMark = ({
  shape,
  className,
}: {
  shape: Shape
  className?: string
}): JSX.Element => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    className={className}
  >
    {shape === "phone" ? (
      <>
        <rect x="7" y="2.5" width="10" height="19" rx="2" />
        <path d="M11 18.5h2" />
      </>
    ) : (
      <path
        d={HOUSE}
        strokeDasharray={shape === "partly" ? "3 2.4" : undefined}
      />
    )}
    {shape === "kept" ? <path d="m9 14.5 2 2 4-4.5" /> : null}
    {shape === "waiting" ? (
      <>
        <path d="M12 17.5v-5" />
        <path d="m9.5 14.5 2.5-2.5 2.5 2.5" />
      </>
    ) : null}
    {shape === "trouble" ? (
      <>
        <path d="M12 11.5v3.5" />
        <path d="M12 17.8v.2" />
      </>
    ) : null}
  </svg>
)

const NOTHING_HELD = { sessions: 0, shelf: 0, refused: 0 } as const

const TONE: Record<Shape, string> = {
  phone: "text-muted-foreground",
  partly: "text-muted-foreground",
  kept: "text-success",
  waiting: "text-success",
  trouble: "text-warning",
}

export const DeviceHomeGlyph = (): JSX.Element => {
  const run = usePracticeHome()
  const shared = usePracticeShared()
  const link = useHomeLink()
  const { data: sessions } = useSessions()
  const [open, setOpen] = useState(false)
  const [stopping, setStopping] = useState(false)

  const paired = link.link.kind === "paired"
  const held = heldByHome(link)
  const waiting = sessions === undefined ? 0 : sessionsWaiting(sessions, link)
  const view = practiceView({
    shared,
    held: held === null ? NOTHING_HELD : heldCounts(held),
    waiting,
    run,
  })
  const kept = shared.size > 0

  return (
    <>
      <button
        type="button"
        aria-label={`${SHEET.markLabel}: ${view.line}`}
        onClick={() => {
          setStopping(false)
          setOpen(true)
        }}
        className={cn(
          "hover:bg-accent flex h-10 items-center gap-1.5 rounded-md px-2 text-xs font-medium",
          TONE[view.shape]
        )}
      >
        <ShapeMark
          shape={view.shape}
          className={cn(
            "size-5 shrink-0",
            run.running && "motion-safe:animate-pulse"
          )}
        />
        <span>{view.word}</span>
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl px-5 pt-6 pb-8">
          <SheetHeader className="px-0 text-left">
            <SheetTitle className="text-xl">
              {stopping ? SHEET.stopTitle : SHEET.title}
            </SheetTitle>
            <SheetDescription
              className={cn("text-base", stopping ? "" : TONE[view.shape])}
            >
              {stopping ? SHEET.stopQuestion : view.line}
            </SheetDescription>
          </SheetHeader>
          {stopping ? (
            <div className="mt-4 flex flex-col gap-2.5">
              <p className="text-muted-foreground text-sm">{SHEET.stopMore}</p>
              <Button
                variant="destructive"
                size="lg"
                className="h-12 rounded-2xl text-base"
                onClick={() => {
                  stopPracticeOnHome()
                  setStopping(false)
                }}
              >
                {SHEET.stopYes}
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="h-12 rounded-2xl text-base"
                onClick={() => setStopping(false)}
              >
                {SHEET.stopNo}
              </Button>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              <dl className="divide-y rounded-2xl border text-sm">
                <div className="space-y-0.5 p-3">
                  <dt className="font-medium">{SHEET.sessions}</dt>
                  <dd className="text-muted-foreground">
                    {view.rows.sessions}
                  </dd>
                </div>
                <div className="space-y-0.5 p-3">
                  <dt className="font-medium">{SHEET.shelf}</dt>
                  <dd className="text-muted-foreground">{view.rows.shelf}</dd>
                </div>
              </dl>
              {kept && paired && waiting > 0 && !run.running ? (
                <Button
                  size="lg"
                  className="h-12 rounded-2xl text-base"
                  onClick={askPractice}
                >
                  {SHEET.sendNow}
                </Button>
              ) : null}
              {kept ? (
                <Button
                  variant="outline"
                  size="lg"
                  className="text-destructive h-12 rounded-2xl text-base"
                  onClick={() => setStopping(true)}
                >
                  {SHEET.stop}
                </Button>
              ) : (
                <p className="text-muted-foreground text-sm">{SHEET.notKept}</p>
              )}
              <p className="text-muted-foreground text-sm">
                {SHEET.reflections}
              </p>
              <Link
                to="/settings"
                onClick={() => setOpen(false)}
                className="text-sm font-medium underline"
              >
                {SHEET.settings}
              </Link>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
