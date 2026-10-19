/**
 * A record's sharing mark, in the Android app's header while its wing shows
 * (aph, LA9; the Jobs record, LA10; Practice, LA11;
 * docs/learner-data-authority.md): where it is kept, at a glance, and a sheet
 * with what is on home, since when, the way to keep sending and the way to
 * stop. Its words are `lib/home-link/words`'s alone. It mounts the lane's
 * watch (`useLaneHome`), so a lane sends only while its mark shows.
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
import { jobsLane } from "@/lib/home-link/jobs"
import type { Lane } from "@/lib/home-link/lanes"
import {
  askLane,
  bringLaneBack,
  keepOnHome,
  pairingOf,
  stopOnHome,
  useHandedLane,
  useLaneBack,
  useLaneChoices,
  useLaneHome,
} from "@/lib/home-link/lanes"
import { practiceLane } from "@/lib/home-link/practice"
import type { Shape } from "@/lib/home-link/words"
import { laneView, SHEET, WORDS } from "@/lib/home-link/words"
import type { WingId } from "@/lib/wings"

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

const TONE: Record<Shape, string> = {
  phone: "text-muted-foreground",
  partly: "text-muted-foreground",
  kept: "text-success",
  waiting: "text-success",
  trouble: "text-warning",
}

const BIG = "h-12 rounded-2xl text-base"

/** Which part of the sheet shows: what is kept, or a choice's second press. */
type Pane = "kept" | "keep" | "stop"

const LaneMark = ({ lane }: { lane: Lane }): JSX.Element => {
  const run = useLaneHome(lane)
  const back = useLaneBack(lane)
  const { shared, stopped } = useLaneChoices(lane)
  const counts = lane.useCounts()
  const link = useHomeLink()
  const [open, setOpen] = useState(false)
  const [pane, setPane] = useState<Pane>("kept")
  const [refused, setRefused] = useState(false)

  const words = WORDS[lane.id]
  const pairing = pairingOf(link)
  const view = laneView(words, {
    ...counts,
    shared,
    stopped,
    run,
    away: counts.away === null ? null : { waiting: counts.away, back },
  })
  const kept = shared.size > 0
  const offer = words.offer?.(counts.offered) ?? null
  // A run home turned away (busy, or no answer) is worth trying again, even
  // when nothing counted waits.
  const retryable =
    run.last?.kind === "unreachable" ||
    (run.last?.kind === "failed" && run.last.why === "busy")
  const close = (): void => setPane("kept")

  return (
    <>
      <button
        type="button"
        aria-label={`${words.markLabel}: ${view.line}`}
        onClick={() => {
          setPane("kept")
          setRefused(false)
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
            (run.running || back.running) && "motion-safe:animate-pulse"
          )}
        />
        <span>{view.word}</span>
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl px-5 pt-6 pb-8">
          <SheetHeader className="px-0 text-left">
            <SheetTitle className="text-xl">
              {pane === "stop" ? SHEET.stopTitle : words.title}
            </SheetTitle>
            <SheetDescription
              className={cn(
                "text-base break-words",
                pane === "kept" && TONE[view.shape]
              )}
            >
              {pane === "stop"
                ? words.stopQuestion
                : pane === "keep"
                  ? offer
                  : view.line}
            </SheetDescription>
          </SheetHeader>
          {pane === "stop" ? (
            <div className="mt-4 flex flex-col gap-2.5">
              <p className="text-muted-foreground text-sm">{words.stopMore}</p>
              <Button
                variant="destructive"
                size="lg"
                className={BIG}
                onClick={() => {
                  stopOnHome(lane)
                  close()
                }}
              >
                {SHEET.stopYes}
              </Button>
              <Button
                variant="outline"
                size="lg"
                className={BIG}
                onClick={close}
              >
                {SHEET.stopNo}
              </Button>
            </div>
          ) : pane === "keep" && offer !== null && pairing !== null ? (
            <div className="mt-4 flex flex-col gap-2.5">
              <Button
                size="lg"
                className={BIG}
                onClick={() => {
                  setRefused(!keepOnHome(lane, pairing, offer))
                  close()
                }}
              >
                {SHEET.keepYes}
              </Button>
              <Button
                variant="outline"
                size="lg"
                className={BIG}
                onClick={close}
              >
                {SHEET.keepNo}
              </Button>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              <dl className="divide-y rounded-2xl border text-sm">
                {view.rows.map((row) => (
                  <div key={row.label} className="space-y-0.5 p-3">
                    <dt className="font-medium">{row.label}</dt>
                    <dd className="text-muted-foreground">{row.text}</dd>
                  </div>
                ))}
              </dl>
              {view.notes.map((note) => (
                <p key={note} className="text-muted-foreground text-sm">
                  {note}
                </p>
              ))}
              {refused ? (
                <p className="text-destructive text-sm" role="status">
                  {SHEET.keepRefused}
                </p>
              ) : null}
              {kept &&
              pairing !== null &&
              (counts.waiting > 0 || retryable) &&
              !run.running ? (
                <Button size="lg" className={BIG} onClick={() => askLane(lane)}>
                  {SHEET.sendNow}
                </Button>
              ) : null}
              {!kept &&
              counts.away !== null &&
              pairing !== null &&
              !back.running ? (
                <Button
                  size="lg"
                  className={BIG}
                  onClick={() => bringLaneBack(lane)}
                >
                  {SHEET.bringBack}
                </Button>
              ) : null}
              {kept ? (
                <Button
                  variant="outline"
                  size="lg"
                  className={cn("text-destructive", BIG)}
                  onClick={() => setPane("stop")}
                >
                  {SHEET.stop}
                </Button>
              ) : words.startElsewhere !== null ? (
                <p className="text-muted-foreground text-sm">
                  {words.startElsewhere}
                </p>
              ) : pairing === null ? (
                <p className="text-muted-foreground text-sm">
                  {SHEET.pairFirst}
                </p>
              ) : (
                <Button
                  variant="outline"
                  size="lg"
                  className={BIG}
                  onClick={() => {
                    setRefused(false)
                    setPane("keep")
                  }}
                >
                  {SHEET.keep}
                </Button>
              )}
              <p className="text-muted-foreground text-sm">{words.footnote}</p>
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

/**
 * The mark of the wing that shows: Practice's and the Jobs record's lanes
 * here, aph's once its screens hand it in. Nothing for another wing.
 */
export const DeviceHomeGlyph = ({
  wing,
}: {
  wing: WingId
}): JSX.Element | null => {
  const aph = useHandedLane("aph")
  const lane =
    wing === "practice"
      ? practiceLane
      : wing === "jobs"
        ? jobsLane
        : wing === "self"
          ? aph
          : null
  // Keyed: each lane's counts are its own hooks.
  return lane === null ? null : <LaneMark key={lane.id} lane={lane} />
}
