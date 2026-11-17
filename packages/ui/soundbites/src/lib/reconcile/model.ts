/**
 * The takes needing attention (HEARD3, #3075; epic #3070): every take home
 * couldn't hear well (paulgsc/server `GET /voice-notes/attention`), each
 * under the codes home judged it by (`./codes`), with Play, and the owner's
 * act on it: keep it, record it again, or delete it (My data's delete path,
 * which the build hands in). One state machine: `stepReconcile(state,
 * event)` returns the next state and the effects to run and does nothing
 * else; `./runtime` runs them, and the component renders a state and turns
 * taps into events.
 *
 * Rules that hold by structure:
 *
 * - **A read answers only the read asked last,** and a play only the play
 *   asked last (`../library/play`).
 * - **One act at a time.** While home is told of one, no other is sent, so
 *   two taps can't race; its answer counts only for the act asked last.
 * - **A take leaves the list only once home kept the act,** said it has
 *   nothing left to reconcile on it, or answered its delete with a receipt:
 *   an act home didn't take leaves the take where it was, and says so. What plays stops when its take leaves.
 */
import { assertNever } from "@some-ui/core-utils"
import type { PlayEffect, PlaySlice } from "@soundbites/lib/library/play"
import {
  audioRead,
  played,
  playEnded,
  QUIET,
  stopped,
} from "@soundbites/lib/library/play"

import type { TakeVerdict } from "./codes"

/** One take home couldn't hear well, as home lists it. */
export type AttentionTake = {
  readonly id: string
  /** What kind of take it is, as home names it (`rust-round`, `studio`). */
  readonly of: string
  /** What the take is for, as the phone named it when it went home. */
  readonly ref: string
  readonly recordedAt: string
  /** The words home heard, when it heard any; null when none. */
  readonly heard: string | null
  readonly verdict: TakeVerdict
}

export type AttentionPage = {
  readonly takes: ReadonlyArray<AttentionTake>
  /** How many takes wait on the owner, listed or not. */
  readonly total: number
}

/** How a read of home went. */
export type AttentionRead =
  | { readonly kind: "read"; readonly page: AttentionPage }
  /** This phone isn't paired with home: nothing was asked. */
  | { readonly kind: "unpaired" }
  /** Home didn't answer. */
  | { readonly kind: "away" }
  /** This phone stayed busy with home, so nothing was asked. */
  | { readonly kind: "busy" }
  /** Home answered, but doesn't judge what it hears yet. */
  | { readonly kind: "older" }
  /** Home answered with something this phone can't read. */
  | { readonly kind: "unreadable" }

/** What the owner can do with a take, besides delete it. */
export type ReconcileAct = "keep" | "again"

/** What came of telling home of an act. */
export type ActAnswer =
  /** Home kept it: the take is answered. */
  | "kept"
  /** Home has nothing left to reconcile on it (judged heard, or gone). */
  | "settled"
  /** Home didn't take it, or didn't answer: nothing changed. */
  | "notTaken"
  /** This phone stayed busy with home, so home wasn't told: nothing changed. */
  | "busy"

export type ReconcileState = PlaySlice & {
  readonly read: { readonly kind: "reading" } | AttentionRead
  readonly seq: number
  /** The act home is being told of; null while none is. */
  readonly acting: {
    readonly id: string
    readonly act: ReconcileAct
  } | null
  /** Each act's number: an answer to an earlier one changes nothing. */
  readonly acts: number
  /** What the screen says of the last act: kept, or not taken. */
  readonly said:
    | { readonly kind: "kept"; readonly act: ReconcileAct }
    | { readonly kind: "settled" }
    | { readonly kind: "notTaken"; readonly id: string }
    | { readonly kind: "busy"; readonly id: string }
    | null
}

export type ReconcileIntent =
  | { readonly type: "readAgain" }
  | { readonly type: "play"; readonly id: string }
  /** What plays stops: its row is about to leave the screen (a chip). */
  | { readonly type: "stop" }
  | { readonly type: "act"; readonly id: string; readonly act: ReconcileAct }
  /** The person closed what the screen said of the last act. */
  | { readonly type: "noticeDismissed" }
  /** The person closed "home can't give that take back". */
  | { readonly type: "unplayableDismissed" }

