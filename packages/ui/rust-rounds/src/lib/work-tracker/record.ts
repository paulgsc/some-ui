/**
 * The tracker's record on this phone (RR26, paulgsc/some-ui#3250): each
 * span's start and close, kept here first, in the order they happened, and
 * sent home from here by the Rust Rounds lane. It is the outbox: a span
 * made with no home in reach is kept and goes once home is, and nothing in
 * it is ever rewritten or let go (CLAUDE.md, "Never lose the record").
 *
 * - **Kept before it counts.** The runtime (`./runtime`) starts a span only
 *   once its start is kept here, and takes an answer as kept only once its
 *   close is.
 * - **Sent as it was kept.** An event's wire body is the event as kept,
 *   without its `kind`: `at` is the string written when it happened, so a
 *   send again is byte for byte the same, which is how home tells a retry
 *   (paulgsc/server `work_span`, "the same compares `at` as text").
 * - **A start before its close.** A close goes only once home holds its
 *   start, or when its start is not on this phone (a span another device
 *   started and this one answered): `spanEventsGoing`.
 * - **The phone's own view of what is open** (`openOnPhone`) is the last
 *   start kept here with no close, until home says otherwise.
 */
import type {
  Answer,
  ClosedSpan,
  OpenSpan,
  WorkStep,
} from "@rust-rounds/lib/work-tracker"
import type { KeyedStorage } from "@some-ui/core-utils"
import type { BundleRecords } from "@some-ui/voice-capture"
import { keptRecords } from "@some-ui/voice-capture"
import { z } from "zod"

/** Where the tracker's events are kept on this phone. */
const WORK_SPANS_KEY = "some-ui:rust-rounds.work-spans"

export type SpanStart = {
  readonly kind: "start"
  readonly id: string
  /** When it started, ISO, as written then. */
  readonly at: string
  readonly week: string
  readonly ticket: string
  readonly step: WorkStep
  readonly exercise: number | null
  readonly points: ReadonlyArray<number>
  readonly device: string
}

export type SpanClose = {
  readonly kind: "close"
  readonly id: string
  /** When it stopped, ISO, as written then. */
  readonly at: string
  readonly stoppedBy: "you" | "itself"
  readonly answer: Answer["kind"]
  readonly countedSeconds: number
}

export type SpanEvent = SpanStart | SpanClose

const StepSchema = z.enum(["read", "academy", "voice"])

const SpanEventSchema: z.ZodType<SpanEvent> = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("start"),
    id: z.string(),
    at: z.string(),
    week: z.string(),
    ticket: z.string(),
    step: StepSchema,
    exercise: z.number().int().positive().nullable(),
    points: z.array(z.number().int().positive()),
    device: z.string(),
  }),
  z.object({
    kind: z.literal("close"),
    id: z.string(),
    at: z.string(),
    stoppedBy: z.enum(["you", "itself"]),
    answer: z.enum(["all", "part", "none"]),
    countedSeconds: z.number().int().nonnegative(),
  }),
])

/** The tracker's events on this phone, which only grow. */
export const workSpans = (
  storage: KeyedStorage | null
): BundleRecords<SpanEvent> =>
  keptRecords(storage, WORK_SPANS_KEY, (value) => {
    const parsed = z.array(SpanEventSchema).safeParse(value)
    return parsed.success ? parsed.data : null
  })

/** A span's start as it is kept. */
export const startOf = (span: OpenSpan): SpanStart => ({
  kind: "start",
  id: span.id,
  at: new Date(span.startedAt).toISOString(),
  week: span.where.week,
  ticket: span.where.ticket,
  step: span.where.step,
  exercise: span.where.exercise,
  points: span.where.points,
  device: span.device,
})

/** A span's close as it is kept. */
export const closeOf = (closed: ClosedSpan): SpanClose => ({
  kind: "close",
  id: closed.span.id,
  at: new Date(closed.stoppedAt).toISOString(),
  stoppedBy: closed.stoppedBy,
  answer: closed.answer,
  countedSeconds: closed.countedSeconds,
})

/** The span a start opened, or null for one that can't open (no points). */
export function spanOfStart(start: SpanStart): OpenSpan | null {
  const [first, ...rest] = start.points
  const startedAt = Date.parse(start.at)
  if (first === undefined || Number.isNaN(startedAt)) return null
  return {
    id: start.id,
    startedAt,
    device: start.device,
    where: {
      week: start.week,
      ticket: start.ticket,
      step: start.step,
      exercise: start.exercise,
      points: [first, ...rest],
    },
  }
}

/** An event's body as it goes home: the event as kept, without its kind. */
export function wireOf(event: SpanEvent): Record<string, unknown> {
  const { kind: _kind, ...wire } = event
  return wire
}

/** How one event is known: `<id>/<kind>`. */
export const eventKey = (event: SpanEvent): string =>
  `${event.id}/${event.kind}`

/**
 * The span open on this phone's own record: the last start kept with no
 * close, unless home refused it for good (`refused`, by `eventKey`).
 */
export function openOnPhone(
  events: ReadonlyArray<SpanEvent>,
  refused: (key: string) => boolean = () => false
): OpenSpan | null {
  const closed = new Set(
    events.filter((each) => each.kind === "close").map((each) => each.id)
  )
  const start = events
    .filter((each): each is SpanStart => each.kind === "start")
    .at(-1)
  if (start === undefined || closed.has(start.id)) return null
  if (refused(eventKey(start))) return null
  return spanOfStart(start)
}

/** What home has said of each event this phone sent. */
export type EventAtHome = "held" | "refused" | "waiting"

/**
 * The events still to go home, in the order they were kept. A close waits
 * for its start to be held, and goes with it refused for good: home holds
 * no start for it to close.
 */
export function spanEventsGoing(
  events: ReadonlyArray<SpanEvent>,
  atHome: (key: string) => EventAtHome
): ReadonlyArray<SpanEvent> {
  const startsHere = new Set(
    events.filter((each) => each.kind === "start").map((each) => each.id)
  )
  return events.filter((event) => {
    if (atHome(eventKey(event)) !== "waiting") return false
    if (event.kind === "start" || !startsHere.has(event.id)) return true
    return atHome(`${event.id}/start`) === "held"
  })
}
