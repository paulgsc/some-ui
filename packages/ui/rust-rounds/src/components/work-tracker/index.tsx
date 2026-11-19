/**
 * The work tracker on the phone (RR26, paulgsc/some-ui#3250; the flow
 * prototype the owner approved, C690): a control to start counting time
 * spent away from the phone, the sheet that asks on return whether all of
 * it was work, and the week's time as a bar per ticket (C677).
 *
 * Every decision is the runtime's (`lib/work-tracker/runtime`): these read
 * its snapshot and send it the owner's taps. What was counted is a `Notice`
 * over the screen, never a line in it (HS1); the sheet is the one place the
 * screen asks.
 */
import type { JSX } from "react"
import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import type { SpanWhere } from "@rust-rounds/lib/work-tracker"
import { CAP_MS, spanSeconds } from "@rust-rounds/lib/work-tracker"
import type {
  WorkPorts,
  WorkTracker,
} from "@rust-rounds/lib/work-tracker/runtime"
import type { WeekTime } from "@rust-rounds/lib/work-tracker/week-time"
import { weekTime, WORK_STEPS } from "@rust-rounds/lib/work-tracker/week-time"
import { TRACKER_WORDS } from "@rust-rounds/lib/work-tracker/words"
import {
  Button,
  Notice,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@some-ui/shared"

const STEP_MINUTES = 15

/** The part offered first: the last 15-minute step short of the span. */
export function firstPart(spanMinutes: number): number {
  const steps = Math.floor(spanMinutes / STEP_MINUTES)
  const top = steps * STEP_MINUTES
  return top === spanMinutes && steps > 1 ? top - STEP_MINUTES : top
}

const WORDS = TRACKER_WORDS

/** The ask on return: all of it, part of it, or none. */
const AskSheet = ({
  tracker,
}: {
  tracker: WorkTracker
}): JSX.Element | null => {
  const { state } = useSyncExternalStore(tracker.subscribe, tracker.getSnapshot)
  const asking = state.kind === "asking" ? state : null
  const spanned =
    asking === null ? 0 : spanSeconds(asking.span, asking.stoppedAt)
  const spanMinutes = Math.floor(spanned / 60)
  const [part, setPart] = useState<number | null>(null)
  const [open, setOpen] = useState(true)
  if (asking === null) return null
  const minutes = part ?? firstPart(spanMinutes)
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        {WORDS.sheet.ask}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl px-5 pt-6 pb-8">
          <SheetHeader className="px-0 text-left">
            <SheetTitle className="text-xl">{WORDS.sheet.title}</SheetTitle>
            <SheetDescription className="text-base">
              {WORDS.sheet.started(
                asking.span.where.ticket,
                asking.span.startedAt
              )}{" "}
              {asking.stoppedBy === "itself"
                ? WORDS.sheet.stoppedItself(CAP_MS, asking.stoppedAt)
                : WORDS.sheet.stoppedByYou(asking.stoppedAt)}
            </SheetDescription>
          </SheetHeader>
          <p className="mt-4 text-lg font-semibold">{WORDS.sheet.ask}</p>
          {asking.notKept ? (
            <Notice key={asking.span.id} tone="warning" dismissible>
              {WORDS.sheet.notKept}
            </Notice>
          ) : null}
          <div className="mt-4 flex flex-col gap-2.5">
            <Button
              type="button"
              size="lg"
              className="h-12 rounded-2xl text-base"
              onClick={() => tracker.answer({ kind: "all" })}
            >
              {WORDS.sheet.all(spanned)}
            </Button>
            {spanMinutes >= STEP_MINUTES ? (
              <div className="flex items-center gap-2">
                <span className="text-sm">{WORDS.sheet.partLabel}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={WORDS.sheet.less}
                  disabled={minutes <= STEP_MINUTES}
                  onClick={() => setPart(minutes - STEP_MINUTES)}
                >
                  −
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 min-w-0 flex-1 rounded-2xl"
                  onClick={() => tracker.answer({ kind: "part", minutes })}
                >
                  {WORDS.sheet.part(minutes)}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={WORDS.sheet.more}
                  disabled={minutes + STEP_MINUTES > spanMinutes}
                  onClick={() => setPart(minutes + STEP_MINUTES)}
                >
                  +
                </Button>
              </div>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              className="h-12 rounded-2xl"
              onClick={() => tracker.answer({ kind: "none" })}
            >
              {WORDS.sheet.none}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

/** What was just counted, or that nothing could start, over the screen. */
const TrackerNotice = ({
  tracker,
}: {
  tracker: WorkTracker
}): JSX.Element | null => {
  const { notice } = useSyncExternalStore(
    tracker.subscribe,
    tracker.getSnapshot
  )
  if (notice === null) return null
  if (notice.kind === "not-started") {
    return (
      <Notice tone="warning" onDismiss={tracker.dismiss}>
        {WORDS.notStarted}
      </Notice>
    )
  }
  const { closed } = notice
  return (
    <Notice onDismiss={tracker.dismiss}>
      {WORDS.counted(
        closed.span.where.ticket,
        closed.countedSeconds,
        closed.span.startedAt,
        closed.stoppedAt
      )}
    </Notice>
  )
}

/**
 * The control for one screen: start counting toward `where`, the span
 * running, or the ask on return. One span is open at a time, whichever
 * screen started it.
 */
export const WorkTrackerControl = ({
  tracker,
  where,
}: {
  tracker: WorkTracker
  /** What a span started here counts toward; null where none starts. */
  where: SpanWhere | null
}): JSX.Element | null => {
  useEffect(() => tracker.attach(), [tracker])
  const { state, now } = useSyncExternalStore(
    tracker.subscribe,
    tracker.getSnapshot
  )
  const running = state.kind === "running"
  if (where === null && (state.kind === "idle" || state.kind === "unknown")) {
    return <TrackerNotice tracker={tracker} />
  }
  return (
    <div
      data-work-tracker={state.kind}
      className={
        running
          ? "border-primary flex items-center justify-between gap-2 rounded-xl border px-3 py-1.5"
          : "flex items-center justify-between gap-2 rounded-xl border border-dashed px-3 py-1.5"
      }
    >
      {state.kind === "idle" && where !== null ? (
        <>
          <span className="text-muted-foreground text-sm">{WORDS.idle}</span>
          <Button type="button" size="sm" onClick={() => tracker.start(where)}>
            {WORDS.start}
          </Button>
        </>
      ) : state.kind === "running" ? (
        <>
          <span className="text-sm tabular-nums">
            {WORDS.running(
              state.span.startedAt,
              spanSeconds(
                state.span,
                Math.min(now, state.span.startedAt + CAP_MS)
              )
            )}
          </span>
          <Button type="button" size="sm" onClick={tracker.back}>
            {WORDS.back}
          </Button>
        </>
      ) : state.kind === "unknown" ? (
        <span className="text-muted-foreground text-sm">{WORDS.unknown}</span>
      ) : (
        // Keyed by the span, so a new question opens with its own part.
        <AskSheet
          key={state.kind === "asking" ? state.span.id : state.kind}
          tracker={tracker}
        />
      )}
      <TrackerNotice tracker={tracker} />
    </div>
  )
}

const STEP_FILL = {
  read: "var(--chart-1)",
  academy: "var(--chart-2)",
  voice: "var(--chart-3)",
} as const

/** One ticket's bar: its time by the step each stretch was started from. */
const TicketBar = ({
  ticket,
  longest,
}: {
  ticket: WeekTime["tickets"][number]
  longest: number
}): JSX.Element => (
  <div className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 text-xs">
    <span className="font-mono">{ticket.ticket}</span>
    <div className="flex h-3 gap-0.5">
      {WORK_STEPS.filter((step) => ticket.byStep[step] > 0).map((step) => (
        <div
          key={step}
          role="img"
          title={WORDS.week.bar(ticket.ticket, step, ticket.byStep[step])}
          aria-label={WORDS.week.bar(ticket.ticket, step, ticket.byStep[step])}
          className="h-full rounded-sm"
          style={{
            width: `${(ticket.byStep[step] / longest) * 100}%`,
            background: STEP_FILL[step],
          }}
        />
      ))}
    </div>
    <span className="tabular-nums">
      {WORDS.week.ticketTotal(ticket.seconds)}
    </span>
  </div>
)

/** The week's tracked time: a bar per ticket, or the same as a table. */
export const WeekTimeChart = ({
  ports,
  week,
}: {
  ports: WorkPorts
  week: {
    readonly id: string
    readonly tickets: ReadonlyArray<{ readonly id: string }>
  }
}): JSX.Element => {
  const revision = useSyncExternalStore(ports.onChange, ports.revision)
  const time = useMemo(() => {
    const known = ports.spansOf(week.id)
    return weekTime(week, known.phone, known.home, known.refused)
    // `revision` changes whenever what `spansOf` answers may have.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ports, week, revision])
  const [table, setTable] = useState(false)
  const longest = Math.max(1, ...time.tickets.map((each) => each.seconds))
  return (
    <section
      aria-label={WORDS.week.title}
      className="bg-card flex flex-col gap-2 rounded-2xl border p-3"
    >
      <h3 className="text-sm font-semibold">{WORDS.week.title}</h3>
      <p className="text-sm">{WORDS.week.total(time.seconds, time.spans)}</p>
      {time.spans === 0 ? null : table ? (
        <table className="text-xs">
          <thead>
            <tr>
              <th className="text-left">{WORDS.week.ticket}</th>
              {WORK_STEPS.map((step) => (
                <th key={step} className="text-right">
                  {WORDS.week.step(step)}
                </th>
              ))}
              <th className="text-right">{WORDS.week.all}</th>
            </tr>
          </thead>
          <tbody>
            {time.tickets.map((ticket) => (
              <tr key={ticket.ticket}>
                <th className="text-left font-mono font-normal">
                  {ticket.ticket}
                </th>
                {WORK_STEPS.map((step) => (
                  <td key={step} className="text-right tabular-nums">
                    {WORDS.week.ticketTotal(ticket.byStep[step])}
                  </td>
                ))}
                <td className="text-right tabular-nums">
                  {WORDS.week.ticketTotal(ticket.seconds)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
            <span>{WORDS.week.startedFrom}</span>
            {WORK_STEPS.map((step) => (
              <span key={step} className="flex items-center gap-1">
                <span
                  aria-hidden
                  className="inline-block size-2.5 rounded-sm"
                  style={{ background: STEP_FILL[step] }}
                />
                {WORDS.week.step(step)}
              </span>
            ))}
          </div>
          {time.tickets.map((ticket) => (
            <TicketBar key={ticket.ticket} ticket={ticket} longest={longest} />
          ))}
        </>
      )}
      {time.spans === 0 ? null : (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="self-start px-0"
          onClick={() => setTable((now) => !now)}
        >
          {table ? WORDS.week.asBars : WORDS.week.asTable}
        </Button>
      )}
      {time.refused === 0 ? null : (
        <p className="text-muted-foreground text-xs">
          {WORDS.week.refused(time.refused)}
        </p>
      )}
      <p className="text-muted-foreground text-xs">{WORDS.week.yours}</p>
    </section>
  )
}
