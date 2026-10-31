/**
 * Korean's look at what the reflections routine left on the paired home
 * (`./routine`): the one read at a time, and what it last answered. Pure;
 * `./routine` runs it.
 *
 * What home answered is held in memory only, for the pairing it was read
 * under (`Under`, the pairing's id): an unpairing or a new pairing leaves
 * nothing of it to show.
 */
import { assertNever } from "@some-ui/core-utils"

/** The pairing a read is made under: its id. */
export type Under = string

/** How the last read ended, and when. */
export type LastRead = {
  readonly kind: "read" | "busy" | "unreachable" | "forgotten" | "failed"
  readonly at: number
}

export type ReadState = {
  /** Home's last answer, as it came, for the pairing it was read under. */
  readonly answer: { readonly under: Under; readonly files: unknown } | null
  /** A read is on its way. */
  readonly reading: boolean
  readonly last: LastRead | null
}

export const INITIAL_READ: ReadState = {
  answer: null,
  reading: false,
  last: null,
}

export type ReadEvent =
  | { readonly type: "started" }
  /** Home answered, under `under`, which the phone still holds. */
  | {
      readonly type: "answered"
      readonly under: Under
      readonly files: unknown
      readonly at: number
    }
  | {
      readonly type: "ended"
      readonly kind: Exclude<LastRead["kind"], "read">
      readonly at: number
    }
  /** The read ended with nothing to keep: stopped, or no longer paired so. */
  | { readonly type: "dropped" }
  /** What was read is no longer this phone's pairing: unpaired or paired anew. */
  | { readonly type: "cleared" }

/**
 * Whether a read may start now: paired, with the app in front, and none on
 * its way.
 */
export function mayRead(
  state: ReadState,
  facts: { readonly under: Under | null; readonly visible: boolean }
): boolean {
  return facts.under !== null && facts.visible && !state.reading
}

/** What may be shown under `under`: the last answer read under it, or none. */
export function heldFor(state: ReadState, under: Under | null): unknown {
  return state.answer !== null && under !== null && state.answer.under === under
    ? state.answer.files
    : null
}

export function stepRead(state: ReadState, event: ReadEvent): ReadState {
  switch (event.type) {
    case "started": {
      return state.reading ? state : { ...state, reading: true }
    }
    case "answered": {
      if (!state.reading) return state
      return {
        answer: { under: event.under, files: event.files },
        reading: false,
        last: { kind: "read", at: event.at },
      }
    }
    case "ended": {
      if (!state.reading) return state
      return {
        ...state,
        reading: false,
        last: { kind: event.kind, at: event.at },
      }
    }
    case "dropped": {
      return state.reading ? { ...state, reading: false } : state
    }
    case "cleared": {
      if (state.answer === null && state.last === null) return state
      return { ...state, answer: null, last: null }
    }
    default: {
      return assertNever(event)
    }
  }
}
