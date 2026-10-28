/**
 * The preview's playback clock: the pure machine in `lib/clock`, driven over
 * two ports (the time now, and the next animation frame). It owns the one
 * pending frame, asks for the next only while playing, and drops it on pause
 * or stop, so no frame lands after the clock has stopped. The component reads
 * its snapshot and calls its methods; nothing here is React.
 */

import {
  initialClock,
  positionAt,
  stepClock,
  type ClockEvent,
} from "@captions/lib/clock"

export type ClockPorts = {
  readonly now: () => number
  /** Calls back on the next frame; the returned function cancels it. */
  readonly nextFrame: (callback: () => void) => () => void
}

export type ClockSnapshot = { readonly atMs: number; readonly playing: boolean }

export type Clock = {
  readonly subscribe: (listener: () => void) => () => void
  readonly getSnapshot: () => ClockSnapshot
  readonly play: (durationMs: number) => void
  readonly pause: () => void
  readonly seek: (atMs: number, durationMs: number) => void
  /** Stops playing and drops the pending frame. */
  readonly stop: () => void
}

export function createClock(ports: ClockPorts, initialAtMs = 0): Clock {
  let state = initialClock(initialAtMs)
  let snapshot: ClockSnapshot = { atMs: state.atMs, playing: false }
  let cancelFrame: (() => void) | null = null
  const listeners = new Set<() => void>()

  const dispatch = (event: ClockEvent): void => {
    state = stepClock(state, event)
    const atMs = positionAt(state, event.now)
    if (atMs !== snapshot.atMs || state.playing !== snapshot.playing) {
      snapshot = { atMs, playing: state.playing }
      listeners.forEach((listener) => listener())
    }
    if (state.playing && cancelFrame === null) {
      cancelFrame = ports.nextFrame(() => {
        cancelFrame = null
        dispatch({ type: "tick", now: ports.now() })
      })
    } else if (!state.playing && cancelFrame !== null) {
      cancelFrame()
      cancelFrame = null
    }
  }

  return {
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => snapshot,
    play: (durationMs) =>
      dispatch({ type: "play", now: ports.now(), durationMs }),
    pause: () => dispatch({ type: "pause", now: ports.now() }),
    seek: (atMs, durationMs) =>
      dispatch({ type: "seek", atMs, now: ports.now(), durationMs }),
    stop: () => dispatch({ type: "pause", now: ports.now() }),
  }
}

/** The browser's clock and animation frames. */
export const browserClockPorts: ClockPorts = {
  now: () => performance.now(),
  nextFrame: (callback) => {
    const id = requestAnimationFrame(() => callback())
    return () => cancelAnimationFrame(id)
  },
}
