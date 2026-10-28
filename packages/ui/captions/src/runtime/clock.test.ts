/** @vitest-environment node */
import { createClock, type ClockPorts } from "@captions/runtime/clock"
import { describe, expect, it } from "vitest"

/** A clock whose time and frames the test moves by hand. */
function fakePorts(): ClockPorts & {
  advance: (ms: number) => void
  pending: () => number
} {
  let now = 0
  let frames: Array<() => void> = []
  return {
    now: () => now,
    nextFrame: (callback) => {
      frames.push(callback)
      return () => {
        frames = frames.filter((f) => f !== callback)
      }
    },
    advance: (ms): void => {
      now += ms
      const due = frames
      frames = []
      due.forEach((f) => f())
    },
    pending: (): number => frames.length,
  }
}

describe("the clock runtime", () => {
  it("asks for one frame at a time while playing, and none once paused", () => {
    const ports = fakePorts()
    const clock = createClock(ports)
    clock.play(1000)
    expect(ports.pending()).toBe(1)
    ports.advance(16)
    expect(clock.getSnapshot()).toEqual({ atMs: 16, playing: true })
    expect(ports.pending()).toBe(1)
    clock.pause()
    expect(ports.pending()).toBe(0)
    ports.advance(500)
    expect(clock.getSnapshot()).toEqual({ atMs: 16, playing: false })
  })

  it("stops itself at the end and tells its listeners", () => {
    const ports = fakePorts()
    const clock = createClock(ports, 900)
    let told = 0
    const unsubscribe = clock.subscribe(() => {
      told++
    })
    clock.play(1000)
    ports.advance(200)
    expect(clock.getSnapshot()).toEqual({ atMs: 1000, playing: false })
    expect(ports.pending()).toBe(0)
    expect(told).toBe(2)
    unsubscribe()
  })
})
