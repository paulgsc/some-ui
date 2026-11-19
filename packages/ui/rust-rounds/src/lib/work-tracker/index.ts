/**
 * The work tracker (RR26, paulgsc/some-ui#3250): time the owner puts into a
 * week away from the phone, at the scratchpad or with a chatbot. The owner
 * starts it on the phone; it stops itself after `CAP_MS`; when they come
 * back, they say how much of the span was work: all of it, part of it, or
 * none. Home keeps each span, append-only (C675, C679).
 *
 * `stepTracker` is the pure step. A runtime owns the clock, the phone's
 * store and home, and feeds it events. Rules that hold by structure:
 *
 * - **One span open at a time.** `start` is refused while one is open,
 *   here and on home; a span home reports open (a reload, or another
 *   device) is taken up as this device's own (`homeSays`), never a second.
 * - **Nothing counted beyond the span.** The span ends when the owner comes
 *   back or at `CAP_MS`, whichever is first, and what is counted is clamped
 *   to it: `all` is the whole span, `none` is nothing.
 * - **A span is never dropped unanswered.** `keeping` holds the answer
 *   until home says it is kept; if it isn't, the question comes back, and
 *   the screen says the answer wasn't kept.
 * - **Home is the authority on what is open.** The runtime sends
 *   `homeSays` only once home has acknowledged every `start` it sent, so
 *   "nothing open" means the span was answered, here or on another device.
 * - **Every record names its points** (C679): a span carries the ticket,
 *   the step, the exercise if any, and the speak-to points of the screen it
 *   was started from.
 */
import { assertNever } from "@some-ui/core-utils"

/** The tracker stops itself after this long (C675). */
export const CAP_MS = 2 * 60 * 60 * 1000

type WorkStep = "read" | "academy" | "voice"

/** Where a span was started: what it counts toward. */
type SpanWhere = {
  readonly week: string
  readonly ticket: string
  readonly step: WorkStep
  /** The exercise, 1-based, when started from one; null otherwise. */
  readonly exercise: number | null
  /** The speak-to points it counts toward, 1-based; never empty. */
  readonly points: readonly [number, ...Array<number>]
}

export type OpenSpan = {
  readonly id: string
  readonly where: SpanWhere
  /** Epoch milliseconds. */
  readonly startedAt: number
  /** Which device started it, as the owner names it. */
  readonly device: string
}

type Answer =
  | { readonly kind: "all" }
  | { readonly kind: "part"; readonly minutes: number }
  | { readonly kind: "none" }

/** A span as home keeps it once it is answered. */
type ClosedSpan = {
  readonly span: OpenSpan
  /** Epoch milliseconds: when the owner came back, or the cap. */
  readonly stoppedAt: number
  readonly stoppedBy: "you" | "itself"
  readonly answer: Answer["kind"]
  readonly countedSeconds: number
}

export type TrackerState =
  /** Home hasn't said yet whether a span is open. */
  | { readonly kind: "unknown" }
  | { readonly kind: "idle" }
  | { readonly kind: "running"; readonly span: OpenSpan }
  /** Stopped, by the owner or by the cap; waiting for their word. */
  | {
      readonly kind: "asking"
      readonly span: OpenSpan
      readonly stoppedAt: number
      readonly stoppedBy: "you" | "itself"
      /** True when the last answer couldn't be kept. */
      readonly notKept: boolean
    }
  /** Answered; waiting for home to keep it. */
  | { readonly kind: "keeping"; readonly closed: ClosedSpan }

export type TrackerEvent =
  /** What home holds open, read at opening, on return and after a refusal. */
  | {
      readonly type: "homeSays"
      readonly open: OpenSpan | null
      readonly at: number
    }
  | { readonly type: "start"; readonly span: OpenSpan }
  /** The owner tapped "I'm back". */
  | { readonly type: "back"; readonly at: number }
  /** The app was opened or came to the front. */
  | { readonly type: "seen"; readonly at: number }
  | { readonly type: "answer"; readonly answer: Answer }
  | { readonly type: "kept"; readonly kept: boolean }

