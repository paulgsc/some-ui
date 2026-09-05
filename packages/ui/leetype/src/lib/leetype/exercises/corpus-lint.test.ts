import type { PropositionId } from "@leetype/lib/leetype/proposition-register/generated"
import { ALL_FIXTURE_ROUNDS } from "@leetype/lib/leetype/round-corpus"
import type { ConstraintSet } from "@leetype/types/constraint"
import type {
  Block,
  ConstructionStep,
  DiagnosticStep,
} from "@leetype/types/exercise"
import { typingBlockFromDiff } from "@leetype/types/exercise"
import type { DiffSet } from "@leetype/types/round"
import { describe, expect, it } from "vitest"

import type { RoundCorpusEntry } from "./corpus-lint"
import {
  checkNoAssertedComplexityClassLiteral,
  checkNoMeasurementEntailmentClaim,
  lintCorpus,
  lintRoundCorpus,
  MAX_PRESENTABLE_DIFFS,
} from "./corpus-lint"
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

describe("rationaleChoices — no shared prefix (LTY-WHY W2, #1102)", () => {
  it("fails when one candidate is a strict prefix of another", () => {
    const step = diagnosticStep({
      rationaleChoices: [
        { text: "borrowing avoids the copy" },
        { text: "borrowing avoids the copy entirely" },
      ],
    })
    const violations = lintCorpus([{ id: "e1", title: "t", steps: [step] }])
    expect(violations.some((v) => v.includes("share a full prefix"))).toBe(true)
  })

  it("fails on a non-adjacent shared prefix, not just neighboring candidates", () => {
    // The shape a check that only compares adjacent pairs would miss: the
    // colliding pair sits at positions 0 and 2, with an unrelated candidate
    // between them.
    const step = diagnosticStep({
      rationaleChoices: [
        { text: "the same prefix" },
        { text: "an unrelated middle candidate" },
        { text: "the same prefix, extended" },
      ],
    })
    const violations = lintCorpus([{ id: "e1", title: "t", steps: [step] }])
    expect(violations.some((v) => v.includes("share a full prefix"))).toBe(true)
  })

  it("fails when two candidates are identical — the degenerate prefix case", () => {
    const step = diagnosticStep({
      rationaleChoices: [
        { text: "identical candidate text" },
        { text: "identical candidate text" },
      ],
    })
    const violations = lintCorpus([{ id: "e1", title: "t", steps: [step] }])
    expect(violations.some((v) => v.includes("share a full prefix"))).toBe(true)
  })

  it("passes candidates that share a common start but diverge before either ends", () => {
    const step = diagnosticStep({
      rationaleChoices: [
        { text: "borrowing avoids the copy" },
        { text: "borrowing avoids the allocation" },
      ],
    })
    const violations = lintCorpus([{ id: "e1", title: "t", steps: [step] }])
    expect(violations).toEqual([])
  })
})

describe("a step's diff overlay (LTY-PATCH)", () => {
  it("never checks a step with no diff overlay at all", () => {
    const violations = lintCorpus([
      { id: "e1", title: "t", steps: [constructionStep()] },
    ])
    expect(violations).toEqual([])
  })

  it("passes a well-formed diff-shaped step", () => {
    const diffWitness: Block = typingBlockFromDiff({
      language: "rust",
      path: "src/example.rs",
      oldStart: 1,
      newStart: 1,
      segments: [
        { kind: "context", text: "line-a\n" },
        { kind: "addition", text: "line-b" },
      ],
    })
    const step = constructionStep({ blocks: [constraint, diffWitness] })
    const violations = lintCorpus([{ id: "e1", title: "t", steps: [step] }])
    expect(violations).toEqual([])
  })
})

