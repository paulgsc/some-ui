/**
 * Running a render again from Studio › Renders (RETRY, the owner on
 * 2026-11-22: "it exposes in an ergonomic UI affordance the steps necessary
 * within what is controllable from the UI"). Pure, so every reading is held
 * by a test; what the screen says of it is `./words`.
 *
 * **One family.** Every row under "Couldn't finish", whatever made it (the
 * call's weeks, Playoff Delta, the Rust Rounds and interview essays, a cards
 * essay, an engagement report, a clip's walk, a template's preview), stopped
 * for one of the reasons `Stop` names, read from what home's board records
 * of it (`../model`'s `RenderFailed`): its failed attempt, the render
 * policy's refusal, or home's own refusal of what an essay plays or shows
 * (paulgsc/server `essay_media`). Each reason maps to the owner's steps
 * (`planOf`): run it again now, the takes it waits on, or what has to change
 * somewhere other than this phone. A kind home adds later reads as `burnt`'s
 * sibling `unknown`, never as a row that can be run.
 */
import { assertNever, readAs } from "@some-ui/core-utils"
import type { HomeAnswer } from "@some-ui/core-utils"
import type { AttentionRead } from "@some-ui/soundbites"
import { z } from "zod"

import type { Board, Refusal, RenderFailed } from "@/lib/renders/model"
import { refusalOf } from "@/lib/renders/model"

/** Why a row couldn't finish. */
export type Stop =
  /**
   * Its attempt failed (the recorder, or home keeping its files): home
   * tries it again by itself an hour after, and it can be sent back in line
   * now.
   */
  | { readonly kind: "burnt"; readonly by: "recorder" | "home" }
  /**
   * Home couldn't make out recordings the essay plays (`take-unheard`), by
   * id where home names them; none named, from a home before it did.
   */
  | { readonly kind: "takes-unheard"; readonly takes: ReadonlyArray<string> }
  /** The render policy refused it: too long, too large, spilled over. */
  | { readonly kind: "policy"; readonly refusal: Refusal }
  /** The essay names a recording or a clip home doesn't keep. */
  | { readonly kind: "missing"; readonly what: "take" | "clip" }
  /** A picture of the app home couldn't get; `gone` once GitHub lost it. */
  | { readonly kind: "snips"; readonly gone: boolean }
  /** A template's preview: the owner asks for another on its page. */
  | { readonly kind: "preview" }

/** Home's refusals of what an essay plays or shows, by its word for each. */
const ESSAY_REFUSALS = {
  "take-unheard": "takes-unheard",
  "take-missing": "missing-take",
  "clip-missing": "missing-clip",
  "snip-missing": "snips",
  "snip-gone": "snips-gone",
} as const

type EssayRefusal = keyof typeof ESSAY_REFUSALS

const isEssayRefusal = (reason: string): reason is EssayRefusal =>
  Object.hasOwn(ESSAY_REFUSALS, reason)

/** Why `failed` couldn't finish, from what home's board says of it. */
export function stopOf(failed: RenderFailed): Stop {
  if (failed.feed === "preview") return { kind: "preview" }
  const refusal = refusalOf(failed)
  if (refusal !== null) return { kind: "policy", refusal }
  const reason = failed.reason
  if (reason !== undefined && isEssayRefusal(reason)) {
    const read = ESSAY_REFUSALS[reason]
    switch (read) {
      case "takes-unheard": {
        return { kind: "takes-unheard", takes: failed.items ?? [] }
      }
      case "missing-take": {
        return { kind: "missing", what: "take" }
      }
      case "missing-clip": {
        return { kind: "missing", what: "clip" }
      }
      case "snips": {
        return { kind: "snips", gone: false }
      }
      case "snips-gone": {
        return { kind: "snips", gone: true }
      }
      default: {
        return assertNever(read)
      }
    }
  }
  return { kind: "burnt", by: failed.by }
}

/**
 * The owner's way to run it again, and what stands in the way: the takes
 * still waiting on them, or a change made elsewhere.
 */
