/**
 * @vitest-environment node
 *
 * The tap on Run it again (RETRY): one ask at a time, its answer said once,
 * the board read again when the row moved, and nothing said once the page
 * went.
 */
import { describe, expect, it, vi } from "vitest"

import type { Said } from "@/lib/renders/again/runtime"
import { createAgain, IDLE, moved, step } from "@/lib/renders/again/runtime"

const TARGET = { feed: "cards-essay", key: "home-database-safety-2026-11-21" }

const deferred = (): {
  promise: Promise<Said>
  resolve: (said: Said) => void
} => {
  let resolve: (said: Said) => void = () => undefined
  const promise = new Promise<Said>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const flush = (): Promise<void> =>
  new Promise((r) => {
    setTimeout(r, 0)
  })

describe("step", () => {
  it("takes one tap at a time, and an answer only while asking", () => {
    const asking = step(IDLE, { type: "tap", target: TARGET, at: 7 })
    expect(asking).toEqual({ kind: "asking", at: 7, target: TARGET })
    expect(step(asking, { type: "tap", target: TARGET, at: 9 })).toBe(asking)
    const said = { kind: "away" } as const
    expect(step(IDLE, { type: "answered", said })).toBe(IDLE)
    const after = step(asking, { type: "answered", said })
    expect(after).toEqual({ kind: "said", said, at: 7, target: TARGET })
    expect(step(after, { type: "dismissed" })).toBe(IDLE)
    expect(step(asking, { type: "dismissed" })).toBe(asking)
  })
})

const ASKED = {
  kind: "answer",
  answer: {
    kind: "step",
    step: {
      state: "asked",
      askedAt: 1,
      startedAt: null,
      endedAt: null,
      reason: null,
      items: [],
    },
  },
} as const satisfies Said

describe("moved", () => {
  it("reads the board again for every step home answers, and for nothing else", () => {
    expect(moved(ASKED)).toBe(true)
    expect(moved({ kind: "answer", answer: { kind: "notHere" } })).toBe(false)
    expect(moved({ kind: "answer", answer: { kind: "unreadable" } })).toBe(
      false
    )
    expect(moved({ kind: "away" })).toBe(false)
  })
})

describe("createAgain", () => {
  it("asks once for two taps, says the answer and reads the board again", async () => {
    const asked = deferred()
    const ask = vi.fn(() => asked.promise)
    const readAgain = vi.fn()
    const runtime = createAgain({ ask, readAgain, now: () => 42 })
    runtime.attach()
    runtime.dispatch({ type: "tap", target: TARGET })
    runtime.dispatch({ type: "tap", target: TARGET })
    expect(ask).toHaveBeenCalledTimes(1)
    expect(ask).toHaveBeenCalledWith(TARGET)
    expect(runtime.getSnapshot()).toEqual({
      kind: "asking",
      at: 42,
      target: TARGET,
    })
    asked.resolve(ASKED)
    await flush()
    expect(runtime.getSnapshot()).toEqual({
      kind: "said",
      said: ASKED,
      at: 42,
      target: TARGET,
    })
    expect(readAgain).toHaveBeenCalledTimes(1)
  })

  it("says nothing of an answer that lands after the page went", async () => {
    const asked = deferred()
    const readAgain = vi.fn()
    const runtime = createAgain({ ask: () => asked.promise, readAgain })
    const detach = runtime.attach()
    runtime.dispatch({ type: "tap", target: TARGET })
    detach()
    asked.resolve(ASKED)
    await flush()
    expect(runtime.getSnapshot()).toMatchObject({ kind: "asking" })
    expect(readAgain).not.toHaveBeenCalled()
  })

  it("asks nothing before it is attached", () => {
    const ask = vi.fn(() => deferred().promise)
    const runtime = createAgain({ ask, readAgain: vi.fn() })
    runtime.dispatch({ type: "tap", target: TARGET })
    expect(ask).not.toHaveBeenCalled()
    expect(runtime.getSnapshot()).toBe(IDLE)
  })
})
