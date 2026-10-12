/**
 * The story player as a pure state machine: which slide is showing and
 * whether it advances on its own. The component reads a snapshot and
 * dispatches events; the one timer lives in the component's effect and only
 * ever dispatches `elapsed`, so a stale timer can at worst ask to advance a
 * slide that has already moved, which `step` ignores by checking `slide`.
 * Events that move forward carry the story's length as it is now, so the
 * state never holds a copy of it.
 */

import { assertNever } from "@some-ui/intent-kit"

export type PlayerState = {
  readonly slide: number
  readonly playing: boolean
}

export type PlayerEvent =
  | { readonly type: "next"; readonly count: number }
  | { readonly type: "back" }
  | { readonly type: "toggle"; readonly count: number }
  /** The hold timer for `slide` ran out. */
  | { readonly type: "elapsed"; readonly slide: number; readonly count: number }

/** Keeps a slide index inside a story of `count` slides. */
export const clampSlide = (count: number, slide: number): number =>
  Math.max(0, Math.min(count - 1, slide))

export const initialPlayer = (count: number, slide = 0): PlayerState => ({
  slide: clampSlide(count, slide),
  playing: false,
})

export function step(s: PlayerState, e: PlayerEvent): PlayerState {
  switch (e.type) {
    case "next": {
      return { ...s, slide: clampSlide(e.count, s.slide + 1) }
    }
    case "back": {
      return { ...s, slide: Math.max(0, s.slide - 1) }
    }
    case "toggle": {
      // Playing from the last slide starts over.
      return s.playing
        ? { ...s, playing: false }
        : { playing: true, slide: s.slide >= e.count - 1 ? 0 : s.slide }
    }
    case "elapsed": {
      if (!s.playing || e.slide !== s.slide) return s
      return s.slide >= e.count - 1
        ? { ...s, playing: false }
        : { ...s, slide: s.slide + 1 }
    }
    default: {
      return assertNever(e)
    }
  }
}
