import type {
  Block,
  ConstructionStep,
  DiagnosticStep,
} from "@leetype/types/exercise"
import { describe, expect, it } from "vitest"

import { lintCorpus } from "./corpus-lint"
import { ALL_FIXTURE_EXERCISES } from "./index"

const failure: Block = {
  kind: "trace",
  headline: "TIMEOUT",
  observations: [{ label: "cursor", value: "remained 0" }],
}
const repair: Block = {
  kind: "typing",
  source: "cursor += 1;",
  language: "rust",
}
const constraint: Block = {
  kind: "transition",
  before: "unresolved",
  after: "vacant | occupied",
}
const witness: Block = {
  kind: "typing",
  source: "map.entry(key)",
  language: "rust",
}

function diagnosticStep(
  overrides: Partial<DiagnosticStep> = {}
): DiagnosticStep {
  return {
    id: "story-diagnostic",
    goal: "Fix the loop so it terminates.",
    concepts: ["fixture"],
    blocks: [failure, repair],
    rationale: {
      cause: "cursor never advances",
      whyRepairDiscriminates: "incrementing cursor is the only fix",
    },
    ...overrides,
  }
}

function constructionStep(
  overrides: Partial<ConstructionStep> = {}
): ConstructionStep {
  return {
    id: "story-construction",
    goal: "Ask the map for the place a key lives.",
    concepts: ["fixture"],
    blocks: [constraint, witness],
    obligation: "a lookup can be held as a place, not a value",
    ...overrides,
  }
}

describe("lintCorpus — the real corpus", () => {
  it("finds no violations in the validated shim corpus", () => {
    expect(lintCorpus(ALL_FIXTURE_EXERCISES)).toEqual([])
  })
})

describe("lintCorpus — deliberately malformed fixtures", () => {
  it("fails when rationale.whyRepairDiscriminates restates rationale.cause", () => {
    const step = diagnosticStep({
      rationale: {
        cause: "cursor never advances toward input.len()",
        whyRepairDiscriminates: "cursor never advances toward input.len()",
      },
    })
    const violations = lintCorpus([{ id: "e1", title: "t", steps: [step] }])
    expect(violations.some((v) => v.includes("say the same"))).toBe(true)
  })

  it("fails when obligation quotes the witness's code back as prose", () => {
    const step = constructionStep({
      obligation: "call map.entry(key) to get the place",
    })
    const violations = lintCorpus([{ id: "e1", title: "t", steps: [step] }])
    expect(violations.some((v) => v.includes("quotes the witness"))).toBe(true)
  })

  it("fails when a diagnostic step's repair runs past the bounded-answer budget", () => {
    // Re-validated through the strict DiagnosticStepSchema, which the
    // generic parse the shim runs at module load does not apply.
    const step = diagnosticStep({
      blocks: [
        failure,
        { kind: "typing", source: "a".repeat(51), language: "rust" },
      ],
    })
    const violations = lintCorpus([{ id: "e1", title: "t", steps: [step] }])
    expect(violations.some((v) => v.includes("typed characters"))).toBe(true)
  })

  it("fails when a construction step has no evidence besides its witness", () => {
    // Re-validated through the strict ConstructionStepSchema, same reason.
    const step = constructionStep({ blocks: [witness] })
    const violations = lintCorpus([{ id: "e1", title: "t", steps: [step] }])
    expect(
      violations.some((v) =>
        v.includes("at least one block besides its witness")
      )
    ).toBe(true)
  })

  it("fails when a step's evidence exceeds PromptPanel's row budget", () => {
    const manyObservations: Block = {
      kind: "trace",
      observations: Array.from({ length: 8 }, (_, i) => ({
        label: `o${i}`,
        value: `v${i}`,
      })),
    }
    const step = diagnosticStep({ blocks: [manyObservations, repair] })
    const violations = lintCorpus([{ id: "e1", title: "t", steps: [step] }])
    expect(violations.some((v) => v.includes("evidence rows"))).toBe(true)
  })

  it("fails when concepts is empty", () => {
    const step = diagnosticStep({ concepts: [] })
    const violations = lintCorpus([{ id: "e1", title: "t", steps: [step] }])
    expect(violations.some((v) => v.includes("concepts is empty"))).toBe(true)
  })

  it("fails when two exercises share a step id — the collision indexStepsById cannot itself detect", () => {
    // Regression for a real review finding on #1073: a `Map` silently lets
    // a later step with the same id shadow an earlier one, which would
    // check a transferFrom reference against the wrong step instead of
    // catching the real mismatch. This is the loud failure that replaces
    // that silent one.
    const stepA = constructionStep({ id: "dup", concepts: ["a"] })
    const stepB = diagnosticStep({ id: "dup", concepts: ["b"] })
    const violations = lintCorpus([
      { id: "e1", title: "t1", steps: [stepA] },
      { id: "e2", title: "t2", steps: [stepB] },
    ])
    expect(
      violations.some((v) => v.includes('step id "dup" is used by both'))
    ).toBe(true)
  })

  it("fails when transferFrom references a step id not in the corpus", () => {
    const step = diagnosticStep({ transferFrom: "does-not-exist" })
    const violations = lintCorpus([{ id: "e1", title: "t", steps: [step] }])
    expect(violations.some((v) => v.includes("is not a step id"))).toBe(true)
  })

  it("fails when transferFrom references the step itself", () => {
    const step = diagnosticStep({ transferFrom: "story-diagnostic" })
    const violations = lintCorpus([{ id: "e1", title: "t", steps: [step] }])
    expect(violations.some((v) => v.includes("references itself"))).toBe(true)
  })

  it("fails when transferFrom's target shares no concept id", () => {
    const source = constructionStep({
      id: "source",
      concepts: ["other-concept"],
    })
    const step = diagnosticStep({ transferFrom: "source" })
    const violations = lintCorpus([
      { id: "e1", title: "t", steps: [source, step] },
    ])
    expect(violations.some((v) => v.includes("shares no concept id"))).toBe(
      true
    )
  })

  it("passes when transferFrom's target shares a concept id", () => {
    const source = constructionStep({ id: "source", concepts: ["shared"] })
    const step = diagnosticStep({
      transferFrom: "source",
      concepts: ["shared"],
    })
    const violations = lintCorpus([
      { id: "e1", title: "t", steps: [source, step] },
    ])
    expect(violations).toEqual([])
  })

  it("passes a well-formed diagnostic step and a well-formed construction step", () => {
    const violations = lintCorpus([
      { id: "e1", title: "t", steps: [diagnosticStep(), constructionStep()] },
    ])
    expect(violations).toEqual([])
  })
})
