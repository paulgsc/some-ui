import { describe, expect, it } from "vitest"

import type { FramePort } from "./index"
import { createLoopClock, LOOP_FPS, LOOP_MS, loopTimeAt } from "./index"

/** Frames driven by hand: `advance` moves the time and runs the frame asked for. */
function handFrames(): FramePort & {
  advance: (ms: number) => void
  pending: () => number
} {
  let now = 1000
  let frames: Array<() => void> = []
  return {
    now: () => now,
    request: (frame) => {
      frames.push(frame)
      return (): void => {
        frames = frames.filter((f) => f !== frame)
      }
    },
    advance: (ms): void => {
      now += ms
      const due = frames
      frames = []
      for (const frame of due) frame()
    },
    pending: () => frames.length,
  }
}

describe("loopTimeAt", () => {
  it("starts over every LOOP_MS, on a frame of LOOP_FPS", () => {
    const frameMs = 1000 / LOOP_FPS
    expect(loopTimeAt(0)).toBe(0)
    expect(loopTimeAt(frameMs - 1)).toBe(0)
    expect(loopTimeAt(frameMs)).toBe(Math.round(frameMs))
    expect(loopTimeAt(LOOP_MS)).toBe(0)
    expect(loopTimeAt(LOOP_MS + 1)).toBe(loopTimeAt(1))
    expect(loopTimeAt(-5)).toBe(0)
  })

  it("never reaches LOOP_MS", () => {
    for (let ms = 0; ms < 3 * LOOP_MS; ms += 7) {
      expect(loopTimeAt(ms)).toBeLessThan(LOOP_MS)
    }
  })
})

describe("createLoopClock", () => {
  it("asks for frames only while something listens", () => {
    const port = handFrames()
    const clock = createLoopClock(port)
    expect(port.pending()).toBe(0)
    const stopA = clock.subscribe(() => undefined)
    const stopB = clock.subscribe(() => undefined)
    expect(port.pending()).toBe(1)
    stopA()
    expect(port.pending()).toBe(1)
    stopB()
    expect(port.pending()).toBe(0)
  })

  it("tells its listeners only when the loop's frame moves", () => {
    const port = handFrames()
    const clock = createLoopClock(port)
    let told = 0
    clock.subscribe(() => (told += 1))
    port.advance(10)
    expect(told).toBe(0)
    expect(clock.getTime()).toBe(0)
    port.advance(100)
    expect(told).toBe(1)
    expect(clock.getTime()).toBe(loopTimeAt(110))
  })

  it("resumes where it stopped", () => {
    const port = handFrames()
    const clock = createLoopClock(port)
    const stop = clock.subscribe(() => undefined)
    port.advance(500)
    const at = clock.getTime()
    stop()
    port.advance(5000)
    clock.subscribe(() => undefined)
    expect(clock.getTime()).toBe(at)
    port.advance(1)
    expect(clock.getTime()).toBe(loopTimeAt(at + 1))
  })
})
