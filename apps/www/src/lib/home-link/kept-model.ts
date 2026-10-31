/**
 * A record this phone drains to home (aph, the Jobs record, Practice, voice
 * notes; LA15, docs/learner-data-authority.md) as one state: whether a run
 * is under way, whether another was asked for while it ran, and how the
 * last one ended. `step` is pure; `./kept-runtime` runs the work and feeds
 * its end back in.
 *
 * One run at a time, by structure: asking while one runs only marks that
 * another is wanted once it ends, so a burst of edits is one more run, not
 * one each.
 */
import type { HomeExchanged } from "@some-ui/core-utils"
import { assertNever } from "@some-ui/core-utils"

/** How one run ended: as its exchange did, or before one could. */
export type KeptRun =
  | Exclude<HomeExchanged, { kind: "synced" }>
  | { readonly kind: "synced"; readonly at: number }
  /** Home did not answer: what is waiting stays on this phone. */
  | { readonly kind: "unreachable"; readonly at: number }
  /** Stopped (Stop, or the app went to the background) part way. */
  | { readonly kind: "stopped" }
  /** The link was doing something else (a tap in Settings). */
  | { readonly kind: "busy" }
  | { readonly kind: "unpaired" }

export type KeptState = {
  readonly running: boolean
  /** Asked for again while running: one more run once this one ends. */
  readonly again: boolean
  readonly last: KeptRun | null
}

export type KeptEvent =
  | { readonly type: "wanted" }
  | { readonly type: "ran"; readonly run: KeptRun }

export const INITIAL_KEPT: KeptState = {
  running: false,
  again: false,
  last: null,
}

export function stepKept(state: KeptState, event: KeptEvent): KeptState {
  switch (event.type) {
    case "wanted": {
      if (state.running) return state.again ? state : { ...state, again: true }
      return { ...state, running: true }
    }
    case "ran": {
      if (!state.running) return state
      // A run asked for again goes on only after one that reached home: one
      // that could not would only fail the same way, and the next ask (an
      // edit, the app coming back, the network) tries again. One the link
      // turned away before sending anything goes on too: what asked again
      // while it ran (the phone found paired, the link freed) is what it
      // waited for, and nothing else would ask.
      const turnedAway =
        event.run.kind === "busy" || event.run.kind === "unpaired"
      const goOn = state.again && (event.run.kind === "synced" || turnedAway)
      return { running: goOn, again: false, last: event.run }
    }
    default: {
      return assertNever(event)
    }
  }
}
