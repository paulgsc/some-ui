/**
 * The Journal tab: one Build Journal episode's voice takes, recorded against
 * a primer an agent wrote. The primer's cuts sit end to end on a timeline
 * (a Gantt against the episode's budget); the cut in focus sits under it
 * with what to say and one button to say it. A take may run past its
 * cut's target, never past the budget; a redo replaces only its own cut.
 *
 * Calm by default: the episode, the timeline and the share are sections that
 * fold to a line, and a folded timeline still shows where you are (a strip of
 * the cuts, the one in focus outlined). While a take is under way the
 * timeline folds itself, and opens again after.
 *
 * Only renders and forwards taps: what happens and in what order is
 * `lib/journal/machine.ts`; the microphone, the store, `Audio` and the picked
 * file are `lib/journal/runtime.ts` (docs/monorepo-boundaries.md, "Inside a
 * React package").
 */
import type { JSX, ReactNode } from "react"
import { useEffect, useId, useState, useSyncExternalStore } from "react"
import { cn } from "@some-ui/core-utils"
import { Button, useConfirmSheet } from "@some-ui/shared"
import { RECORDING_FAILURE_COPY } from "@some-ui/voice-capture"
import { formatDuration } from "@soundbites/lib/format"
import type {
  JournalActivity,
  JournalState,
} from "@soundbites/lib/journal/machine"
import {
  isSettled,
  isTaking,
  JOURNAL_NOTICES,
} from "@soundbites/lib/journal/machine"
import type { Timeline } from "@soundbites/lib/journal/plan"
import {
  capFor,
  isSpent,
  NUDGE_MS,
  timeline,
} from "@soundbites/lib/journal/plan"
import type { JournalPorts } from "@soundbites/lib/journal/runtime"
import { createJournal } from "@soundbites/lib/journal/runtime"
import { phoneJournalPorts } from "@soundbites/lib/phone"
import {
  ChevronDown,
  FolderOpen,
  Mic,
  Minus,
  Pause,
  Play,
  Plus,
  Square,
} from "lucide-react"

export type JournalProps = {
  /** The phone's ports unless a test says otherwise. Read once, on mount. */
  ports?: Partial<JournalPorts>
  /**
   * The share, in its own section. `taking`: a take is opening, under way
   * or not yet stored; `takes`: how many cuts have one.
   */
  footer?: (state: { taking: boolean; takes: number }) => ReactNode
}

type Section = "episode" | "timeline" | "share"

/** A section that folds to its header. The header stays a summary. */
const Fold = ({
  name,
  open,
  onToggle,
  eyebrow,
  summary,
  aside,
  children,
}: {
  name: Section
  open: boolean
  onToggle: () => void
  eyebrow: string
  summary: ReactNode
  aside?: ReactNode
  children: ReactNode
}): JSX.Element => {
  const body = `journal-${name}`
  return (
    <section className="bg-card border-border/60 rounded-2xl border">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={body}
        className="focus-visible:ring-ring flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left focus-visible:ring-2 focus-visible:outline-none"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">
            {eyebrow}
          </span>
          {summary}
        </span>
        {aside}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "text-muted-foreground size-4 shrink-0 transition-transform motion-reduce:transition-none",
            open && "rotate-180"
          )}
        />
      </button>
      <div id={body} hidden={!open} className="space-y-3 px-4 pb-4">
        {children}
      </div>
    </section>
  )
}

/** A take's fill: recording, past its target, or within it. */
function barTone(row: Timeline["rows"][number]): string {
  if (row.live) return "bg-destructive"
  return row.takenMs !== null && row.takenMs > row.targetMs
    ? "bg-warning"
    : "bg-brand"
}

