/** @vitest-environment node */
import {
  initialClock,
  positionAt,
  stepClock,
  type ClockEvent,
  type ClockState,
} from "@captions/lib/clock"
import { describe, expect, it } from "vitest"

const run = (
  events: ReadonlyArray<ClockEvent>,
  start: ClockState = initialClock()
): ClockState => events.reduce(stepClock, start)

describe("the preview clock", () => {
  it("advances with time only while playing", () => {
    const s = run([{ type: "play", now: 1000, durationMs: 5000 }])
    expect(positionAt(s, 1500)).toBe(500)
    const paused = stepClock(s, { type: "pause", now: 1800 })
    expect(positionAt(paused, 9000)).toBe(800)
  })

  it("stops at the end, and plays from the start again", () => {
    const s = run([
      { type: "play", now: 0, durationMs: 1000 },
      { type: "tick", now: 1200 },
    ])
    expect(s.playing).toBe(false)
    expect(positionAt(s, 5000)).toBe(1000)
    expect(
      positionAt(
        stepClock(s, { type: "play", now: 5000, durationMs: 1000 }),
        5100
      )
    ).toBe(100)
  })

  it("seeks inside the clip, playing or not", () => {
    const s = run([
      { type: "play", now: 0, durationMs: 1000 },
      { type: "seek", atMs: 700, now: 100, durationMs: 1000 },
    ])
    expect(positionAt(s, 200)).toBe(800)
    expect(
      positionAt(
        stepClock(initialClock(), {
          type: "seek",
          atMs: -5,
          now: 0,
          durationMs: 1000,
        }),
        0
      )
    ).toBe(0)
  })
})
