/**
 * One clock for every looping preview on a page (HOST8, #3532): the time
 * into a loop of `LOOP_MS`, stepped at `LOOP_FPS`, so a page of previews
 * redraws a few times a second together rather than each at its own pace.
 *
 * The time is a pure function of how long the clock has run
 * (`loopTimeAt`), and the clock asks for frames only while something
 * listens: the last listener to leave stops it. The frames come through a
 * port, so a test drives them by hand.
 */

/**
 * How long a preview's loop runs before it starts over: two of the idle's
 * breaths (3.4 s each, `@some-ui/styles/brand/host`), so the breath meets
 * itself at the seam. A policy, moved with the story (C1533).
 */
export const LOOP_MS = 6800

/** How often a loop's picture changes: enough for a blink, light on a phone. */
export const LOOP_FPS = 15

/** Where a still preview holds: past the first blink's start, eyes open. */
export const STILL_MS = 1200

/** The time into the loop after `elapsedMs`, on a frame of `LOOP_FPS`. */
export function loopTimeAt(elapsedMs: number): number {
  const frameMs = 1000 / LOOP_FPS
  const into = ((Math.max(0, elapsedMs) % LOOP_MS) + LOOP_MS) % LOOP_MS
  return Math.round(Math.floor(into / frameMs) * frameMs)
}

/** Where the clock's frames come from: the browser's animation frames, or a test's. */
export type FramePort = {
  readonly now: () => number
  /** Calls `frame` once, at the next frame; the result cancels it. */
  readonly request: (frame: () => void) => () => void
}

export type LoopClock = {
  readonly subscribe: (listener: () => void) => () => void
  /** The time into the loop, in ms: one of `loopTimeAt`'s values. */
  readonly getTime: () => number
}

/**
 * A clock over `port`. Cost: one frame callback per display frame while any
 * preview listens, and listeners are told only when the loop's frame moves,
 * `LOOP_FPS` times a second.
 */
export function createLoopClock(port: FramePort): LoopClock {
  const listeners = new Set<() => void>()
  let startedAt = 0
  let time = 0
  let cancel: (() => void) | null = null

  const tick = (): void => {
    const next = loopTimeAt(port.now() - startedAt)
    cancel = port.request(tick)
    if (next === time) return
    time = next
    for (const listener of listeners) listener()
  }

  return {
    subscribe: (listener) => {
      listeners.add(listener)
      if (cancel === null) {
        startedAt = port.now() - time
        cancel = port.request(tick)
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && cancel !== null) {
          cancel()
          cancel = null
        }
      }
    },
    getTime: () => time,
  }
}

/** The browser's animation frames, as a port. */
export const ANIMATION_FRAMES: FramePort = {
  now: () => performance.now(),
  request: (frame) => {
    const id = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(id)
  },
}
