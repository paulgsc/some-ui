import { describe, expect, it } from "vitest"

import type { PropositionFamily } from "./classification"
import {
  classificationCoverageGaps,
  isPropositionId,
  PROPOSITION_CLASSIFICATION,
} from "./classification"
import { PROPOSITION_REGISTER } from "./generated"

// Names `PropositionFamily` explicitly: a type alias only ever consumed
// structurally (as `PropositionClassification.family`'s own field type) is
// invisible to knip's unused-export check — the same footgun
// `generated.test.ts` already documents for `PropositionId` (this relay's
// #1240 handoff) — even though it is real, public API surface a future
// caller (a component rendering a family badge, say) would import by name.
const exampleFamily: PropositionFamily = "seq"

describe("PROPOSITION_CLASSIFICATION", () => {
  it("classifies exactly the live register's own ids — no gap in either direction", () => {
    expect(classificationCoverageGaps()).toEqual([])
  })

  it("names a real family value", () => {
    expect(PROPOSITION_CLASSIFICATION["CW-P1"].family).toBe(exampleFamily)
  })

  it("has an entry for every key PROPOSITION_REGISTER exports", () => {
    expect(Object.keys(PROPOSITION_CLASSIFICATION).sort()).toEqual(
      Object.keys(PROPOSITION_REGISTER).sort()
    )
  })

  it("gives every entry at least a family, and dimensions only CW-P16 leaves empty", () => {
    for (const [id, classification] of Object.entries(
      PROPOSITION_CLASSIFICATION
    )) {
      expect(["seq", "loop", "substitution"]).toContain(classification.family)
      if (id === "CW-P16") {
        expect(classification.dimensions).toEqual([])
      } else {
        expect(classification.dimensions.length).toBeGreaterThan(0)
      }
    }
  })
})

describe("isPropositionId", () => {
  it("accepts every real register id", () => {
    for (const id of Object.keys(PROPOSITION_REGISTER)) {
      expect(isPropositionId(id)).toBe(true)
    }
  })

  it("rejects a string that is not a register id", () => {
    expect(isPropositionId("CW-P999")).toBe(false)
    expect(isPropositionId("not-a-proposition")).toBe(false)
  })
})