/** Where each cut sits, its target dashed and its take filled. */
const Gantt = ({
  line,
  selected,
  disabled,
  onSelect,
}: {
  line: Timeline
  selected: string | null
  disabled: boolean
  onSelect: (cutId: string) => void
}): JSX.Element => {
  const at = (ms: number): string => `${(ms / line.scaleMs) * 100}%`
  const minutes: Array<number> = []
  for (let ms = 0; ms <= line.scaleMs; ms += 60_000) minutes.push(ms)
  return (
    <div className="space-y-1">
      <div
        className="text-muted-foreground relative h-4 font-mono text-[10px]"
        aria-hidden="true"
      >
        {minutes.map((ms, i) => (
          <span
            key={ms}
            className={cn(
              "absolute",
              i > 0 && "-translate-x-1/2",
              i > 0 && ms / line.scaleMs > 0.92 && "-translate-x-full"
            )}
            style={{ left: at(ms) }}
          >
            {formatDuration(ms)}
          </span>
        ))}
      </div>
      <ol className="space-y-0.5">
        {line.rows.map((row) => {
          const taken = row.takenMs
          const over = taken !== null && taken > row.targetMs
          const current = row.cut.id === selected
          return (
            <li key={row.cut.id}>
              <button
                type="button"
                onClick={() => onSelect(row.cut.id)}
                disabled={disabled}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "focus-visible:ring-ring -mx-1.5 flex w-[calc(100%+0.75rem)] flex-col gap-1 rounded-xl px-1.5 pt-1.5 pb-2 text-left focus-visible:ring-2 focus-visible:outline-none",
                  current && "bg-brand/25"
                )}
              >
                <span className="flex min-w-0 justify-between gap-2 text-sm font-semibold">
                  <span className="truncate">
                    {row.index + 1}. {row.cut.artifact}
                  </span>
                  <span
                    className={cn(
                      "text-muted-foreground shrink-0 font-mono text-[11px] tabular-nums",
                      over && "text-warning"
                    )}
                  >
                    {taken === null
                      ? formatDuration(row.targetMs)
                      : `${formatDuration(taken)} / ${formatDuration(row.targetMs)}`}
                  </span>
                </span>
                <span className="relative block h-3.5" aria-hidden="true">
                  <span
                    className="border-muted-foreground/70 absolute inset-y-0 rounded-md border-[1.5px] border-dashed"
                    style={{
                      left: at(row.startMs),
                      width: at(row.targetMs),
                    }}
                  />
                  {taken !== null && (
                    <span
                      className={cn(
                        "absolute inset-y-0 rounded-md",
                        barTone(row)
                      )}
                      style={{
                        left: at(row.startMs),
                        width: at(Math.min(taken, line.scaleMs - row.startMs)),
                      }}
                    />
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** The folded timeline: the cuts as one strip, the one in focus outlined. */
const Strip = ({
  line,
  selected,
}: {
  line: Timeline
  selected: string | null
}): JSX.Element => (
  <span className="mt-1 flex h-2 gap-[3px]" aria-hidden="true">
    {line.rows.map((row) => (
      <span
        key={row.cut.id}
        className={cn(
          "block min-w-1.5 rounded-sm",
          row.takenMs === null
            ? "bg-muted ring-border ring-1 ring-inset"
            : barTone(row),
          row.cut.id === selected &&
            "outline-primary outline-2 outline-offset-[1.5px]"
        )}
        style={{ flex: `${row.targetMs} 1 0` }}
      />
    ))}
  </span>
)

const RECORD_LABELS: Record<JournalActivity["kind"], string> = {
  idle: "Start talking",
  playing: "Start talking",
  opening: "Opening the microphone",
  recording: "Done, keep it",
  saving: "Keeping it",
}

/** The cut in focus: what to show, what to say, and the button to say it. */
const CutSheet = ({
  state,
  line,
  onNudge,
  onRecord,
  onDiscard,
  onPlay,
  onNext,
}: {
  state: JournalState
  line: Timeline
  onNudge: (deltaMs: number) => void
  onRecord: () => void
  onDiscard: () => void
  onPlay: () => void
  onNext: (cutId: string) => void
}): JSX.Element | null => {
  const row = line.rows.find((each) => each.cut.id === state.selected)
  if (
    row === undefined ||
    state.shelf.kind !== "read" ||
    state.shelf.plan === null
  )
    return null
  const { activity } = state
  const recording = activity.kind === "recording" ? activity : null
  const busy = activity.kind === "opening" || activity.kind === "saving"
  const settled = isSettled(activity)
  const cap = capFor(state.shelf.plan, state.shelf.takes, row.cut.id)
  const next = line.rows[row.index + 1]
  const playing = activity.kind === "playing" && activity.cutId === row.cut.id
  const shown = row.takenMs ?? 0
  const hint =
    state.notice !== ""
      ? state.notice
      : recording !== null
        ? recording.elapsed > row.targetMs
          ? `Past the target. ${formatDuration(recording.capMs - recording.elapsed)} left in the budget.`
          : `${formatDuration(row.targetMs - recording.elapsed)} to the target · ${formatDuration(recording.capMs - recording.elapsed)} left in the budget`
        : isSpent(cap)
          ? JOURNAL_NOTICES.spent
          : row.take !== null
            ? `Kept ${formatDuration(row.take.durationMs)}. Record again to replace it, up to ${formatDuration(cap)}.`
            : `Up to ${formatDuration(cap)} for this take.`

  return (
    <section
      aria-label={`Cut ${row.index + 1} of ${line.rows.length}`}
      className="bg-card border-border/60 space-y-2.5 rounded-3xl border px-4 pt-3.5 pb-4 shadow-lg"
    >
      <div className="text-muted-foreground flex justify-between gap-2 text-[11px] font-bold tracking-wider uppercase">
        <span>
          Cut {row.index + 1} of {line.rows.length}
        </span>
        <span className="font-mono tabular-nums">
          starts {formatDuration(row.startMs)}
        </span>
      </div>
      <p className="text-muted-foreground text-sm">
        On screen: {row.cut.artifact}
      </p>
      <p className="text-lg leading-snug font-extrabold text-balance">
        {row.cut.prompt}
      </p>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div
          className="flex items-center gap-1.5"
          role="group"
          aria-label="Target"
        >
          <Button
            variant="outline"
            size="icon"
            className="size-8 rounded-full"
            onClick={() => onNudge(-NUDGE_MS)}
            disabled={!settled}
            aria-label="Five seconds shorter"
          >
            <Minus className="size-4" aria-hidden="true" />
          </Button>
          <span className="text-center">
            <span className="block font-mono text-sm tabular-nums">
              {formatDuration(row.targetMs)}
            </span>
            <span className="text-muted-foreground block text-[10px]">
              target
            </span>
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-8 rounded-full"
            onClick={() => onNudge(NUDGE_MS)}
            disabled={!settled}
            aria-label="Five seconds longer"
          >
            <Plus className="size-4" aria-hidden="true" />
          </Button>
        </div>
        <button
          type="button"
          onClick={onRecord}
          disabled={busy || (settled && isSpent(cap))}
          aria-pressed={recording !== null}
          aria-label={
            row.take !== null && settled
              ? "Redo this take"
              : RECORD_LABELS[activity.kind]
          }
          className={cn(
            "focus-visible:ring-ring focus-visible:ring-offset-background grid size-20 place-items-center rounded-full shadow-lg focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60",
            recording !== null
              ? "bg-destructive text-white"
              : "bg-brand text-brand-foreground"
          )}
        >
          {recording !== null ? (
            <Square className="size-7" aria-hidden="true" />
          ) : (
            <Mic className="size-8" aria-hidden="true" />
          )}
        </button>
        <div className="flex flex-col items-end gap-1">
          <Button
            variant="link"
            size="sm"
            className="h-auto px-0"
            onClick={onPlay}
            disabled={row.take === null || !settled}
          >
            {playing ? (
              <Pause className="size-3.5" aria-hidden="true" />
            ) : (
              <Play className="size-3.5" aria-hidden="true" />
            )}
            {playing ? "Stop" : "Play take"}
          </Button>
          {recording !== null ? (
            <Button
              variant="link"
              size="sm"
              className="h-auto px-0"
              onClick={onDiscard}
            >
              Throw it away
            </Button>
          ) : (
            <Button
              variant="link"
              size="sm"
              className="h-auto px-0"
              onClick={() => next !== undefined && onNext(next.cut.id)}
              disabled={next === undefined || !settled}
            >
              Next cut
            </Button>
          )}
        </div>
      </div>
      <p className="text-center font-mono text-xl font-semibold tabular-nums">
        {formatDuration(shown)}{" "}
        <span className="text-muted-foreground text-xs">
          / {formatDuration(row.targetMs)}
        </span>
      </p>
      <p
        aria-live="polite"
        className={cn(
          "text-muted-foreground min-h-5 text-center text-xs",
          recording !== null &&
            recording.elapsed > row.targetMs &&
            "text-warning font-semibold"
        )}
      >
        {hint}
      </p>
      {state.blocked !== null && activity.kind === "idle" && (
        <p role="alert" className="text-destructive text-center text-sm">
          {RECORDING_FAILURE_COPY[state.blocked]}
        </p>
      )}
    </section>
  )
}

export const Journal = ({ ports, footer }: JournalProps): JSX.Element => {
  /* eslint-disable owner-guard/no-mount-snapshot -- the runtime is created once per mount, as the soundbites page's is */
  const [runtime] = useState(() =>
    createJournal({ ...phoneJournalPorts(), ...ports })
  )
  /* eslint-enable owner-guard/no-mount-snapshot */
  useEffect(() => runtime.attach(), [runtime])
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)
  const { dispatch } = runtime
  const [open, setOpen] = useState<Record<Section, boolean>>({
    episode: false,
    timeline: true,
    share: false,
  })
  // Opened by hand during this take (its start time), so the fold for the
  // take does not shut it again; any later take folds as usual.
  const [peek, setPeek] = useState<number | null>(null)
  const fileHint = useId()

  const { shelf, activity } = state
  const plan = shelf.kind === "read" ? shelf.plan : null
  const takes = shelf.kind === "read" ? shelf.takes : []
  const recording = activity.kind === "recording" ? activity : null
  const line = plan === null ? null : timeline(plan, takes, recording)
  const taking = isTaking(activity)

  // Nothing to fold away until a primer is open, and a primer that waits
  // on the person, or a file that could not be read, is shown, not hidden.
  const episodeOpen =
    open.episode ||
    plan === null ||
    state.pending !== null ||
    state.primerProblem !== null
  const timelineOpen =
    open.timeline && (recording === null || peek === recording.startedAt)
  const toggle = (section: Section): void => {
    if (section === "timeline" && recording !== null && !timelineOpen) {
      setOpen((was) => ({ ...was, timeline: true }))
      setPeek(recording.startedAt)
      return
    }
    setOpen((was) => ({ ...was, [section]: !was[section] }))
  }

  const recordedMs = line?.recordedMs ?? 0
  const focus = line?.rows.find((row) => row.cut.id === state.selected) ?? null

  const { ask, sheet } = useConfirmSheet()
  const discard = (): void =>
    ask({
      title: "Discard this episode?",
      description: "Its primer and every take leave the phone.",
      confirm: "Discard it",
      onConfirm: () => dispatch({ type: "episodeDiscarded" }),
    })

  return (
    <div className="flex flex-col gap-2.5">
      <Fold
        name="episode"
        open={episodeOpen}
        onToggle={() => toggle("episode")}
        eyebrow="Episode"
        summary={
          <>
            <b className="truncate text-base font-extrabold">
              {plan?.primer.title ?? "No primer open"}
            </b>
            <span className="text-muted-foreground truncate text-xs">
              {plan === null
                ? "Open one an agent saved to Drive."
                : `${plan.primer.cuts.length} cuts · ${takes.length} recorded · kept until shared`}
            </span>
          </>
        }
      >
        <label className="bg-background border-border/60 focus-within:ring-ring relative flex cursor-pointer items-center gap-3 rounded-2xl border p-3 focus-within:ring-2">
          <FolderOpen
            className="text-primary size-6 shrink-0"
            aria-hidden="true"
          />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">
              Open a primer from storage
            </span>
            <span
              id={fileHint}
              aria-live="polite"
              className={cn(
                "block text-xs",
                state.primerProblem === null
                  ? "text-muted-foreground"
                  : "text-destructive"
              )}
            >
              {state.primerProblem ??
                "A primer.json an agent saved to Build Journal/voice/primers."}
            </span>
          </span>
          <input
            type="file"
            accept=".json,application/json"
            aria-describedby={fileHint}
            className="sr-only"
            disabled={!isSettled(activity)}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              // The same file again is a new pick.
              event.currentTarget.value = ""
              if (file) dispatch({ type: "primerPicked", file })
            }}
          />
        </label>
        {state.pending !== null && (
          <div
            role="alert"
            className="border-border/60 space-y-2.5 rounded-2xl border p-3 text-sm"
          >
            <p>
              &ldquo;{state.pending.primer.title}&rdquo; has no cut for{" "}
              {state.pending.drops.length} of your takes (
              {state.pending.drops.join(", ")}). Opening it lets those go; takes
              for cuts it keeps stay.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => dispatch({ type: "replaceConfirmed" })}
              >
                Open it
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => dispatch({ type: "replaceCancelled" })}
              >
                Keep this one
              </Button>
            </div>
          </div>
        )}
        {plan !== null && (
          <Button
            variant="link"
            size="sm"
            className="text-destructive h-auto px-0"
            onClick={discard}
            disabled={!isSettled(activity)}
          >
            Discard this episode
          </Button>
        )}
        {shelf.kind === "unreadable" && (
          <div role="alert" className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              Couldn&apos;t read the episode on this phone.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => dispatch({ type: "retryRead" })}
            >
              Read it again
            </Button>
          </div>
        )}
      </Fold>

      {line !== null && (
        <Fold
          name="timeline"
          open={timelineOpen}
          onToggle={() => toggle("timeline")}
          eyebrow="Timeline"
          summary={
            <>
              <span className="truncate text-sm font-bold">
                {recording === null ? "Now" : "Recording"}:{" "}
                {focus === null
                  ? "—"
                  : `${focus.index + 1}. ${focus.cut.artifact}`}
              </span>
              {!timelineOpen && <Strip line={line} selected={state.selected} />}
            </>
          }
          aside={
            <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
              {formatDuration(recordedMs)} / {formatDuration(line.budgetMs)}
            </span>
          }
        >
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between text-sm">
              <span>
                <b className="font-mono text-lg tabular-nums">
                  {formatDuration(recordedMs)}
                </b>{" "}
                <span className="text-muted-foreground">
                  recorded of {formatDuration(line.budgetMs)}
                </span>
              </span>
              <span
                className={cn(
                  "text-muted-foreground",
                  line.plannedMs > line.budgetMs && "text-warning"
                )}
              >
                planned {formatDuration(line.plannedMs)}
              </span>
            </div>
            <div
              role="meter"
              aria-label="Budget recorded"
              aria-valuemin={0}
              aria-valuemax={line.budgetMs}
              aria-valuenow={recordedMs}
              className="bg-muted h-2.5 overflow-hidden rounded-full"
            >
              <div
                className="bg-brand h-full rounded-full"
                style={{
                  width: `${Math.min(100, (recordedMs / line.budgetMs) * 100)}%`,
                }}
              />
            </div>
          </div>
          <Gantt
            line={line}
            selected={state.selected}
            disabled={!isSettled(activity)}
            onSelect={(cutId) => dispatch({ type: "cutSelected", cutId })}
          />
        </Fold>
      )}

      {line !== null && (
        <CutSheet
          state={state}
          line={line}
          onNudge={(deltaMs) => dispatch({ type: "nudged", deltaMs })}
          onRecord={() => dispatch({ type: "recordPressed" })}
          onDiscard={() => dispatch({ type: "discardPressed" })}
          onPlay={() => dispatch({ type: "playPressed" })}
          onNext={(cutId) => dispatch({ type: "cutSelected", cutId })}
        />
      )}

      {footer !== undefined && plan !== null && (
        <Fold
          name="share"
          open={open.share}
          onToggle={() => toggle("share")}
          eyebrow="Share"
          summary={
            <>
              <b className="text-base font-extrabold">
                Send the takes to Drive
              </b>
              <span className="text-muted-foreground truncate text-xs">
                {takes.length === 0
                  ? "No takes yet"
                  : `${takes.length} of ${plan.primer.cuts.length} cuts have a take`}
              </span>
            </>
          }
        >
          {footer({ taking, takes: takes.length })}
        </Fold>
      )}
      {sheet}
    </div>
  )
}
