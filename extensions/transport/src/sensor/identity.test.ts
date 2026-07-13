import { describe, expect, it } from "vitest"

import {
  compareTiers,
  createContinuityCheck,
  identify,
  type Extractor,
} from "./identity"

type Attrs = { readonly videoId?: string }

describe("sensor/identity — tier order (Definition 4.1)", () => {
  it("is total: raw ≺ partial ≺ full", () => {
    expect(compareTiers("raw", "partial")).toBeLessThan(0)
    expect(compareTiers("partial", "full")).toBeLessThan(0)
    expect(compareTiers("raw", "full")).toBeLessThan(0)
  })

  it("is reflexive under equality", () => {
    expect(compareTiers("raw", "raw")).toBe(0)
    expect(compareTiers("partial", "partial")).toBe(0)
    expect(compareTiers("full", "full")).toBe(0)
  })

  it("is anti-symmetric (comparator flips sign when arguments swap)", () => {
    expect(compareTiers("full", "raw")).toBeGreaterThan(0)
    expect(compareTiers("partial", "raw")).toBeGreaterThan(0)
  })
})

describe("sensor/identity — continuity check (Corollary 4.1.1)", () => {
  it("emits no implicit deletion the first time a carrier is seen", () => {
    const continuity = createContinuityCheck<string, string>()
    expect(continuity.observe("node1", "vidA")).toBeUndefined()
  })

  it("emits no implicit deletion when the same key is re-observed", () => {
    const continuity = createContinuityCheck<string, string>()
    continuity.observe("node1", "vidA")
    expect(continuity.observe("node1", "vidA")).toBeUndefined()
  })

  it("does not treat absence of a fresh key as deletion (Axiom 3.4)", () => {
    const continuity = createContinuityCheck<string, string>()
    continuity.observe("node1", "vidA")
    expect(continuity.observe("node1", undefined)).toBeUndefined()
  })

  it("a carrier recycled mid-stream (same physical identity, new logical key) triggers the implicit-deletion signal exactly once", () => {
    const continuity = createContinuityCheck<string, string>()

    continuity.observe("node1", "vidA")
    const deletion = continuity.observe("node1", "vidB")
    const again = continuity.observe("node1", "vidB")

    expect(deletion).toEqual({ carrier: "node1", staleKey: "vidA" })
    expect(again).toBeUndefined() // no explicit removal token ever existed for vidA
  })

  it("forget() drops bookkeeping so a later re-observation is treated as fresh", () => {
    const continuity = createContinuityCheck<string, string>()
    continuity.observe("node1", "vidA")
    continuity.forget("node1")
    expect(continuity.observe("node1", "vidB")).toBeUndefined()
  })
})

describe("sensor/identity — identify() (Definition 4.1 + Corollary 4.1.1 combined)", () => {
  const fullExtractor: Extractor<string, string, Attrs> = (
    _carrier,
    observed
  ) =>
    observed.videoId === undefined
      ? { tier: "raw" }
      : { tier: "full", key: observed.videoId, attrs: observed }

  it("re-derives extraction fresh on every call — no caching across rounds", () => {
    const continuity = createContinuityCheck<string, string>()
    let calls = 0
    const countingExtractor: Extractor<string, string, Attrs> = (c, o) => {
      calls++
      return fullExtractor(c, o)
    }

    identify("node1", { videoId: "vidA" }, countingExtractor, continuity)
    identify("node1", { videoId: "vidA" }, countingExtractor, continuity)

    expect(calls).toBe(2)
  })

  it("runs the continuity check on every ingestion, even when extraction is 'raw' (nothing actionable)", () => {
    const continuity = createContinuityCheck<string, string>()
    let observeCalls = 0
    const spyContinuity = {
      observe: (
        carrier: string,
        key: string | undefined
      ): ReturnType<typeof continuity.observe> => {
        observeCalls++
        return continuity.observe(carrier, key)
      },
      forget: continuity.forget,
    }

    identify("node1", {}, fullExtractor, spyContinuity)

    expect(observeCalls).toBe(1)
  })

  it("mirrors Proposition 4.1's proof: recycling a carrier surfaces an implicit deletion with no explicit removal token", () => {
    const continuity = createContinuityCheck<string, string>()

    const first = identify(
      "node1",
      { videoId: "vidA" },
      fullExtractor,
      continuity
    )
    expect(first.extraction).toEqual({
      tier: "full",
      key: "vidA",
      attrs: { videoId: "vidA" },
    })
    expect(first.implicitDeletion).toBeUndefined()

    const second = identify(
      "node1",
      { videoId: "vidB" },
      fullExtractor,
      continuity
    )
    expect(second.implicitDeletion).toEqual({
      carrier: "node1",
      staleKey: "vidA",
    })
  })
})