export type TrackerEffect =
  | { readonly type: "start"; readonly span: OpenSpan }
  | { readonly type: "close"; readonly closed: ClosedSpan }
  /** Something worth a Notice: what was counted. */
  | { readonly type: "counted"; readonly closed: ClosedSpan }

export type TrackerStep = {
  readonly state: TrackerState
  readonly effects: ReadonlyArray<TrackerEffect>
}

const same = (state: TrackerState): TrackerStep => ({ state, effects: [] })

/** The span's length in whole seconds, from its start to `stoppedAt`. */
export const spanSeconds = (span: OpenSpan, stoppedAt: number): number =>
  Math.max(0, Math.floor((stoppedAt - span.startedAt) / 1000))

/** What an answer counts, clamped to the span. */
function countedSeconds(answer: Answer, spanned: number): number {
  switch (answer.kind) {
    case "all": {
      return spanned
    }
    case "none": {
      return 0
    }
    case "part": {
      // Minutes that aren't a number count as none.
      const minutes = Number.isFinite(answer.minutes) ? answer.minutes : 0
      const asked = Math.floor(minutes) * 60
      return Math.min(spanned, Math.max(0, asked))
    }
    default: {
      return assertNever(answer)
    }
  }
}

/** A running span as it stands at `at`: still running, or stopped by the cap. */
function standing(span: OpenSpan, at: number): TrackerState {
  const cap = span.startedAt + CAP_MS
  return at >= cap
    ? {
        kind: "asking",
        span,
        stoppedAt: cap,
        stoppedBy: "itself",
        notKept: false,
      }
    : { kind: "running", span }
}

export function stepTracker(
  state: TrackerState,
  event: TrackerEvent
): TrackerStep {
  switch (event.type) {
    case "homeSays": {
      // An answer on its way, or a question already up, stands: home will
      // hear it, and the span it names is the one home holds open.
      if (state.kind === "keeping") return same(state)
      // Nothing open: the span was answered, here or on another device.
      if (event.open === null) return same({ kind: "idle" })
      if (state.kind === "asking" && state.span.id === event.open.id) {
        return same(state)
      }
      return same(standing(event.open, event.at))
    }
    case "start": {
      if (state.kind !== "idle") return same(state)
      return {
        state: { kind: "running", span: event.span },
        effects: [{ type: "start", span: event.span }],
      }
    }
    case "seen": {
      return state.kind === "running"
        ? same(standing(state.span, event.at))
        : same(state)
    }
    case "back": {
      if (state.kind !== "running") return same(state)
      const capped = standing(state.span, event.at)
      if (capped.kind === "asking") return same(capped)
      return same({
        kind: "asking",
        span: state.span,
        stoppedAt: event.at,
        stoppedBy: "you",
        notKept: false,
      })
    }
    case "answer": {
      if (state.kind !== "asking") return same(state)
      const closed: ClosedSpan = {
        span: state.span,
        stoppedAt: state.stoppedAt,
        stoppedBy: state.stoppedBy,
        answer: event.answer.kind,
        countedSeconds: countedSeconds(
          event.answer,
          spanSeconds(state.span, state.stoppedAt)
        ),
      }
      return {
        state: { kind: "keeping", closed },
        effects: [{ type: "close", closed }],
      }
    }
    case "kept": {
      if (state.kind !== "keeping") return same(state)
      const { closed } = state
      return event.kept
        ? {
            state: { kind: "idle" },
            effects: [{ type: "counted", closed }],
          }
        : same({
            kind: "asking",
            span: closed.span,
            stoppedAt: closed.stoppedAt,
            stoppedBy: closed.stoppedBy,
            notKept: true,
          })
    }
    default: {
      return assertNever(event)
    }
  }
}
