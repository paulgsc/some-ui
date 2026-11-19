/**
 * The tracker's exchange with home (RR26, paulgsc/some-ui#3250;
 * paulgsc/server#1008): each event of this phone's record (`./record`) that
 * home doesn't hold yet goes as `POST /rust-work-spans/start` or `/close`,
 * then each week asked for is read with `GET /rust-work-spans?week=`.
 *
 * This is the one place home's answers about spans are read (LAYERS): every
 * answer becomes a `SpanSaid`, and nothing past this module reads a status.
 *
 * - **Held** once home's answer carries the event as it was sent: the same
 *   span, and for a start the same `at`, as text.
 * - **Refused for good** by a `409` with no open span in it: home holds
 *   another event under the span (another close of it), or the start is
 *   before the latest close home holds (`SPAN_OVERLAPS`). The same bytes
 *   sent again get the same answer, so they are never sent again. The
 *   event stays on this phone.
 * - **Again**, with the next run, for anything else: a start while another
 *   span is open (a `409` carrying it), a close of a start home doesn't
 *   hold yet (`404`), an `at` ahead of home's clock (`422`), a fault.
 * - **What is open** is told only once every event this phone kept is held
 *   or refused (the step's rule, `stepTracker`'s `homeSays`): until then, a
 *   start on its way would read as nothing open, and a close on its way as
 *   the span still open.
 */
import type { OpenSpan } from "@rust-rounds/lib/work-tracker"
import type {
  EventAtHome,
  SpanEvent,
} from "@rust-rounds/lib/work-tracker/record"
import {
  eventKey,
  spanOfStart,
  wireOf,
} from "@rust-rounds/lib/work-tracker/record"
import type { HomeCall, HomeExchanged } from "@some-ui/core-utils"
import { isRecord, jsonOf, readAs, unexpectedAnswer } from "@some-ui/core-utils"
import { z } from "zod"

const SPANS_PATH = "/rust-work-spans"

const ClosedSchema = z.object({
  at: z.string(),
  stoppedBy: z.enum(["you", "itself"]),
  answer: z.enum(["all", "part", "none"]),
  countedSeconds: z.number().int().nonnegative(),
  keptAt: z.string(),
})

const HomeSpanSchema = z.object({
  id: z.string(),
  week: z.string(),
  ticket: z.string(),
  step: z.enum(["read", "academy", "voice"]),
  exercise: z.number().int().positive().nullable(),
  points: z.array(z.number().int().positive()),
  device: z.string(),
  startedAt: z.string(),
  keptAt: z.string(),
  closed: ClosedSchema.nullable(),
})

/** A span as home keeps it: its start, and its close once it has one. */
export type HomeSpan = z.infer<typeof HomeSpanSchema>

const WrittenSchema = z.object({
  change: z.enum(["added", "unchanged"]),
  span: HomeSpanSchema,
})

const WeekSpansSchema = z.object({
  week: z.string(),
  spans: z.array(HomeSpanSchema),
  open: HomeSpanSchema.nullable(),
})

/** What home said of one event sent. */
export type SpanSaid = "held" | "refused" | "again"

/** The span a span home holds opened. */
const openOfHome = (span: HomeSpan): OpenSpan | null =>
  spanOfStart({ ...span, kind: "start", at: span.startedAt })

/** What home's answer to `event`, sent, says of it. */
export function spanSaid(
  event: SpanEvent,
  answer: { readonly status: number; readonly body: string }
): SpanSaid {
  if (answer.status === 200 || answer.status === 201) {
    const written = readAs(WrittenSchema, answer.body)
    if (written?.span.id !== event.id) return "again"
    if (event.kind === "start") {
      return written.span.startedAt === event.at ? "held" : "again"
    }
    return written.span.closed?.at === event.at ? "held" : "again"
  }
  if (answer.status === 409) {
    // A start while another span is open carries it: that one may close.
    const body = jsonOf(answer.body)
    return isRecord(body) && body["open"] !== undefined ? "again" : "refused"
  }
  return "again"
}

export type SpansExchanged = {
  readonly exchanged: HomeExchanged
  /** What home said of each event sent, by `eventKey`. */
  readonly said: Readonly<Record<string, SpanSaid>>
  /** Each week read, its spans as home keeps them. */
  readonly weeks: Readonly<Record<string, ReadonlyArray<HomeSpan>>>
  /**
   * The span home holds open, once nothing this phone kept waits; undefined
   * while something does or home wasn't read.
   */
  readonly open: OpenSpan | null | undefined
}

/**
 * Sends each event of `events` home doesn't hold (`atHome`, by `eventKey`),
 * then reads each of `weeks`. Throws what `send` throws when home doesn't
 * answer.
 */
export async function exchangeWorkSpans(
  send: HomeCall,
  events: ReadonlyArray<SpanEvent>,
  atHome: (key: string) => EventAtHome,
  weeks: ReadonlyArray<string>
): Promise<SpansExchanged> {
  const said: Record<string, SpanSaid> = {}
  const heard = (key: string): EventAtHome => {
    const answer = said[key]
    if (answer === "held" || answer === "refused") return answer
    return atHome(key)
  }
  // A close goes nowhere once its start is refused: it is refused with it.
  const now = (key: string): EventAtHome => {
    const [id = "", kind] = key.split("/")
    if (kind === "close" && heard(`${id}/start`) === "refused") {
      return "refused"
    }
    return heard(key)
  }
  const result = (
    exchanged: HomeExchanged,
    read: Record<string, ReadonlyArray<HomeSpan>> = {},
    open: OpenSpan | null | undefined = undefined
  ): SpansExchanged => ({ exchanged, said, weeks: read, open })
  const startsHere = new Set(
    events.filter((each) => each.kind === "start").map((each) => each.id)
  )

  // One at a time, in the order kept, so a start held in this run lets its
  // close go in the same run.
  for (const event of events) {
    if (now(eventKey(event)) !== "waiting") continue
    if (event.kind === "close" && startsHere.has(event.id)) {
      if (now(`${event.id}/start`) !== "held") continue
    }
    const answer = await send(
      "POST",
      `${SPANS_PATH}/${event.kind}`,
      JSON.stringify(wireOf(event))
    )
    if (answer.status === 401) return result({ kind: "forgotten" })
    said[eventKey(event)] = spanSaid(event, answer)
  }

  const read: Record<string, ReadonlyArray<HomeSpan>> = {}
  let open: OpenSpan | null | undefined
  for (const week of weeks) {
    const answer = await send(
      "GET",
      `${SPANS_PATH}?week=${encodeURIComponent(week)}`
    )
    if (answer.status === 401) return result({ kind: "forgotten" }, read)
    if (answer.status !== 200) {
      return result(unexpectedAnswer("the work spans", answer.status), read)
    }
    const spans = readAs(WeekSpansSchema, answer.body)
    if (spans === null) {
      return result({ kind: "failed", why: "the work spans: unreadable" }, read)
    }
    read[week] = spans.spans
    open = spans.open === null ? null : openOfHome(spans.open)
  }
  // A close on its way too: home still holds its span open.
  const waits = events.some((event) => now(eventKey(event)) === "waiting")
  return result({ kind: "synced" }, read, waits ? undefined : open)
}
