/**
 * aph's keeping on home as one state: whether a run is under way, whether
 * another was asked for while it ran, and how the last one ended. `step` is
 * pure; `./aph-runtime` runs the work and feeds its end back in.
 *
 * One run at a time, by structure: asking while one runs only marks that
 * another is wanted once it ends, so a burst of edits is one more run, not
 * one each.
 */
import { assertNever } from "@some-ui/core-utils"

/** How one run ended. */
export type AphRun =
  /** Everything sendable sent, and home's record read and shown. */
  | { readonly kind: "synced"; readonly at: number }
  /** Home did not answer: what is waiting stays on this phone. */
  | { readonly kind: "unreachable"; readonly at: number }
  /** Stopped (Stop, or the app went to the background) part way. */
  | { readonly kind: "stopped" }
  /** Home answered `401`: it no longer knows this phone. */
  | { readonly kind: "forgotten" }
  /** The link was doing something else (a tap in Settings). */
  | { readonly kind: "busy" }
  | { readonly kind: "unpaired" }
  /** Home answered something else, said in words. */
  | { readonly kind: "failed"; readonly why: string }

export type AphHomeState = {
  readonly running: boolean
  /** Asked for again while running: one more run once this one ends. */
  readonly again: boolean
  readonly last: AphRun | null
}

export type AphHomeEvent =
  | { readonly type: "wanted" }
  | { readonly type: "ran"; readonly run: AphRun }

export const INITIAL_APH: AphHomeState = {
  running: false,
  again: false,
  last: null,
}

export function stepAph(
  state: AphHomeState,
  event: AphHomeEvent
): AphHomeState {
  switch (event.type) {
    case "wanted": {
      if (state.running) return state.again ? state : { ...state, again: true }
      return { ...state, running: true }
    }
    case "ran": {
      if (!state.running) return state
      // A run asked for again goes on only after one that reached home: one
      // that could not would only fail the same way, and the next ask (an
      // edit, the app coming back, the network) tries again.
      const goOn = state.again && event.run.kind === "synced"
      return { running: goOn, again: false, last: event.run }
    }
    default: {
      return assertNever(event)
    }
  }
}
