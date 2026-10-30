/**
 * The preview's playback clock as a pure state machine. Time is never read
 * here: every event carries the moment it happened (`now`, from the
 * runtime's port), so a step is the same in a test as on the page.
 */

import { assertNever } from "@some-ui/intent-kit"

export type ClockState = {
  readonly playing: boolean
  /** The position when the clock last changed. */
  readonly atMs: number
  /** `now` when the clock last changed. */
  readonly sinceNow: number
  /** How long the clip runs; playing stops there. */
  readonly durationMs: number
}

export type ClockEvent =
  | { readonly type: "play"; readonly now: number; readonly durationMs: number }
  | { readonly type: "pause"; readonly now: number }
  | {
      readonly type: "seek"
      readonly atMs: number
      readonly now: number
      readonly durationMs: number
    }
  /** A frame went by. */
  | { readonly type: "tick"; readonly now: number }

const clampTo = (durationMs: number, ms: number): number =>
  Math.max(0, Math.min(durationMs, ms))

export const initialClock = (atMs = 0): ClockState => ({
  playing: false,
  atMs: Math.max(0, atMs),
  sinceNow: 0,
  durationMs: Number.POSITIVE_INFINITY,
})

/** Where the clock is at `now`. */
export const positionAt = (s: ClockState, now: number): number =>
  s.playing ? clampTo(s.durationMs, s.atMs + (now - s.sinceNow)) : s.atMs

export function stepClock(s: ClockState, e: ClockEvent): ClockState {
  switch (e.type) {
    case "play": {
      if (s.playing) return s
      const at = clampTo(e.durationMs, s.atMs)
      // Playing from the end starts over.
      return {
        playing: true,
        atMs: at >= e.durationMs ? 0 : at,
        sinceNow: e.now,
        durationMs: e.durationMs,
      }
    }
    case "pause": {
      return s.playing
        ? { ...s, playing: false, atMs: positionAt(s, e.now), sinceNow: e.now }
        : s
    }
    case "seek": {
      return {
        ...s,
        atMs: clampTo(e.durationMs, e.atMs),
        sinceNow: e.now,
        durationMs: e.durationMs,
      }
    }
    case "tick": {
      return s.playing && positionAt(s, e.now) >= s.durationMs
        ? { ...s, playing: false, atMs: s.durationMs, sinceNow: e.now }
        : s
    }
    default: {
      return assertNever(e)
    }
  }
}
