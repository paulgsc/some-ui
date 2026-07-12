import { describe, expect, it } from "vitest"

import { createDecayTracker } from "./decay"
import { createHypothesis } from "./hypothesis"
import { createProvenanceStore, update } from "./update"

type Attrs = { readonly seq: number }

function seed(
  h: ReturnType<typeof createHypothesis<string, Attrs>>,
  p: ReturnType<typeof createProvenanceStore<string>>,
  key: string,
  timestamp: number
): void {
  update(h, p, {
    key,
    epoch: 0,
    tier: "full",
    timestamp,
    attrs: { seq: timestamp },
  })
}

describe("estimator/decay — Remark 3.3", () => {
  it("does not evict a key on a single brief absence (must never false-positive virtualization)", () => {
    const h = createHypothesis<string, Attrs>()
    const p = createProvenanceStore<string>()
    const decay = createDecayTracker<string, Attrs>()

    seed(h, p, "k", 0)
    decay.touch("k", 0)

    const evicted = decay.sweep(1, 10, h, p) // only 1 tick elapsed, well within the bound

    expect(evicted).toEqual([])
    expect(h.has("k")).toBe(true)
  })

  it("evicts a key only after sustained absence exceeds the staleness bound", () => {
    const h = createHypothesis<string, Attrs>()
    const p = createProvenanceStore<string>()
    const decay = createDecayTracker<string, Attrs>()

    seed(h, p, "k", 0)
    decay.touch("k", 0)

    const stillWithinBound = decay.sweep(10, 10, h, p)
    expect(stillWithinBound).toEqual([])
    expect(h.has("k")).toBe(true)

    const pastBound = decay.sweep(11, 10, h, p)
    expect(pastBound).toEqual(["k"])
    expect(h.has("k")).toBe(false)
  })

  it("a touch() resets the staleness clock, so continued reinforcement never decays", () => {
    const h = createHypothesis<string, Attrs>()
    const p = createProvenanceStore<string>()
    const decay = createDecayTracker<string, Attrs>()

    seed(h, p, "k", 0)
    decay.touch("k", 0)
    decay.sweep(5, 10, h, p)
    decay.touch("k", 5) // reinforced again before the bound

    const evicted = decay.sweep(14, 10, h, p) // 14 - 5 = 9, still within bound
    expect(evicted).toEqual([])
    expect(h.has("k")).toBe(true)
  })

  it("reset() clears all decay bookkeeping — gated to a single epoch", () => {
    const h = createHypothesis<string, Attrs>()
    const p = createProvenanceStore<string>()
    const decay = createDecayTracker<string, Attrs>()

    seed(h, p, "k", 0)
    decay.touch("k", 0)
    decay.reset()

    // With bookkeeping cleared, a sweep long past any bound finds nothing to evict.
    const evicted = decay.sweep(1000, 10, h, p)
    expect(evicted).toEqual([])
  })

  it("never confuses physical disconnection with logical deletion — sweep only consults its own touch() ticks, not DOM connectivity", () => {
    const h = createHypothesis<string, Attrs>()
    const p = createProvenanceStore<string>()
    const decay = createDecayTracker<string, Attrs>()

    seed(h, p, "k", 0)
    decay.touch("k", 0)

    // No DOM API appears anywhere in this module or test; eviction is purely
    // a function of elapsed ticks since the last touch().
    const evicted = decay.sweep(5, 10, h, p)
    expect(evicted).toEqual([])
    expect(h.has("k")).toBe(true)
  })
})