export type Plan =
  /** Nothing waits on the owner: it can go back in line now. */
  | { readonly kind: "ready" }
  /**
   * Recordings home couldn't hear, each still to be asked again or recorded
   * again (`waiting`), of those the essay plays (`takes`; empty where home
   * named none, and then `waiting` is every take needing attention). `read`
   * says whether the takes needing attention were read: until they are,
   * every take the essay names counts as waiting.
   */
  | {
      readonly kind: "takes"
      readonly takes: ReadonlyArray<string>
      readonly waiting: ReadonlyArray<string>
      readonly read: boolean
    }
  /** What stops it changes somewhere other than this phone. */
  | { readonly kind: "elsewhere" }
  /**
   * Home tries it again by itself within the hour, and makes no other on
   * ask: a clip's walk, or a kind this phone doesn't know.
   */
  | { readonly kind: "byItself" }
  /** A preview is asked for again on its template's page. */
  | { readonly kind: "preview" }

/**
 * The feeds whose episodes home makes again on ask (paulgsc/server
 * `routes::feed_videos`' produce): every feed but none of the board's own
 * rows (a preview, a clip's walk).
 */
const PRODUCES = [
  "call",
  "playoff-delta",
  "rust-essay",
  "interview-essay",
  "cards-essay",
  "report",
] as const

export const produces = (feed: string): boolean =>
  PRODUCES.some((each) => each === feed)

/**
 * What the takes needing attention hold, as the Run it again page read them:
 * the ids still waiting on the owner, or not read yet.
 */
export type Attention =
  | { readonly kind: "read"; readonly waiting: ReadonlySet<string> }
  | { readonly kind: "unread" }

/**
 * What a read of the takes needing attention says for the plan: the ids of
 * those still waiting on the owner. A take home is hearing again stays on
 * that list (#3339) and waits on no one, so it isn't among them. Any read
 * that isn't one reads as unread, and so does a list home cut short (more
 * wait than it lists), so a take past the cut never counts as answered.
 */
export function attentionOf(read: AttentionRead): Attention {
  if (read.kind !== "read" || read.page.total > read.page.takes.length)
    return { kind: "unread" }
  return {
    kind: "read",
    waiting: new Set(
      read.page.takes
        .filter(({ hearAgain }) => hearAgain?.hearing !== true)
        .map(({ id }) => id)
    ),
  }
}

/** The takes of `takes` still waiting on the owner, given `attention`. */
function stillWaiting(
  takes: ReadonlyArray<string>,
  attention: Attention
): ReadonlyArray<string> {
  if (attention.kind === "unread") return takes
  // Home named none: whatever needs attention may be one of them.
  if (takes.length === 0) return [...attention.waiting]
  return takes.filter((take) => attention.waiting.has(take))
}

/**
 * The plan for `stop` on a row of `feed`, given the takes still needing
 * attention.
 */
export function planOf(stop: Stop, attention: Attention, feed: string): Plan {
  switch (stop.kind) {
    case "burnt": {
      return produces(feed) ? { kind: "ready" } : { kind: "byItself" }
    }
    case "takes-unheard": {
      return {
        kind: "takes",
        takes: stop.takes,
        waiting: stillWaiting(stop.takes, attention),
        read: attention.kind === "read",
      }
    }
    case "policy":
    case "missing":
    case "snips": {
      return { kind: "elsewhere" }
    }
    case "preview": {
      return { kind: "preview" }
    }
    default: {
      return assertNever(stop)
    }
  }
}

/**
 * Whether `plan` lets the owner send it back in line now: never on a guess
 * (takes not read yet). Home refuses a run it can't take anyway
 * (`AgainAnswer`'s `takes` and `elsewhere`).
 */
export function canRun(plan: Plan): boolean {
  switch (plan.kind) {
    case "ready": {
      return true
    }
    case "takes": {
      return plan.read && plan.waiting.length === 0
    }
    case "elsewhere":
    case "byItself":
    case "preview": {
      return false
    }
    default: {
      return assertNever(plan)
    }
  }
}

/**
 * Where a run again stands, as home's answer to
 * `POST /feeds/:feed/videos/:key/produce {"asset":"video"}` and its
 * episode lists say it (paulgsc/server `routes::feed_videos`, REDO-S; the
 * same Step Studio's Generate reads for an episode's other files). Times are
 * Unix seconds; home keeps only those of a step in flight, so a later read
 * may drop one an earlier said (`follow` keeps it).
 */
type StepState =
  | "missing"
  | "asked"
  | "waiting"
  | "rendering"
  | "done"
  | "failed"
  | "blocked"

