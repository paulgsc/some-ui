import type { RoundCorpusEntry } from "@leetype/lib/leetype/exercises/corpus-lint"
import {
  checkNoAssertedComplexityClassLiteral,
  checkNoMeasurementEntailmentClaim,
  lintCorpus,
  lintRoundCorpus,
  MAX_PRESENTABLE_DIFFS,
} from "@leetype/lib/leetype/exercises/corpus-lint"
import { ALL_FIXTURE_EXERCISES } from "@leetype/lib/leetype/exercises/index"
import type { PropositionId } from "@leetype/lib/leetype/proposition-register/generated"
import { ALL_FIXTURE_ROUNDS } from "@leetype/lib/leetype/round-corpus"
import type { ConstraintSet } from "@leetype/types/constraint"
import type {
  Block,
  ConstructionStep,
  DiagnosticStep,
  Step,
} from "@leetype/types/exercise"
import { typingBlockFromDiff } from "@leetype/types/exercise"
import type { DiffSet, DiffSetMember } from "@leetype/types/round"
import { describe, expect, it } from "vitest"

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

/** Lints `steps` as one exercise. */
function lintSteps(...steps: Array<Step>): Array<string> {
  return lintCorpus([{ id: "e1", title: "t", steps }])
}

function hasViolation(
  violations: ReadonlyArray<string>,
  ...fragments: ReadonlyArray<string>
): boolean {
  return violations.some((v) => fragments.every((f) => v.includes(f)))
}

describe("lintCorpus — the real corpus", () => {
  it("finds no violations in the validated shim corpus", () => {
    expect(lintCorpus(ALL_FIXTURE_EXERCISES)).toEqual([])
  })
})

describe("lintCorpus — deliberately malformed fixtures", () => {
  it.each<{ name: string; steps: Array<Step>; fragment: string }>([
    {
      name: "rationale.whyRepairDiscriminates restates rationale.cause",
      steps: [
        diagnosticStep({
          rationale: {
            cause: "cursor never advances toward input.len()",
            whyRepairDiscriminates: "cursor never advances toward input.len()",
          },
        }),
      ],
      fragment: "say the same",
    },
    {
      name: "obligation quotes the witness's code back as prose",
      steps: [
        constructionStep({
          obligation: "call map.entry(key) to get the place",
        }),
      ],
      fragment: "quotes the witness",
    },
    {
      // Re-validated through the strict DiagnosticStepSchema.
      name: "a diagnostic step's repair runs past the bounded-answer budget",
      steps: [
        diagnosticStep({
          blocks: [
            failure,
            { kind: "typing", source: "a".repeat(51), language: "rust" },
          ],
        }),
      ],
      fragment: "typed characters",
    },
    {
      // Re-validated through the strict ConstructionStepSchema.
      name: "a construction step has no evidence besides its witness",
      steps: [constructionStep({ blocks: [witness] })],
      fragment: "at least one block besides its witness",
    },
    {
      name: "a step's evidence exceeds PromptPanel's row budget",
      steps: [
        diagnosticStep({
          blocks: [
            {
              kind: "trace",
              observations: Array.from({ length: 8 }, (_, i) => ({
                label: `o${i}`,
                value: `v${i}`,
              })),
            },
            repair,
          ],
        }),
      ],
      fragment: "evidence rows",
    },
    {
      name: "concepts is empty",
      steps: [diagnosticStep({ concepts: [] })],
      fragment: "concepts is empty",
    },
    {
      name: "transferFrom references a step id not in the corpus",
      steps: [diagnosticStep({ transferFrom: "does-not-exist" })],
      fragment: "is not a step id",
    },
    {
      name: "transferFrom references the step itself",
      steps: [diagnosticStep({ transferFrom: "story-diagnostic" })],
      fragment: "references itself",
    },
    {
      name: "transferFrom's target shares no concept id",
      steps: [
        constructionStep({ id: "source", concepts: ["other-concept"] }),
        diagnosticStep({ transferFrom: "source" }),
      ],
      fragment: "shares no concept id",
    },
  ])("fails when $name", ({ steps, fragment }) => {
    expect(hasViolation(lintSteps(...steps), fragment)).toBe(true)
  })

  it("fails when two exercises share a step id, which indexStepsById cannot detect itself", () => {
    // A Map would let the later step shadow the earlier one silently.
    const violations = lintCorpus([
      {
        id: "e1",
        title: "t1",
        steps: [constructionStep({ id: "dup", concepts: ["a"] })],
      },
      {
        id: "e2",
        title: "t2",
        steps: [diagnosticStep({ id: "dup", concepts: ["b"] })],
      },
    ])
    expect(hasViolation(violations, 'step id "dup" is used by both')).toBe(true)
  })

  it.each<[string, Array<Step>]>([
    [
      "transferFrom's target shares a concept id",
      [
        constructionStep({ id: "source", concepts: ["shared"] }),
        diagnosticStep({ transferFrom: "source", concepts: ["shared"] }),
      ],
    ],
    [
      "a well-formed diagnostic step and a well-formed construction step",
      [diagnosticStep(), constructionStep()],
    ],
    ["a step with no diff overlay at all", [constructionStep()]],
    [
      "a well-formed diff-shaped step",
      [
        constructionStep({
          blocks: [
            constraint,
            typingBlockFromDiff({
              language: "rust",
              path: "src/example.rs",
              oldStart: 1,
              newStart: 1,
              segments: [
                { kind: "context", text: "line-a\n" },
                { kind: "addition", text: "line-b" },
              ],
            }),
          ],
        }),
      ],
    ],
  ])("passes %s", (_name, steps) => {
    expect(lintSteps(...steps)).toEqual([])
  })
})