describe("checkNoMeasurementEntailmentClaim — the two forbidden inferences (LTY-EXEC X4, Cor. 4.1)", () => {
  it("flags 'it timed out, therefore it is Θ(n²)'", () => {
    const violations = checkNoMeasurementEntailmentClaim(
      "It timed out, therefore it is Θ(n²).",
      "fixture"
    )
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain("It timed out, therefore it is Θ(n²).")
    expect(violations[0]).toContain("Cor. 4.1")
  })

  it("flags 'it ran in 4ms, therefore it is Θ(n)'", () => {
    const violations = checkNoMeasurementEntailmentClaim(
      "It ran in 4ms, therefore it is Θ(n).",
      "fixture"
    )
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain("Cor. 4.1")
  })

  it("passes a legitimate sentence mentioning a measurement and a class without claiming entailment", () => {
    const violations = checkNoMeasurementEntailmentClaim(
      "It timed out; the cost graph is what says why.",
      "fixture"
    )
    expect(violations).toEqual([])
  })

  it("does not flag a measurement term and a class term in different sentences", () => {
    const violations = checkNoMeasurementEntailmentClaim(
      "It timed out on the largest input. Separately, the register lists linear scans.",
      "fixture"
    )
    expect(violations).toEqual([])
  })

  it("is a heuristic with a reviewed, per-sentence escape", () => {
    const text = "It timed out, therefore it is Θ(n²)."
    const violations = checkNoMeasurementEntailmentClaim(text, "fixture", [
      { sentence: text, reason: "confirmed false positive for this fixture" },
    ])
    expect(violations).toEqual([])
  })

  it("wires into lintCorpus over a step's goal", () => {
    const step = diagnosticStep({
      goal: "Explain that it timed out, therefore it is Θ(n²).",
    })
    const violations = lintCorpus([{ id: "e1", title: "t", steps: [step] }])
    expect(violations.some((v) => v.includes("Cor. 4.1"))).toBe(true)
  })

  it("does not mistake an ordinary call ending in 'o' for a standalone Big-O token (review finding on #1240)", () => {
    const violations = checkNoMeasurementEntailmentClaim(
      "The slow foo(input) call should be cached.",
      "fixture"
    )
    expect(violations).toEqual([])
  })
})

describe("checkNoAssertedComplexityClassLiteral — no round anywhere holds a Θ string (G3, #1211, Prop. 2.1)", () => {
  it("flags a bare Θ( literal", () => {
    const violations = checkNoAssertedComplexityClassLiteral(
      "This rewrite is Θ(n log n).",
      "fixture"
    )
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain("Θ(n log n)")
    expect(violations[0]).toContain("Prop. 2.1")
  })

  it("flags a bare O( literal", () => {
    const violations = checkNoAssertedComplexityClassLiteral(
      "The naive approach is O(n^2).",
      "fixture"
    )
    expect(violations).toHaveLength(1)
  })

  it("flags a bare Ω( literal", () => {
    const violations = checkNoAssertedComplexityClassLiteral(
      "Any comparison sort is Ω(n log n) in the worst case.",
      "fixture"
    )
    expect(violations).toHaveLength(1)
  })

  it("does not mistake an ordinary call ending in 'o' for a standalone Big-O token", () => {
    const violations = checkNoAssertedComplexityClassLiteral(
      "The slow foo(input) call should be cached.",
      "fixture"
    )
    expect(violations).toEqual([])
  })

  it("does not flag prose describing a class in words rather than notation", () => {
    const violations = checkNoAssertedComplexityClassLiteral(
      "This rewrite is linear, trading space for the repeated search it avoids.",
      "fixture"
    )
    expect(violations).toEqual([])
  })

  it("is a heuristic with a reviewed, per-sentence escape for register text", () => {
    const text =
      "CW-P11 states that a rewrite off every dominant path cannot change Θ(T)."
    const violations = checkNoAssertedComplexityClassLiteral(text, "fixture", [
      {
        sentence: text,
        reason:
          "quotes CW-P11's own canonical wording, not an authored claim about a round",
      },
    ])
    expect(violations).toEqual([])
  })

  it("wires into lintCorpus over a step's goal", () => {
    const step = diagnosticStep({
      goal: "Recognize that this repair changes the class to Θ(n).",
    })
    const violations = lintCorpus([{ id: "e1", title: "t", steps: [step] }])
    expect(violations.some((v) => v.includes("Prop. 2.1"))).toBe(true)
  })

  it("finds no violations in the validated shim corpus — the real corpus holds no asserted class literal", () => {
    expect(
      lintCorpus(ALL_FIXTURE_EXERCISES).filter((v) => v.includes("Prop. 2.1"))
    ).toEqual([])
  })
})

