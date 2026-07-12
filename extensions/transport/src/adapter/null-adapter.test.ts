import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { Hypothesis } from "../contracts/hypothesis"
import { createNullAdapter } from "./null-adapter"

type Attrs = { readonly seq: number }

function arbitraryHypothesis(): fc.Arbitrary<Hypothesis<string, Attrs>> {
  return fc
    .dictionary(fc.string(), fc.record({ seq: fc.integer() }))
    .map((entries) => {
      const map = new Map(Object.entries(entries))
      return {
        get: (key: string) => map.get(key),
        has: (key: string) => map.has(key),
        keys: () => map.keys(),
      }
    })
}

describe("adapter/null-adapter — Theorem D.2 (Kernel independence)", () => {
  it("decide_0 invoked against an arbitrary hypothesis always returns ∅", () => {
    fc.assert(
      fc.property(arbitraryHypothesis(), (hypothesis) => {
        const adapter = createNullAdapter<string, Attrs>()
        expect(adapter.decide(hypothesis)).toEqual([])
      })
    )
  })

  it("returns an empty array even for a hypothesis with entries", () => {
    const adapter = createNullAdapter<string, Attrs>()
    const hypothesis: Hypothesis<string, Attrs> = {
      get: (key) => (key === "k" ? { seq: 1 } : undefined),
      has: (key) => key === "k",
      keys: () => ["k"],
    }
    expect(adapter.decide(hypothesis)).toEqual([])
  })
})
