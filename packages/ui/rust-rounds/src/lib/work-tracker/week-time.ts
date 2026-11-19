/**
 * A week's tracked time, as its brief draws it (RR26, C677): a bar per
 * ticket, split by the step each span was started from, and the week's
 * total. Pure over this phone's record (`./record`) and the week's spans as
 * home last said (`./home`).
 *
 * - **Each span once.** A span is known by its id: one home holds and this
 *   phone kept is the same span. Home's close stands where both have one,
 *   since home keeps one close a span.
 * - **Counted is what the owner said.** An answered span counts its
 *   `countedSeconds`; one still open or unanswered counts nothing yet.
 * - **A span home refused for good** (it started before another closed)
 *   is kept on this phone and counted apart (`refused`), never in the
 *   total, which would count that time twice.
 * - **Time naming several points counts once** (C679): a span counts once in
 *   its ticket and the week, whatever points it names.
 */
import type { WorkStep } from "@rust-rounds/lib/work-tracker"
import type { HomeSpan } from "@rust-rounds/lib/work-tracker/home"
import type { SpanEvent, SpanStart } from "@rust-rounds/lib/work-tracker/record"

export const WORK_STEPS: ReadonlyArray<WorkStep> = ["read", "academy", "voice"]

type TicketTime = {
  readonly ticket: string
  /** Counted seconds by the step each span was started from. */
  readonly byStep: Readonly<Record<WorkStep, number>>
  readonly seconds: number
}

export type WeekTime = {
  /** Every ticket of the week, in its order, then any other a span named. */
  readonly tickets: ReadonlyArray<TicketTime>
  readonly seconds: number
  /** Spans answered and counted. */
  readonly spans: number
  /** Spans home refused for good, kept on this phone only. */
  readonly refused: number
}

type Counted = {
  readonly ticket: string
  readonly step: WorkStep
  readonly seconds: number | null
}

/** Each span of the week once, with what it counts. */
function weekSpans(
  week: string,
  phone: ReadonlyArray<SpanEvent>,
  home: ReadonlyArray<HomeSpan>,
  refused: (key: string) => boolean
): Map<string, Counted> {
  const spans = new Map<string, Counted>()
  const starts = new Map(
    phone
      .filter((each): each is SpanStart => each.kind === "start")
      .map((start) => [start.id, start])
  )
  for (const start of starts.values()) {
    if (start.week !== week) continue
    spans.set(start.id, {
      ticket: start.ticket,
      step: start.step,
      seconds: null,
    })
  }
  for (const close of phone) {
    // A close home refused (another device answered first) counts nothing.
    if (close.kind !== "close" || refused(`${close.id}/close`)) continue
    const span = spans.get(close.id)
    if (span !== undefined) {
      spans.set(close.id, { ...span, seconds: close.countedSeconds })
    }
  }
  for (const span of home) {
    if (span.week !== week) continue
    const kept = spans.get(span.id)
    spans.set(span.id, {
      ticket: span.ticket,
      step: span.step,
      seconds: span.closed?.countedSeconds ?? kept?.seconds ?? null,
    })
  }
  return spans
}

const NO_STEPS: Record<WorkStep, number> = { read: 0, academy: 0, voice: 0 }

export function weekTime(
  week: {
    readonly id: string
    readonly tickets: ReadonlyArray<{ readonly id: string }>
  },
  phone: ReadonlyArray<SpanEvent>,
  home: ReadonlyArray<HomeSpan>,
  refused: (key: string) => boolean
): WeekTime {
  const byTicket = new Map<string, Record<WorkStep, number>>(
    week.tickets.map(({ id }) => [id, { ...NO_STEPS }])
  )
  let seconds = 0
  let spans = 0
  let refusedSpans = 0
  for (const [id, span] of weekSpans(week.id, phone, home, refused)) {
    if (refused(`${id}/start`)) {
      refusedSpans += 1
      continue
    }
    if (span.seconds === null) continue
    const steps = byTicket.get(span.ticket) ?? { ...NO_STEPS }
    steps[span.step] += span.seconds
    byTicket.set(span.ticket, steps)
    seconds += span.seconds
    spans += 1
  }
  return {
    tickets: [...byTicket].map(([ticket, byStep]) => ({
      ticket,
      byStep,
      seconds: byStep.read + byStep.academy + byStep.voice,
    })),
    seconds,
    spans,
    refused: refusedSpans,
  }
}
