/**
 * A record's sharing mark, in the Android app's header while its wing shows
 * (aph, LA9; the Jobs record, LA10; Practice, LA11;
 * docs/learner-data-authority.md): where it is kept, at a glance, and a sheet
 * with what is on home, since when, the way to keep sending and the way to
 * stop. Its words are `lib/home-link/words`'s alone. It mounts the lane's
 * watch (`useLaneHome`), so a lane sends only while its mark shows.
 * It draws `laneView`'s two axes, where it is kept and how the last exchange
 * went, each a mark of its own; no two states share one
 * (`__tests__/device-home-glyph.test.tsx`), and the sheet's legend draws each.
 */
import type { JSX, ReactNode } from "react"
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
import type { LucideIcon } from "lucide-react"
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Ban,
  Check,
  CircleX,
  Ellipsis,
  HardDrive,
  Hourglass,
  TriangleAlert,
  Unlink,
  Unplug,
  WifiOff,
} from "lucide-react"

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
import { useVoiceHome } from "@/lib/home-link/voice"
import type { How, LaneWords, Where } from "@/lib/home-link/words"
import {
  HOW_ORDER,
  laneView,
  MARK_WORDS,
  SHEET,
  WHERE_ORDER,
  WORDS,
} from "@/lib/home-link/words"
import type { WingId } from "@/lib/wings"

const HOUSE = "M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"

/**
 * Where a record is kept, each in a form of its own: a phone for only here, a
 * dashed house for partly, a house for kept, a house holding a phone for on
 * home and not sent any more, and a dotted ring while it isn't known yet.
 */
const WhereMark = ({
  where,
  className,
}: {
  where: Where
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
    data-where={where}
    className={className}
  >
    {where === "phone" ? (
      <>
        <rect x="7" y="2.5" width="10" height="19" rx="2" />
        <path d="M11 18.5h2" />
      </>
    ) : where === "checking" ? (
      <circle cx="12" cy="12" r="8" strokeDasharray="0.1 3.6" />
    ) : (
      <path
        d={HOUSE}
        strokeDasharray={where === "partly" ? "3 2.4" : undefined}
      />
    )}
    {where === "away" ? (
      <rect x="10" y="12" width="4" height="6.5" rx="0.8" />
    ) : null}
  </svg>
)

/** How the last exchange went, beside where: one icon for each. */
const HOW_ICONS: Readonly<Record<How, LucideIcon>> = {
  current: Check,
  waiting: ArrowUp,
  sending: Ellipsis,
  bringing: ArrowDown,
  "no-answer": WifiOff,
  busy: Hourglass,
  forgotten: Unlink,
  unpaired: Unplug,
  full: Archive,
  "no-room": HardDrive,
  refused: Ban,
  fault: TriangleAlert,
  failed: CircleX,
}

const HowMark = ({
  how,
  className,
}: {
  how: How
  className?: string
}): JSX.Element => {
  const Icon = HOW_ICONS[how]
  return <Icon aria-hidden data-how={how} className={className} />
}

const WHERE_TONE: Record<Where, string> = {
  checking: "text-muted-foreground",
  phone: "text-muted-foreground",
  partly: "text-muted-foreground",
  kept: "text-success",
  away: "text-success",
}

const HOW_TONE: Record<How, string> = {
  current: "text-success",
  waiting: "text-success",
  sending: "text-success",
  bringing: "text-success",
  "no-answer": "text-warning",
  busy: "text-warning",
  forgotten: "text-warning",
  unpaired: "text-warning",
  full: "text-warning",
  "no-room": "text-warning",
  refused: "text-warning",
  fault: "text-warning",
  failed: "text-warning",
}

/** The tone a lane's words wear: how it went, if that says anything. */
const toneOf = (where: Where, how: How | null): string =>
  how === null ? WHERE_TONE[where] : HOW_TONE[how]

/** Marks the lane can show: away and bringing back only where it can stop short. */
const shown = (
  words: LaneWords
): { where: ReadonlyArray<Where>; how: ReadonlyArray<How> } =>
  words.away === null
    ? {
        where: WHERE_ORDER.filter((w) => w !== "away"),
        how: HOW_ORDER.filter((h) => h !== "bringing"),
      }
    : { where: WHERE_ORDER, how: HOW_ORDER }

const LegendLine = ({
  mark,
  children,
}: {
  mark: ReactNode
  children: ReactNode
}): JSX.Element => (
  <li className="flex items-center gap-3 text-sm">
    {mark}
    <span className="text-muted-foreground">{children}</span>
  </li>
)

/** Every mark the lane can show, and what each means. */
const Legend = ({ words }: { words: LaneWords }): JSX.Element => {
  const { where, how } = shown(words)
  return (
    <section aria-label={MARK_WORDS.title} className="rounded-2xl border p-3">
      <h3 className="text-sm font-medium">{MARK_WORDS.title}</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {where.map((w) => (
          <LegendLine
            key={w}
            mark={
              <WhereMark
                where={w}
                className={cn("size-5 shrink-0", WHERE_TONE[w])}
              />
            }
          >
            {MARK_WORDS.where[w]}
          </LegendLine>
        ))}
        {how.map((h) => (
          <LegendLine
            key={h}
            mark={
              <HowMark how={h} className={cn("size-5 shrink-0", HOW_TONE[h])} />
            }
          >
            {MARK_WORDS.how[h]}
          </LegendLine>
        ))}
      </ul>
    </section>
  )
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
  /** The choice this phone couldn't keep, said until the sheet opens again. */
  const [refused, setRefused] = useState<"keep" | "stop" | null>(null)

  const words = WORDS[lane.id]
  const pairing = pairingOf(link)
  const view = laneView(words, {
    ...counts,
    known: link.link.kind !== "reading",
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
          setRefused(null)
          setOpen(true)
        }}
        className={cn(
          "hover:bg-accent flex h-10 items-center gap-1.5 rounded-md px-2 text-xs font-medium",
          toneOf(view.where, view.how)
        )}
      >
        <WhereMark
          where={view.where}
          className={cn(
            "size-5 shrink-0",
            WHERE_TONE[view.where],
            (run.running || back.running) && "motion-safe:animate-pulse"
          )}
        />
        {view.how !== null ? (
          <HowMark how={view.how} className="size-4 shrink-0" />
        ) : null}
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
                pane === "kept" && toneOf(view.where, view.how)
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
                  setRefused(stopOnHome(lane) ? null : "stop")
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
                  setRefused(keepOnHome(lane, pairing, offer) ? null : "keep")
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
              {refused !== null ? (
                <p className="text-destructive text-sm" role="status">
                  {refused === "keep" ? SHEET.keepRefused : SHEET.stopRefused}
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
                    setRefused(null)
                    setPane("keep")
                  }}
                >
                  {SHEET.keep}
                </Button>
              )}
              <p className="text-muted-foreground text-sm">{words.footnote}</p>
              <Legend words={words} />
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
 * Whether the Jobs record is kept on the paired home now, so an exchange
 * files its decisions and scouts there: its cards say so (J0, LA10).
 */
export function useJobsKeptOnHome(): boolean {
  return useLaneChoices(jobsLane).shared.size > 0
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

/**
 * Voice notes' send, which has no mark: mounted by the app shell on every
 * screen, so notes go home from any wing (LA13).
 */
export const VoiceNotesHome = (): null => {
  useVoiceHome()
  return null
}
