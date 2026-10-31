/**
 * The drain of what this phone keeps to its paired home, and its marks
 * (LA15, docs/learner-data-authority.md). `HomeLanes`, mounted by the app
 * shell on every screen of the Android app, runs every lane's watch
 * (`useLaneHome`), so Practice's record, the Jobs record and voice notes go
 * from any wing, and aph's once its screens hand its store in. A record's
 * mark, in the header while its wing shows, says where it is kept, at a
 * glance, and opens a sheet with what is on home, what waits and Send now;
 * it sends nothing of its own. Its words are `lib/home-link/words`'s alone.
 * It draws `laneView`'s `where` and `how` marks (`./sharing-marks`), and
 * the sheet's legend draws each (`__tests__/device-home-glyph.test.tsx`).
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

import { pairingOf, useHomeLink } from "@/lib/home-link"
import { jobsLane } from "@/lib/home-link/jobs"
import type { Lane } from "@/lib/home-link/lanes"
import {
  askLane,
  useHandedLane,
  useLaneHome,
  useLaneView,
} from "@/lib/home-link/lanes"
import { practiceLane } from "@/lib/home-link/practice"
import { useVoiceHome } from "@/lib/home-link/voice"
import { SHEET, WORDS } from "@/lib/home-link/words"
import type { WingId } from "@/lib/wings"
import {
  HowMark,
  SharingLegend,
  toneOf,
  WHERE_TONE,
  WhereMark,
} from "@/components/sharing-marks"

const BIG = "h-12 rounded-2xl text-base"

const LaneMark = ({ lane }: { lane: Lane }): JSX.Element => {
  const { run, paired, view, sendNow } = useLaneView(lane)
  const [open, setOpen] = useState(false)
  const words = WORDS[lane.id]

  return (
    <>
      <button
        type="button"
        aria-label={`${words.markLabel}: ${view.line}`}
        onClick={() => setOpen(true)}
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
            run.running && "motion-safe:animate-pulse"
          )}
        />
        {view.how !== null ? (
          <HowMark how={view.how} className="size-4 shrink-0" />
        ) : null}
        <span>{view.word}</span>
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          data-scroll-intent="long-form"
          className={
            // scroll-intent: long-form — the rows and the legend outgrow a
            // phone, held sideways most of all, so the sheet scrolls.
            "max-h-[85dvh] overflow-y-auto rounded-t-3xl px-5 pt-6 pb-8"
          }
        >
          <SheetHeader className="px-0 text-left">
            <SheetTitle className="text-xl">{words.title}</SheetTitle>
            <SheetDescription
              className={cn(
                "text-base break-words",
                toneOf(view.where, view.how)
              )}
            >
              {view.line}
            </SheetDescription>
          </SheetHeader>
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
            {sendNow ? (
              <Button size="lg" className={BIG} onClick={() => askLane(lane)}>
                {SHEET.sendNow}
              </Button>
            ) : null}
            {paired ? null : (
              <p className="text-muted-foreground text-sm">{SHEET.pairFirst}</p>
            )}
            <p className="text-muted-foreground text-sm">{words.footnote}</p>
            <SharingLegend className="rounded-2xl border p-3" />
            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              className="text-sm font-medium underline"
            >
              {SHEET.settings}
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

/**
 * Whether this phone is paired with home, so a Jobs exchange files its
 * decisions and scouts there: its cards say so (J0).
 */
export function usePairedWithHome(): boolean {
  return pairingOf(useHomeLink()) !== null
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

/** One lane's watch, for as long as it is mounted. */
const LaneWatch = ({ lane }: { lane: Lane }): null => {
  useLaneHome(lane)
  return null
}

/** The voice lane's watch, which also copies each new note (`useVoiceHome`). */
const VoiceWatch = (): null => {
  useVoiceHome()
  return null
}

/**
 * The drain: every lane's watch, mounted by the app shell on every screen,
 * so what this phone keeps goes home from any wing while the app is open
 * and the phone is paired (LA15). aph's lane runs while aph's screens are
 * mounted, since only they may hand its store in.
 */
export const HomeLanes = (): JSX.Element => {
  const aph = useHandedLane("aph")
  return (
    <>
      <LaneWatch lane={practiceLane} />
      <LaneWatch lane={jobsLane} />
      <VoiceWatch />
      {aph === null ? null : <LaneWatch key={aph.id} lane={aph} />}
    </>
  )
}
