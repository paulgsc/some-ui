import { describe, expect, it } from "vitest"

import { createEpochCounter, initialEpoch } from "./epoch"

describe("session/epoch", () => {
  it("starts at the initial epoch", () => {
    const counter = createEpochCounter()
    expect(counter.current).toBe(initialEpoch())
  })

  it("reset() strictly increases the epoch", () => {
    const counter = createEpochCounter()
    const first = counter.reset()
    const second = counter.reset()

    expect(second).toBeGreaterThan(first)
    expect(counter.current).toBe(second)
  })

  it("two resets called back-to-back (same tick) never collide", () => {
    const counter = createEpochCounter()
    const seen = new Set<number>()
    for (let i = 0; i < 100; i++) {
      seen.add(counter.reset())
    }
    expect(seen.size).toBe(100)
  })

  it("current has no public setter — the type only exposes a getter", () => {
    const counter = createEpochCounter()
    const descriptor = Object.getOwnPropertyDescriptor(counter, "current")
    expect(descriptor?.set).toBeUndefined()
    expect(typeof descriptor?.get).toBe("function")
  })

  it("can be seeded from an explicit initial value", () => {
    const counter = createEpochCounter(initialEpoch())
    expect(counter.current).toBe(initialEpoch())
    counter.reset()
    expect(counter.current).not.toBe(initialEpoch())
  })
})