export type Step = {
  readonly state: StepState
  readonly askedAt: number | null
  readonly startedAt: number | null
  readonly endedAt: number | null
  /** Why it failed or is blocked, as home's short class; null for none. */
  readonly reason: string | null
  /** What a refusal names, by id: a cards essay's takes. */
  readonly items: ReadonlyArray<string>
}

/** A time home names: Unix seconds, or an ISO time read as them. */
const TimeSchema = z
  .union([
    z.number().int().nonnegative(),
    z.iso
      .datetime({ offset: true })
      .transform((at) => Math.floor(Date.parse(at) / 1000)),
  ])
  .optional()
  .catch(undefined)
  .transform((at) => at ?? null)

const StepSchema = z
  .object({
    state: z.enum([
      "missing",
      "asked",
      "waiting",
      "rendering",
      "done",
      "failed",
      "blocked",
    ]),
    askedAt: TimeSchema,
    startedAt: TimeSchema,
    endedAt: TimeSchema,
    reason: z.string().min(1).max(64).optional().catch(undefined),
    items: z.array(z.string().min(1)).optional().catch(undefined),
  })
  .transform(
    (step): Step => ({
      state: step.state,
      askedAt: step.askedAt,
      startedAt: step.startedAt,
      endedAt: step.endedAt,
      reason: step.reason ?? null,
      items: step.items ?? [],
    })
  )

/** Home's answer to a run again, as the screen means it. */
export type AgainAnswer =
  /** Where it stands now: asked, waiting, rendering, done, or stopped. */
  | { readonly kind: "step"; readonly step: Step }
  /**
   * Home holds no such episode, or is from before it could run one again:
   * both answer the same.
   */
  | { readonly kind: "notHere" }
  | { readonly kind: "unreadable" }

/** What home's answer to a run again says. */
export function readAgain(answer: HomeAnswer): AgainAnswer {
  if (answer.status === 404 || answer.status === 405) return { kind: "notHere" }
  if (answer.status !== 200 && answer.status !== 202 && answer.status !== 409)
    return { kind: "unreadable" }
  const step = readAs(StepSchema, answer.body)
  return step === null ? { kind: "unreadable" } : { kind: "step", step }
}

/** How far apart home's clock and the phone's may be, in seconds. */
const SKEW = 120

/**
 * How long the page follows a run before it stops reading on its own: a
 * render takes well under this, and a pull or Try again reads again.
 */
export const FOLLOW_FOR = 2 * 60 * 60

/** Whether `step` is over: nothing more moves it without another tap. */
export const settled = (step: Step): boolean =>
  step.state === "done" ||
  step.state === "failed" ||
  step.state === "blocked" ||
  step.state === "missing"

/**
 * Where a step stands once the board is read again: the board says where
 * the row is now (made, under way, waiting, or stopped again), and every time
 * home said before is kept, since home keeps only a step in flight's.
 * What the board lists from before the run started (`askedAt`, else
 * `tappedAt`, when the owner tapped) is the run it ran again, and moves
 * nothing.
 */
export function follow(
  step: Step,
  board: Board,
  feed: string,
  key: string,
  tappedAt: number,
  stoppedAt?: number
): Step {
  const named = (row: { feed: string; key: string }): boolean =>
    row.feed === feed && row.key === key
  // What the board lists from before the run started is the run it ran
  // again; only what is later is this run's. Without home's own time, the
  // phone's tap is read with `SKEW` to spare, since the two clocks differ.
  const from = step.askedAt ?? tappedAt - SKEW
  const done = board.done.find((row) => named(row) && row.at >= from)
  if (done !== undefined)
    return { ...step, state: "done", endedAt: step.endedAt ?? done.at }
  if (board.now !== null && named(board.now)) {
    const rendering = board.now.state !== "waiting"
    return {
      ...step,
      state: rendering ? "rendering" : "waiting",
      startedAt: rendering
        ? (step.startedAt ?? board.now.stateSince)
        : step.startedAt,
    }
  }
  if (board.waiting.some(named))
    return step.state === "asked" ? { ...step, state: "waiting" } : step
  const failed = board.failed.find(named)
  // Never the failure the tap ran again, however close the two clocks.
  if (failed !== undefined && failed.at > from && failed.at !== stoppedAt)
    return {
      ...step,
      state: failed.reason === undefined ? "failed" : "blocked",
      endedAt: failed.at,
      reason: failed.reason ?? null,
      items: failed.items ?? [],
    }
  return step
}