describe("lintRoundCorpus — R5 (#1208), the round-shaped corpus lint", () => {
  function round(overrides: Partial<RoundCorpusEntry> = {}): RoundCorpusEntry {
    const constraints: ConstraintSet = [
      { dimension: "n", operator: "<=", bound: 1_000 },
    ]
    const diffSet: DiffSet = [
      {
        hunk: {
          path: "src/fixture/a.rs",
          oldStart: 1,
          newStart: 1,
          segments: [{ kind: "addition", text: "let repaired = true;" }],
        },
        propositionId: "CW-P1",
        admissible: true,
      },
      {
        hunk: {
          path: "src/fixture/b.rs",
          oldStart: 1,
          newStart: 1,
          segments: [{ kind: "addition", text: "let other = 1;" }],
        },
        propositionId: "CW-P2",
        admissible: false,
        distractorStatement: "swaps in a different repair entirely.",
      },
    ]
    return { id: "fixture-round", constraints, diffSet, ...overrides }
  }

  /**
   * The corpus-wide coverage checks (rows 3 and 4) are evaluated against
   * the *whole* real register (Rem. 7.1 / Rem. 10.2 both name "every
   * instantiable register entry", not "every entry the corpus under test
   * happens to cite") — by design, an isolated one- or two-round fixture
   * built to exercise a single per-round check will always be missing most
   * of the other fifteen propositions' coverage. Tests for a *per-round*
   * check's own "passes" case filter that expected noise out rather than
   * asserting the whole call returns no violations at all.
   */
  function withoutCoverageNoise(
    violations: ReadonlyArray<string>
  ): Array<string> {
    return violations.filter(
      (v) =>
        !v.includes("no corpus instance") &&
        !v.includes("no round where it is presented purely as a distractor")
    )
  }

  it("finds no violations in the real fixture round corpus", () => {
    expect(lintRoundCorpus(ALL_FIXTURE_ROUNDS)).toEqual([])
  })

  it("passes a single well-formed round in isolation", () => {
    expect(withoutCoverageNoise(lintRoundCorpus([round()]))).toEqual([])
  })

  describe("cardinality (Ax. 1.1, Rem. 1.1)", () => {
    it("fails when |C| = 0", () => {
      const violations = lintRoundCorpus([round({ constraints: [] })])
      expect(violations.some((v) => v.includes("0 < |C|"))).toBe(true)
    })

    it("fails when |C| > |D|", () => {
      const constraints: ConstraintSet = [
        { dimension: "n", operator: "<=", bound: 1_000 },
        { dimension: "m", operator: "<=", bound: 1_000 },
        { dimension: "k", operator: "<=", bound: 1_000 },
      ]
      const violations = lintRoundCorpus([round({ constraints })])
      expect(violations.some((v) => v.includes("|C| = 3 > |D| = 2"))).toBe(true)
    })

    it("fails when |D| > N", () => {
      const ids: ReadonlyArray<PropositionId> = [
        "CW-P1",
        "CW-P2",
        "CW-P3",
        "CW-P4",
        "CW-P5",
        "CW-P6",
      ]
      const diffSet: DiffSet = ids.map((propositionId, index) => ({
        hunk: {
          path: `src/fixture/${index}.rs`,
          oldStart: 1,
          newStart: 1,
          segments: [{ kind: "addition", text: `let v${index} = ${index};` }],
        },
        propositionId,
        admissible: index === 0,
        ...(index === 0 ? {} : { distractorStatement: `distractor ${index}` }),
      }))
      expect(diffSet.length).toBe(MAX_PRESENTABLE_DIFFS + 1)
      const violations = lintRoundCorpus([round({ diffSet })])
      expect(
        violations.some((v) => v.includes(`> N = ${MAX_PRESENTABLE_DIFFS}`))
      ).toBe(true)
    })

    it("passes the boundary |D| = N — five is a valid, maximal round (Thm. 10.1's k <= 5, review finding on #1283)", () => {
      const ids: ReadonlyArray<PropositionId> = [
        "CW-P1",
        "CW-P2",
        "CW-P3",
        "CW-P4",
        "CW-P5",
      ]
      const diffSet: DiffSet = ids.map((propositionId, index) => ({
        hunk: {
          path: `src/fixture/${index}.rs`,
          oldStart: 1,
          newStart: 1,
          segments: [{ kind: "addition", text: `let v${index} = ${index};` }],
        },
        propositionId,
        admissible: index === 0,
        ...(index === 0 ? {} : { distractorStatement: `distractor ${index}` }),
      }))
      expect(diffSet.length).toBe(MAX_PRESENTABLE_DIFFS)
      expect(
        withoutCoverageNoise(lintRoundCorpus([round({ diffSet })]))
      ).toEqual([])
    })
  })

  describe("schema re-validation (row 6: exactly one member of D is admissible, Ax. 1.1/R4)", () => {
    it("fails when a round's D has two admissible members", () => {
      const diffSet: DiffSet = [
        {
          hunk: {
            path: "src/fixture/a.rs",
            oldStart: 1,
            newStart: 1,
            segments: [{ kind: "addition", text: "let a = true;" }],
          },
          propositionId: "CW-P1",
          admissible: true,
        },
        {
          hunk: {
            path: "src/fixture/b.rs",
            oldStart: 1,
            newStart: 1,
            segments: [{ kind: "addition", text: "let b = true;" }],
          },
          propositionId: "CW-P2",
          admissible: true,
        },
      ]
      const violations = lintRoundCorpus([round({ diffSet })])
      expect(
        violations.some((v) => v.includes("exactly one member of D"))
      ).toBe(true)
    })
  })

  describe("discriminability (Prop. 6.1) — deliberately not checked", () => {
    // Two straight review rounds on #1283 (chatgpt-codex-connector) showed
    // every attempt at a mechanical Prop. 6.1 check unsound given this
    // data model (see the doc comment above citationsOfRound in
    // corpus-lint.ts for the full trace and the tracked follow-up). These
    // tests document the deferral: none of the shapes a discriminability
    // check might once have flagged produce a Prop. 6.1 violation now.
    it("does not flag two diff-set members sharing the same propositionId, admissible or not", () => {
      const diffSet: DiffSet = [
        {
          hunk: {
            path: "src/fixture/a.rs",
            oldStart: 1,
            newStart: 1,
            segments: [{ kind: "addition", text: "let a = true;" }],
          },
          propositionId: "CW-P1",
          admissible: true,
        },
        {
          hunk: {
            path: "src/fixture/b.rs",
            oldStart: 1,
            newStart: 1,
            segments: [{ kind: "addition", text: "let b = true;" }],
          },
          propositionId: "CW-P1",
          admissible: false,
          distractorStatement:
            "a different rewrite witnessing the same proposition, only one of which restores this round's own budget.",
        },
      ]
      expect(
        withoutCoverageNoise(lintRoundCorpus([round({ diffSet })])).filter(
          (v) => v.includes("Prop. 6.1")
        )
      ).toEqual([])
    })

    it("passes when every diff-set member carries a distinct propositionId", () => {
      expect(withoutCoverageNoise(lintRoundCorpus([round()]))).toEqual([])
    })
  })

  describe("citation resolution (Rem. 7.1)", () => {
    it("fails when a diff-set member's propositionId does not resolve against the register", () => {
      // Deliberately not "CW-Pn"-shaped: scripts/check-proposition-citations.ts
      // scans every tracked file for that literal pattern, and this file is
      // not one of the proposition-register module's own tests.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- deliberately injecting a value PropositionId's own type rules out, to prove checkCitations' runtime dangling-citation check fires even though DiffSetMember's compile-time type would normally prevent this.
      const badId = "not-a-real-proposition-id" as PropositionId
      const diffSet: DiffSet = [
        {
          hunk: {
            path: "src/fixture/a.rs",
            oldStart: 1,
            newStart: 1,
            segments: [{ kind: "addition", text: "let a = true;" }],
          },
          propositionId: badId,
          admissible: true,
        },
        {
          hunk: {
            path: "src/fixture/b.rs",
            oldStart: 1,
            newStart: 1,
            segments: [{ kind: "addition", text: "let b = true;" }],
          },
          propositionId: "CW-P2",
          admissible: false,
          distractorStatement: "a plausible but wrong repair.",
        },
      ]
      const violations = lintRoundCorpus([round({ diffSet })])
      expect(violations.some((v) => v.includes("dangling citation"))).toBe(true)
    })
  })

  describe("coverage — an admissible instance (Rem. 7.1, row 3)", () => {
    it("fails when an active register entry is never a round's admissible member", () => {
      // Rem. 10.2/Def. 10.2 tie "positive transfer" to a *correct*
      // selection, so row 3's coverage is about admissible instances
      // specifically — removing round-cw-p16 (CW-P16's only admissible
      // appearance) fails row 3 even though CW-P16 still appears as a
      // distractor in round-cw-p15, which is left untouched on purpose:
      // that isolates this from row 4's own separate obligation.
      const withoutCwP16Admissible = ALL_FIXTURE_ROUNDS.filter(
        (r) => r.id !== "round-cw-p16"
      )
      const violations = lintRoundCorpus(withoutCwP16Admissible)
      expect(
        violations.some(
          (v) => v.includes("CW-P16") && v.includes("no corpus instance")
        )
      ).toBe(true)
    })

    it("fails when a register entry appears only as a distractor — that alone is not an admissible instance", () => {
      // A proposition that is *only* ever a distractor must still fail row
      // 3 (Codex review finding on #1283): being cited on a non-admissible
      // member is not "having a corpus instance" in Rem. 10.2's sense.
      const withoutCwP1Admissible = ALL_FIXTURE_ROUNDS.filter(
        (r) => r.id !== "round-cw-p1"
      )
      const violations = lintRoundCorpus(withoutCwP1Admissible)
      expect(
        violations.some(
          (v) => v.includes("CW-P1") && v.includes("no corpus instance")
        )
      ).toBe(true)
    })
  })

  describe("coverage — distractor role required (Rem. 10.2, Prop. 10.1, row 4)", () => {
    it("fails when an active register entry never appears purely as a distractor", () => {
      // round-cw-p16 is the only round presenting CW-P1 as a distractor;
      // CW-P1 is still admissible in round-cw-p1, so this isolates row 4
      // without also breaking row 3's "any instance" coverage for CW-P1.
      const withoutCwP16 = ALL_FIXTURE_ROUNDS.filter(
        (r) => r.id !== "round-cw-p16"
      )
      const violations = lintRoundCorpus(withoutCwP16)
      expect(
        violations.some(
          (v) =>
            v.includes("CW-P1") &&
            v.includes("no round") &&
            v.includes("distractor")
        )
      ).toBe(true)
    })
  })

  describe("no authored Θ string anywhere (Prop. 2.1, row 7)", () => {
    it("fails when a distractorStatement asserts a complexity class literal", () => {
      const diffSet: DiffSet = [
        {
          hunk: {
            path: "src/fixture/a.rs",
            oldStart: 1,
            newStart: 1,
            segments: [{ kind: "addition", text: "let a = true;" }],
          },
          propositionId: "CW-P1",
          admissible: true,
        },
        {
          hunk: {
            path: "src/fixture/b.rs",
            oldStart: 1,
            newStart: 1,
            segments: [{ kind: "addition", text: "let b = true;" }],
          },
          propositionId: "CW-P2",
          admissible: false,
          distractorStatement: "this rewrite is Θ(n²), not a real repair.",
        },
      ]
      const violations = lintRoundCorpus([round({ diffSet })])
      expect(violations.some((v) => v.includes("Prop. 2.1"))).toBe(true)
    })

    it("fails when a hunk segment's own text asserts a complexity class literal (review finding on #1283)", () => {
      // A round's diff is displayed source, not distractorStatement's own
      // prose, but a segment's text can still carry a comment — and Prop.
      // 2.1 forbids an asserted class literal anywhere, not just in prose.
      const diffSet: DiffSet = [
        {
          hunk: {
            path: "src/fixture/a.rs",
            oldStart: 1,
            newStart: 1,
            segments: [
              {
                kind: "addition",
                text: "let a = true; // this repair is Θ(n log n)",
              },
            ],
          },
          propositionId: "CW-P1",
          admissible: true,
        },
        {
          hunk: {
            path: "src/fixture/b.rs",
            oldStart: 1,
            newStart: 1,
            segments: [{ kind: "addition", text: "let b = true;" }],
          },
          propositionId: "CW-P2",
          admissible: false,
          distractorStatement: "a plausible but wrong repair.",
        },
      ]
      const violations = lintRoundCorpus([round({ diffSet })])
      expect(violations.some((v) => v.includes("Prop. 2.1"))).toBe(true)
    })

    it("finds no asserted class literal in the real fixture round corpus", () => {
      expect(
        lintRoundCorpus(ALL_FIXTURE_ROUNDS).filter((v) =>
          v.includes("Prop. 2.1")
        )
      ).toEqual([])
    })
  })
})