describe("rationaleChoices — no shared prefix (LTY-WHY W2)", () => {
  it.each([
    [
      "one candidate is a strict prefix of another",
      ["borrowing avoids the copy", "borrowing avoids the copy entirely"],
    ],
    [
      // Positions 0 and 2: a neighbours-only check would miss it.
      "the shared prefix is non-adjacent",
      [
        "the same prefix",
        "an unrelated middle candidate",
        "the same prefix, extended",
      ],
    ],
    [
      "two candidates are identical (the degenerate prefix case)",
      ["identical candidate text", "identical candidate text"],
    ],
  ])("fails when %s", (_name, texts) => {
    const step = diagnosticStep({
      rationaleChoices: texts.map((text) => ({ text })),
    })
    expect(hasViolation(lintSteps(step), "share a full prefix")).toBe(true)
  })

  it("passes candidates that share a common start but diverge before either ends", () => {
    const step = diagnosticStep({
      rationaleChoices: [
        { text: "borrowing avoids the copy" },
        { text: "borrowing avoids the allocation" },
      ],
    })
    expect(lintSteps(step)).toEqual([])
  })
})

describe("checkNoMeasurementEntailmentClaim — the two forbidden inferences (LTY-EXEC X4, Cor. 4.1)", () => {
  it.each([
    "It timed out, therefore it is Θ(n²).",
    "It ran in 4ms, therefore it is Θ(n).",
  ])("flags %j", (text) => {
    const violations = checkNoMeasurementEntailmentClaim(text, "fixture")
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain(text)
    expect(violations[0]).toContain("Cor. 4.1")
  })

  it.each([
    [
      "a measurement and a class without claiming entailment",
      "It timed out; the cost graph is what says why.",
    ],
    [
      "a measurement term and a class term in different sentences",
      "It timed out on the largest input. Separately, the register lists linear scans.",
    ],
    [
      "an ordinary call ending in 'o', not a standalone Big-O token",
      "The slow foo(input) call should be cached.",
    ],
  ])("does not flag %s", (_name, text) => {
    expect(checkNoMeasurementEntailmentClaim(text, "fixture")).toEqual([])
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
    expect(hasViolation(lintSteps(step), "Cor. 4.1")).toBe(true)
  })
})

describe("checkNoAssertedComplexityClassLiteral — no round anywhere holds a Θ string (Prop. 2.1)", () => {
  it.each([
    ["Θ(", "This rewrite is Θ(n log n).", "Θ(n log n)"],
    ["O(", "The naive approach is O(n^2).", "O(n^2)"],
    [
      "Ω(",
      "Any comparison sort is Ω(n log n) in the worst case.",
      "Ω(n log n)",
    ],
  ])("flags a bare %s literal", (_symbol, text, literal) => {
    const violations = checkNoAssertedComplexityClassLiteral(text, "fixture")
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain(literal)
    expect(violations[0]).toContain("Prop. 2.1")
  })

  it.each([
    [
      "an ordinary call ending in 'o' for a standalone Big-O token",
      "The slow foo(input) call should be cached.",
    ],
    [
      "prose describing a class in words rather than notation",
      "This rewrite is linear, trading space for the repeated search it avoids.",
    ],
  ])("does not mistake %s", (_name, text) => {
    expect(checkNoAssertedComplexityClassLiteral(text, "fixture")).toEqual([])
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
    expect(hasViolation(lintSteps(step), "Prop. 2.1")).toBe(true)
  })

  it("finds no violations in the validated shim corpus — the real corpus holds no asserted class literal", () => {
    expect(
      lintCorpus(ALL_FIXTURE_EXERCISES).filter((v) => v.includes("Prop. 2.1"))
    ).toEqual([])
  })
})

