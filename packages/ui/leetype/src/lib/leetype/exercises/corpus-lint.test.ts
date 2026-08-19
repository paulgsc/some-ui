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

describe("patch.lineKinds alignment against the rendered source (LTY-PATCH P6, #1081)", () => {
  const patchedWitness: Block = {
    kind: "typing",
    source: "line-a\nline-b",
    language: "rust",
    patch: {
      path: "src/example.rs",
      oldStart: 1,
      newStart: 1,
      lineKinds: ["context", "add"],
    },
  }

  it("fails when lineKinds has a different entry count than the rendered source has lines — even under the default approximation", () => {
    // No injected check needed: the fallback ‹…›-stripping approximation
    // still computes a real line count, and this fixture has no ‹…› at all
    // for the approximation to strip — the mismatch is visible either way.
    const step = constructionStep({
      blocks: [
        constraint,
        {
          ...patchedWitness,
          patch: { ...patchedWitness.patch!, lineKinds: ["context"] },
        },
      ],
    })
    const violations = lintCorpus([{ id: "e1", title: "t", steps: [step] }])
    expect(
      violations.some((v) => v.includes("has 1 entries but the rendered"))
    ).toBe(true)
  })

  it("passes line-count alignment without flagging role mismatches when no rolesOf is given (the approximation's real limit)", () => {
    // Documents the fallback's actual boundary: it is deliberately unable
    // to catch an "add" line the engine would render with no typeable
    // character, or vice versa — only the real, wasm-backed check can.
    const step = constructionStep({ blocks: [constraint, patchedWitness] })
    const violations = lintCorpus([{ id: "e1", title: "t", steps: [step] }])
    expect(violations).toEqual([])
  })

  it("fails when an add-marked line has no typeable character, under a role-aware check", () => {
    const step = constructionStep({ blocks: [constraint, patchedWitness] })
    const violations = lintCorpus([{ id: "e1", title: "t", steps: [step] }], {
      renderedSourceOf: (source) => source,
      // Every character reads as context — including line 1, "add"-marked.
      rolesOf: (source) => new Uint8Array(source.length).fill(2), // ROLE_CONTEXT
    })
    expect(
      violations.some((v) =>
        v.includes('line 1 is marked "add" but the engine renders no typeable')
      )
    ).toBe(true)
  })

  it("fails when a context-marked line has a typeable character, under a role-aware check", () => {
    const step = constructionStep({ blocks: [constraint, patchedWitness] })
    const violations = lintCorpus([{ id: "e1", title: "t", steps: [step] }], {
      renderedSourceOf: (source) => source,
      // Every character reads as typeable — including line 0, "context"-marked.
      rolesOf: (source) => new Uint8Array(source.length).fill(1), // ROLE_TYPEABLE
    })
    expect(
      violations.some((v) =>
        v.includes(
          'line 0 is marked "context" but the engine renders a typeable'
        )
      )
    ).toBe(true)
  })

  it("passes a correctly-aligned patch under a role-aware check that matches its lineKinds", () => {
    const step = constructionStep({ blocks: [constraint, patchedWitness] })
    const violations = lintCorpus([{ id: "e1", title: "t", steps: [step] }], {
      renderedSourceOf: (source) => source,
      rolesOf: (source) =>
        // "line-a" (context, indices 0-5) then '\n' (index 6) then
        // "line-b" (add, indices 7-12) — matches patchedWitness.patch.lineKinds.
        Uint8Array.from(source, (_, i) => (i <= 6 ? 2 : 1)),
    })
    expect(violations).toEqual([])
  })

  it("never checks a step with no patch overlay at all", () => {
    const violations = lintCorpus([
      { id: "e1", title: "t", steps: [constructionStep()] },
    ])
    expect(violations).toEqual([])
  })

  it("stays aligned across a surrogate-pair character, where a UTF-16-length cursor would drift", () => {
    // "🎉" is one Rust `char` (one Unicode scalar value) but two UTF-16
    // code units — `roles` is indexed the first way (role_codes() walks
    // Program::chars, a Vec<char>), so a cursor advanced by
    // `line.length` (the second way) overcounts by one after this line
    // and every line after it reads one role short. Regression for a
    // real review finding on #1081.
    const emojiWitness: Block = {
      kind: "typing",
      source: "🎉x\nb",
      language: "rust",
      patch: {
        path: "src/example.rs",
        oldStart: 1,
        newStart: 1,
        lineKinds: ["context", "add"],
      },
    }
    const step = constructionStep({ blocks: [constraint, emojiWitness] })
    const violations = lintCorpus([{ id: "e1", title: "t", steps: [step] }], {
      renderedSourceOf: (source) => source,
      // Char-indexed, matching classify_source: 🎉(context), x(context),
      // \n(context — irrelevant, never read as part of either line), b(add).
      rolesOf: () => Uint8Array.from([2, 2, 2, 1]),
    })
    expect(violations).toEqual([])
  })
})
