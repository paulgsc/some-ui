/**
 * A teleprompter read's cue (IW5, #2936 "Added 2026-11-13"): the card's script
 * shows, the read's take button starts a short countdown, and the take starts
 * when it ends, the script still on screen. Pure: `./runtime` owns the clock.
 *
 * The countdown is `CUE_SECONDS` long (C397). Anything else done on the screen
 * while it runs (a tap on it again, a swipe, the screen hidden) calls it off,
 * and nothing records.
 */
import { assertNever } from "@some-ui/core-utils"

/** How long the cue counts down before a read records, in seconds (C397). */
export const CUE_SECONDS = 3

export type Cue =
  | { readonly kind: "idle" }
  /** Counting down to `item`'s take: `left` seconds to go. */
  | { readonly kind: "counting"; readonly item: string; readonly left: number }

export const NO_CUE: Cue = { kind: "idle" }

export type CueEvent =
  | { readonly type: "start"; readonly item: string }
  /** A second passed. */
  | { readonly type: "tick" }
  | { readonly type: "cancel" }

/** The cue after `event`, and the item whose take starts now, if one does. */
export function stepCue(
  cue: Cue,
  event: CueEvent
): { readonly cue: Cue; readonly go: string | null } {
  switch (event.type) {
    case "start": {
      return {
        cue: { kind: "counting", item: event.item, left: CUE_SECONDS },
        go: null,
      }
    }
    case "tick": {
      if (cue.kind === "idle") return { cue, go: null }
      return cue.left <= 1
        ? { cue: NO_CUE, go: cue.item }
        : { cue: { ...cue, left: cue.left - 1 }, go: null }
    }
    case "cancel": {
      return { cue: NO_CUE, go: null }
    }
    default: {
      return assertNever(event)
    }
  }
}
