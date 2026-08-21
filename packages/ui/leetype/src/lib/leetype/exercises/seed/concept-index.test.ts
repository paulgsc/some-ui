import { describe, expect, it } from "vitest"

import { CONCEPT_IDS } from "../concepts"
import { conceptIndex } from "./concept-index"
import { SEED_EXERCISES } from "./index"

describe("conceptIndex", () => {
  it("finds every step that probes a shared concept, across exercises", () => {
    const index = conceptIndex(SEED_EXERCISES)
    const loopProgressProbes = index.get(CONCEPT_IDS.loopProgress) ?? []
    const stepIds = loopProgressProbes.map((probe) => probe.stepId)
    expect(stepIds).toContain("diagnostic-loop-progress-01")
    expect(stepIds).toContain("diagnostic-shrinking-interval-01")
  })

  it("is empty for a concept id nothing in the corpus uses", () => {
    const index = conceptIndex(SEED_EXERCISES)
    expect(index.get("no-such-concept")).toBeUndefined()
  })

  it("keys entryApi's many-concept steps under their exercise id", () => {
    const index = conceptIndex(SEED_EXERCISES)
    const generics = index.get(CONCEPT_IDS.generics) ?? []
    expect(generics).toEqual([
      { exerciseId: "rust-hashmap-entry", stepId: "entry-08-generalize" },
    ])
  })
})
