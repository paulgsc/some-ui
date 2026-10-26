/**
 * The reflections routine's mark on the handheld start screen
 * (`core/routine-status`): when it last ran and whether it brought anything
 * new, at a glance, and a sheet with its runs as home told them and what
 * each mark means. Its words are `ROUTINE_WORDS`' alone.
 * The two axes it draws are `core/routine-status`'s; no two states share a mark
 * (`index.test.tsx`).
 */

import type { JSX } from "react"
import { useMemo, useState, useSyncExternalStore } from "react"
import { cn, dayOf } from "@some-ui/core-utils"
import {
  Button,
  MarkLegend,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@some-ui/shared"
import { createOpenedStore } from "@topik/lib/topik/adapter/routine-files"
import type { HeldRuns, RunLog } from "@topik/lib/topik/adapter/routine-runs"
import { sharedRunLog } from "@topik/lib/topik/adapter/routine-runs"
import type {
  RoutineShape,
  RoutineView,
  VoiceShape,
} from "@topik/lib/topik/core/routine-status"
import {
  ROUTINE_WORDS,
  routineView,
  runLine,
  SHAPE_ORDER,
  VOICE_ORDER,
} from "@topik/lib/topik/core/routine-status"

/** Runs the sheet lists; all are kept. */
const SHOWN_RUNS = 14

const TONE: Record<RoutineShape, string> = {
  fresh: "text-success",
  opened: "text-success",
  rested: "text-muted-foreground",
  unheard: "text-muted-foreground",
  away: "text-muted-foreground",
  quiet: "text-warning",
  partly: "text-warning",
  stopped: "text-warning",
}

const VOICE_TONE: Record<VoiceShape, string> = {
  waiting: "text-muted-foreground",
  missed: "text-warning",
  unread: "text-warning",
  garbled: "text-warning",
}

/**
 * A sun for the morning run. Each shape differs in form, not only in
 * colour: rays for something new, a check for all opened, a flat line for
 * nothing to answer, a half for some left, a square for ended early, and a
 * broken ring for no word: with a mark for quiet, clock hands for away, and
 * nothing inside for none heard yet.
 */
const RoutineMark = ({
  shape,
  className,
}: {
  shape: RoutineShape
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
    data-shape={shape}
    className={className}
  >
    <circle
      cx="12"
      cy="12"
      r="6"
      strokeDasharray={
        shape === "quiet" || shape === "away" || shape === "unheard"
          ? "2.6 2.4"
          : undefined
      }
    />
    {shape === "fresh" ? (
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    ) : null}
    {shape === "opened" ? <path d="m9.3 12.2 1.9 1.9 3.6-4" /> : null}
    {shape === "rested" ? <path d="M9.5 12h5" /> : null}
    {shape === "partly" ? (
      <path d="M12 8.5a3.5 3.5 0 0 0 0 7z" fill="currentColor" />
    ) : null}
    {shape === "stopped" ? (
      <rect x="9.6" y="9.6" width="4.8" height="4.8" rx="0.6" />
    ) : null}
    {shape === "away" ? <path d="M12 9.4V12l1.8 1.3" /> : null}
    {shape === "quiet" ? (
      <>
        <path d="M12 9v3.2" />
        <path d="M12 15v.1" />
      </>
    ) : null}
  </svg>
)

/**
 * What became of the voice notes, beside the routine's mark: a speech
 * bubble, with three dots while one waits for home, a slash for one home
 * never heard, a question mark when what home heard couldn't be read, and a
 * zigzag when the run's own word on them couldn't be read.
 */
const VoiceMark = ({
  shape,
  className,
}: {
  shape: VoiceShape
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
    data-voice={shape}
    className={className}
  >
    <path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-8l-4 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5z" />
    {shape === "waiting" ? <path d="M8.5 11h.1M12 11h.1M15.5 11h.1" /> : null}
    {shape === "missed" ? <path d="m8.5 14.5 7-7" /> : null}
    {shape === "garbled" ? <path d="m8 11.5 2-2 2 2.5 2-2.5 2 2" /> : null}
    {shape === "unread" ? (
      <>
        <path d="M10.2 9.2a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.1v.4" />
        <path d="M12 14.3v.1" />
      </>
    ) : null}
  </svg>
)

/** What the routine's last run did as its tone: the board's word wears it. */
export const routineTone = (shape: RoutineShape): string => TONE[shape]

/** The routine's mark and, beside it, its voice notes' marks, as the handheld draws them. */
export const RoutineMarks = ({
  shape,
  voice,
  small = false,
}: {
  shape: RoutineShape
  voice: ReadonlyArray<VoiceShape>
  small?: boolean
}): JSX.Element => (
  <>
    <RoutineMark
      shape={shape}
      className={cn(small ? "size-5" : "size-6", "shrink-0", TONE[shape])}
    />
    {voice.map((v) => (
      <VoiceMark
        key={v}
        shape={v}
        className={cn(small ? "size-4" : "size-5", "shrink-0", VOICE_TONE[v])}
      />
    ))}
  </>
)

/** What each of the routine's marks means. */
export const RoutineLegend = ({
  title = ROUTINE_WORDS.legend,
  className,
}: {
  /** Its heading: on a page beside other legends, the routine's name. */
  title?: string
  className?: string
}): JSX.Element => (
  <MarkLegend
    title={title}
    {...(className === undefined ? {} : { className })}
    lines={[
      ...SHAPE_ORDER.map((shape) => ({
        key: shape,
        mark: (
          <RoutineMark
            shape={shape}
            className={cn("size-5 shrink-0", TONE[shape])}
          />
        ),
        text: ROUTINE_WORDS.shapes[shape],
      })),
      ...VOICE_ORDER.map((shape) => ({
        key: shape,
        mark: (
          <VoiceMark
            shape={shape}
            className={cn("size-5 shrink-0", VOICE_TONE[shape])}
          />
        ),
        text: ROUTINE_WORDS.voiceShapes[shape],
      })),
    ]}
  />
)

const NO_SUBSCRIBE = (): (() => void) => () => {}
const NO_LOG = (): null => null

/** What the phone holds of the routine's runs from this home, or null with no log. */
export function useHeldRuns(
  log: RunLog | undefined,
  key: string
): HeldRuns | null {
  return useSyncExternalStore(
    log?.subscribe ?? NO_SUBSCRIBE,
    log === undefined ? NO_LOG : (): HeldRuns => log.held(key)
  )
}

/**
 * The routine's mark as the handheld would show it now, read from what this
 * phone kept of home `key`'s runs and what it has opened, for a page beside
 * Korean's own (the Android app's status page).
 */
export function useRoutineStatus(key: string, now: Date): RoutineView {
  const log = sharedRunLog()
  const held = useSyncExternalStore(log.subscribe, () => log.held(key))
  const opened = useMemo(() => createOpenedStore(), [])
  return routineView(held, opened.opened(), now, dayOf(now))
}

export const RoutineStatus = ({
  view,
  held,
  today,
}: {
  view: RoutineView
  held: HeldRuns
  /** The learner's local day. */
  today: string
}): JSX.Element => {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        data-slot="routine-status"
        aria-label={ROUTINE_WORDS.open(view)}
        onClick={() => setOpen(true)}
        className="bg-card border-border flex min-h-12 shrink-0 items-center gap-3 rounded-2xl border px-4 py-2.5 text-left"
      >
        <RoutineMarks
          shape={view.shape}
          voice={view.voice.map(({ shape }) => shape)}
        />
        <span className="min-w-0 flex-1">
          <span className={cn("block text-sm font-semibold", TONE[view.shape])}>
            {view.word}
          </span>
          <span className="text-muted-foreground line-clamp-2 block text-xs">
            {view.line}
          </span>
        </span>
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          data-slot="routine-sheet"
          data-scroll-intent="long-form"
          className={
            // scroll-intent: long-form — a fortnight of runs and the legend
            // outgrow a phone held sideways, so the sheet scrolls.
            "max-h-[85dvh] overflow-y-auto rounded-t-3xl px-5 pt-6 pb-8"
          }
        >
          <SheetHeader className="px-0 text-left">
            <SheetTitle className="text-xl">{ROUTINE_WORDS.title}</SheetTitle>
            <SheetDescription className={cn("text-base", TONE[view.shape])}>
              {view.line}
            </SheetDescription>
          </SheetHeader>
          {view.voice.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
              {view.voice.map(({ shape, line }) => (
                <li
                  key={shape}
                  className={cn(
                    "flex items-start gap-3 text-sm",
                    VOICE_TONE[shape]
                  )}
                >
                  <VoiceMark shape={shape} className="size-5 shrink-0" />
                  {line}
                </li>
              ))}
            </ul>
          )}
          <p className="text-muted-foreground mt-3 text-sm">
            {ROUTINE_WORDS.what}
          </p>
          {held.runs.length > 0 && (
            <section aria-label={ROUTINE_WORDS.history} className="mt-4">
              <h3 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                {ROUTINE_WORDS.history}
              </h3>
              <ol className="mt-2 flex flex-col gap-2">
                {held.runs.slice(0, SHOWN_RUNS).map((run) => (
                  <li key={run.name} className="text-sm break-words">
                    {runLine(run, today)}
                  </li>
                ))}
              </ol>
              {held.since !== null && (
                <p className="text-muted-foreground mt-2 text-xs">
                  {ROUTINE_WORDS.kept(held.since, today)}
                </p>
              )}
            </section>
          )}
          <RoutineLegend className="mt-4" />
          <Button
            size="lg"
            className="mt-5 h-12 w-full rounded-2xl text-base"
            onClick={() => setOpen(false)}
          >
            {ROUTINE_WORDS.done}
          </Button>
        </SheetContent>
      </Sheet>
    </>
  )
}