export type ReconcileEvent =
  | ReconcileIntent
  | { readonly type: "entered" }
  | { readonly type: "left" }
  | {
      readonly type: "takesRead"
      readonly seq: number
      readonly read: AttentionRead
    }
  | {
      readonly type: "audioRead"
      readonly play: number
      readonly audio: Blob | null
    }
  | { readonly type: "playEnded"; readonly play: number }
  | {
      readonly type: "actAnswered"
      readonly seq: number
      readonly answer: ActAnswer
    }
  /** My data's delete path deleted these for good, with a receipt each. */
  | { readonly type: "deleted"; readonly ids: ReadonlyArray<string> }

export type ReconcileEffect =
  | { readonly type: "readTakes"; readonly seq: number }
  | PlayEffect
  | {
      readonly type: "sendAct"
      readonly seq: number
      readonly id: string
      readonly act: ReconcileAct
    }

export type ReconcileStep = {
  readonly state: ReconcileState
  readonly effects: ReadonlyArray<ReconcileEffect>
}

export const INITIAL_RECONCILE: ReconcileState = {
  read: { kind: "reading" },
  seq: 0,
  ...QUIET,
  acting: null,
  acts: 0,
  said: null,
}

const same = (state: ReconcileState): ReconcileStep => ({
  state,
  effects: [],
})

function readTakes(state: ReconcileState): ReconcileStep {
  const stop = stopped(state)
  const seq = stop.state.seq + 1
  return {
    state: { ...stop.state, seq, read: { kind: "reading" } },
    effects: [...stop.effects, { type: "readTakes", seq }],
  }
}

/** The list without `ids`, what plays stopped if its take went. */
function without(
  state: ReconcileState,
  ids: ReadonlySet<string>
): ReconcileStep {
  const { read, playback } = state
  if (read.kind !== "read") return same(state)
  const takes = read.page.takes.filter(({ id }) => !ids.has(id))
  const gone = read.page.takes.length - takes.length
  if (gone === 0) return same(state)
  const page = { takes, total: Math.max(0, read.page.total - gone) }
  const next = { ...state, read: { kind: "read", page } } as const
  return playback.kind !== "quiet" && ids.has(playback.id)
    ? stopped(next)
    : same(next)
}

export function stepReconcile(
  state: ReconcileState,
  event: ReconcileEvent
): ReconcileStep {
  switch (event.type) {
    case "entered":
    case "readAgain": {
      return readTakes(state)
    }
    case "left":
    case "stop": {
      return stopped(state)
    }
    case "takesRead": {
      if (event.seq !== state.seq) return same(state)
      return same({ ...state, read: event.read })
    }
    case "play": {
      return played(state, event.id)
    }
    case "audioRead": {
      return audioRead(state, event.play, event.audio)
    }
    case "playEnded": {
      return playEnded(state, event.play)
    }
    case "act": {
      if (state.acting !== null) return same(state)
      const listed =
        state.read.kind === "read" &&
        state.read.page.takes.some(({ id }) => id === event.id)
      if (!listed) return same(state)
      const seq = state.acts + 1
      return {
        state: {
          ...state,
          acts: seq,
          acting: { id: event.id, act: event.act },
          said: null,
        },
        effects: [{ type: "sendAct", seq, id: event.id, act: event.act }],
      }
    }
    case "actAnswered": {
      const { acting } = state
      if (event.seq !== state.acts || acting === null) return same(state)
      const done = { ...state, acting: null }
      if (event.answer === "notTaken" || event.answer === "busy") {
        return same({ ...done, said: { kind: event.answer, id: acting.id } })
      }
      const said =
        event.answer === "settled"
          ? ({ kind: "settled" } as const)
          : ({ kind: "kept", act: acting.act } as const)
      return without({ ...done, said }, new Set([acting.id]))
    }
    case "deleted": {
      return without(state, new Set(event.ids))
    }
    case "noticeDismissed": {
      return same({ ...state, said: null })
    }
    case "unplayableDismissed": {
      return same({ ...state, unplayable: null })
    }
    default: {
      return assertNever(event)
    }
  }
}