describe("lintRoundCorpus — the round-shaped corpus lint (R5)", () => {
  /** A diff-set member with a one-line hunk at `src/fixture/<name>.rs`. */
  function member(
    name: string,
    fields: Omit<DiffSetMember, "hunk">,
    text = `let ${name} = true;`
  ): DiffSetMember {
    return {
      hunk: {
        path: `src/fixture/${name}.rs`,
        oldStart: 1,
        newStart: 1,
        segments: [{ kind: "addition", text }],
      },
      ...fields,
    }
  }

  /** The usual second member: a CW-P2 distractor. */
  const distractorB = member("b", {
    propositionId: "CW-P2",
    admissible: false,
    distractorStatement: "a plausible but wrong repair.",
  })

  function round(overrides: Partial<RoundCorpusEntry> = {}): RoundCorpusEntry {
    const constraints: ConstraintSet = [
      { dimension: "n", operator: "<=", bound: 1_000 },
    ]
    const diffSet: DiffSet = [
      member(
        "a",
        { propositionId: "CW-P1", admissible: true },
        "let repaired = true;"
      ),
      member(
        "b",
        {
          propositionId: "CW-P2",
          admissible: false,
          distractorStatement: "swaps in a different repair entirely.",
        },
        "let other = 1;"
      ),
    ]
    return { id: "fixture-round", constraints, diffSet, ...overrides }
  }

  /** One admissible member followed by distractors, one per id. */
  function diffSetOf(ids: ReadonlyArray<PropositionId>): DiffSet {
    return ids.map((propositionId, index) =>
      member(
        String(index),
        {
          propositionId,
          admissible: index === 0,
          ...(index === 0
            ? {}
            : { distractorStatement: `distractor ${index}` }),
        },
        `let v${index} = ${index};`
      )
    )
  }

  /**
   * Coverage checks run against the whole register, so a one-round fixture
   * always misses most propositions' coverage; per-round "passes" cases
   * filter that noise out.
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

  it("passes a single well-formed round with distinct propositionIds in isolation", () => {
    expect(withoutCoverageNoise(lintRoundCorpus([round()]))).toEqual([])
  })

  describe("cardinality (Ax. 1.1, Rem. 1.1)", () => {
    it("fails when |C| = 0", () => {
      const violations = lintRoundCorpus([round({ constraints: [] })])
      expect(hasViolation(violations, "0 < |C|")).toBe(true)
    })

    it("fails when |C| > |D|", () => {
      const constraints: ConstraintSet = ["n", "m", "k"].map(
        (dimension): ConstraintSet[number] => ({
          dimension,
          operator: "<=",
          bound: 1_000,
        })
      )
      const violations = lintRoundCorpus([round({ constraints })])
      expect(hasViolation(violations, "|C| = 3 > |D| = 2")).toBe(true)
    })

    it("fails when |D| > N", () => {
      const diffSet = diffSetOf([
        "CW-P1",
        "CW-P2",
        "CW-P3",
        "CW-P4",
        "CW-P5",
        "CW-P6",
      ])
      expect(diffSet.length).toBe(MAX_PRESENTABLE_DIFFS + 1)
      const violations = lintRoundCorpus([round({ diffSet })])
      expect(hasViolation(violations, `> N = ${MAX_PRESENTABLE_DIFFS}`)).toBe(
        true
      )
    })

    it("passes the boundary |D| = N — five is a valid, maximal round (Thm. 10.1's k <= 5)", () => {
      const diffSet = diffSetOf(["CW-P1", "CW-P2", "CW-P3", "CW-P4", "CW-P5"])
      expect(diffSet.length).toBe(MAX_PRESENTABLE_DIFFS)
      expect(
        withoutCoverageNoise(lintRoundCorpus([round({ diffSet })]))
      ).toEqual([])
    })
  })

  describe("schema re-validation (exactly one member of D is admissible, Ax. 1.1)", () => {
    it("fails when a round's D has two admissible members", () => {
      const diffSet: DiffSet = [
        member("a", { propositionId: "CW-P1", admissible: true }),
        member("b", { propositionId: "CW-P2", admissible: true }),
      ]
      const violations = lintRoundCorpus([round({ diffSet })])
      expect(hasViolation(violations, "exactly one member of D")).toBe(true)
    })
  })

  describe("discriminability (Prop. 6.1) — deliberately not checked", () => {
    // No mechanical Prop. 6.1 check is sound on this data model (see the
    // comment above citationsOfRound in corpus-lint.ts).
    it("does not flag two diff-set members sharing the same propositionId, admissible or not", () => {
      const diffSet: DiffSet = [
        member("a", { propositionId: "CW-P1", admissible: true }),
        member("b", {
          propositionId: "CW-P1",
          admissible: false,
          distractorStatement:
            "a different rewrite witnessing the same proposition, only one of which restores this round's own budget.",
        }),
      ]
      expect(
        withoutCoverageNoise(lintRoundCorpus([round({ diffSet })])).filter(
          (v) => v.includes("Prop. 6.1")
        )
      ).toEqual([])
    })
  })

  describe("citation resolution (Rem. 7.1)", () => {
    it("fails when a diff-set member's propositionId does not resolve against the register", () => {
      // Not "CW-Pn"-shaped, so check-proposition-citations.ts ignores it.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- deliberately injecting a value PropositionId's own type rules out, to prove checkCitations' runtime dangling-citation check fires even though DiffSetMember's compile-time type would normally prevent this.
      const badId = "not-a-real-proposition-id" as PropositionId
      const diffSet: DiffSet = [
        member("a", { propositionId: badId, admissible: true }),
        distractorB,
      ]
      const violations = lintRoundCorpus([round({ diffSet })])
      expect(hasViolation(violations, "dangling citation")).toBe(true)
    })
  })

  describe("coverage — an instance as μ(d) of any member (Rem. 7.1, Rem. 10.2)", () => {
    it("fails when an active register entry is cited by no member of any round", () => {
      // CW-P16 is μ of round-cw-p16's admissible member and of
      // round-cw-p15's distractor; removing both leaves it uncited.
      const withoutCwP16 = ALL_FIXTURE_ROUNDS.filter(
        (r) => r.id !== "round-cw-p16" && r.id !== "round-cw-p15"
      )
      expect(
        hasViolation(
          lintRoundCorpus(withoutCwP16),
          "CW-P16",
          "no corpus instance"
        )
      ).toBe(true)
    })

    it("counts a register entry that appears only as a distractor", () => {
      // Without round-cw-p1, CW-P1 is only round-cw-p16's distractor, which
      // still counts (Rem. 10.2 puts no condition on d).
      const withoutCwP1Admissible = ALL_FIXTURE_ROUNDS.filter(
        (r) => r.id !== "round-cw-p1"
      )
      expect(
        hasViolation(
          lintRoundCorpus(withoutCwP1Admissible),
          "CW-P1 ",
          "no corpus instance"
        )
      ).toBe(false)
    })
  })

  describe("coverage — distractor role required (Rem. 10.2, Prop. 10.1)", () => {
    it("fails when an active register entry never appears purely as a distractor", () => {
      // round-cw-p16 is the only round presenting CW-P1 as a distractor;
      // CW-P1 stays admissible in round-cw-p1, isolating this check.
      const withoutCwP16 = ALL_FIXTURE_ROUNDS.filter(
        (r) => r.id !== "round-cw-p16"
      )
      expect(
        hasViolation(
          lintRoundCorpus(withoutCwP16),
          "CW-P1",
          "no round",
          "distractor"
        )
      ).toBe(true)
    })
  })

  describe("no authored Θ string anywhere (Prop. 2.1)", () => {
    it.each<{ name: string; diffSet: DiffSet; fragments: Array<string> }>([
      {
        name: "a distractorStatement",
        diffSet: [
          member("a", { propositionId: "CW-P1", admissible: true }),
          member("b", {
            propositionId: "CW-P2",
            admissible: false,
            distractorStatement: "this rewrite is Θ(n²), not a real repair.",
          }),
        ],
        fragments: ["Prop. 2.1"],
      },
      {
        name: "a propositionGloss",
        diffSet: [
          member("a", {
            propositionId: "CW-P1",
            admissible: true,
            propositionGloss: "This rewrite is Θ(n).",
          }),
          distractorB,
        ],
        fragments: ["propositionGloss", "Prop. 2.1"],
      },
      {
        // Displayed source, but a segment can carry a comment.
        name: "a hunk segment's own text",
        diffSet: [
          member(
            "a",
            { propositionId: "CW-P1", admissible: true },
            "let a = true; // this repair is Θ(n log n)"
          ),
          distractorB,
        ],
        fragments: ["Prop. 2.1"],
      },
    ])(
      "fails when $name asserts a complexity class literal",
      ({ diffSet, fragments }) => {
        const violations = lintRoundCorpus([round({ diffSet })])
        expect(hasViolation(violations, ...fragments)).toBe(true)
      }
    )

    it("finds no asserted class literal in the real fixture round corpus", () => {
      expect(
        lintRoundCorpus(ALL_FIXTURE_ROUNDS).filter((v) =>
          v.includes("Prop. 2.1")
        )
      ).toEqual([])
    })
  })
})
