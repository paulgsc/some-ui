import {
  claimOf,
  claimPoolOf,
  READING_OPTION_COUNT,
  readingHunkOf,
  readingProbeOf,
} from "@leetype/lib/leetype/reading-probe"
import type { Claim } from "@leetype/lib/leetype/reading-probe"
import type { DiagnosticStep, Step } from "@leetype/types/exercise"
import { typingBlockFromDiff } from "@leetype/types/exercise"
import { describe, expect, it } from "vitest"

const DIAGNOSTIC: DiagnosticStep = {
  id: "probe-diagnostic",
  goal: "Guard the division so a zero count returns instead of panicking.",
  concepts: ["precondition-guard"],
  blocks: [
    {
      kind: "trace",
      headline: "PANIC",
      observations: [{ label: "count", value: "0" }],
    },
    typingBlockFromDiff({
      language: "rust",
      path: "src/stats/average.rs",
      oldStart: 10,
      newStart: 10,
      segments: [
        {
          kind: "context",
          text: "fn average(total: i32, count: i32) -> i32 {\n",
        },
        { kind: "deletion", text: "    total / count\n" },
        {
          kind: "addition",
          text: "    if count == 0 { 0 } else { total / count }\n",
        },
        { kind: "context", text: "}" },
      ],
    }),
  ],
  rationale: {
    cause: "the function divides by count unconditionally",
    whyRepairDiscriminates:
      "only an early return avoids the undefined division",
  },
}

const CONSTRUCTION: Step = {
  id: "probe-construction",
  goal: "Hold the lookup as a place rather than a value.",
  concepts: ["entry-api", "precondition-guard"],
  obligation: "a lookup can be held as a place, not a value",
  blocks: [
    { kind: "prompt", lines: ["The map is looked up twice."] },
    { kind: "typing", source: "map.entry(key)", language: "rust" },
  ],
}

const GOAL_ONLY: Step = {
  id: "probe-goal-only",
  goal: "Return the index the value belongs at.",
  concepts: [],
  blocks: [{ kind: "typing", source: "left", language: "rust" }],
}

/** Distinct claims with no shared concepts, so distractor ordering is the only variable. */
const FAR_POOL: ReadonlyArray<Claim> = [
  { stepId: "far-1", family: "goal", text: "far one", concepts: ["unrelated"] },
  { stepId: "far-2", family: "goal", text: "far two", concepts: ["unrelated"] },
  {
    stepId: "far-3",
    family: "goal",
    text: "far three",
    concepts: ["unrelated"],
  },
  {
    stepId: "far-4",
    family: "goal",
    text: "far four",
    concepts: ["unrelated"],
  },
]

describe("claimOf", () => {
  it("reads a diagnostic step's cause, and carries its discriminating reason", () => {
    expect(claimOf(DIAGNOSTIC)).toMatchObject({
      family: "diagnostic",
      text: "the function divides by count unconditionally",
      justification: "only an early return avoids the undefined division",
    })
  })

  it("reads a construction step's obligation, with no justification to offer", () => {
    const claim = claimOf(CONSTRUCTION)
    expect(claim.family).toBe("construction")
    expect(claim.text).toBe("a lookup can be held as a place, not a value")
    expect(claim.justification).toBeUndefined()
  })

  // The reading surface is the *only* surface on a phone, so a step it could
  // not pose would be a dead end rather than a degraded card. `goal` is
  // required by the schema, which is what makes this total.
  it("falls back to the goal, so every schema-valid step is posable", () => {
    expect(claimOf(GOAL_ONLY)).toMatchObject({
      family: "goal",
      text: "Return the index the value belongs at.",
    })
  })
})

describe("readingHunkOf", () => {
  it("derives rows, kinds and two-column line numbers from the segments", () => {
    const hunk = readingHunkOf(DIAGNOSTIC)
    expect(hunk).not.toBeNull()
    expect(hunk?.path).toBe("src/stats/average.rs")
    expect(hunk?.rows.map((row) => row.kind)).toEqual([
      "context",
      "del",
      "add",
      "context",
    ])
    // A del row occupies the old column only; an add row the new column only.
    expect(hunk?.rows.map((row) => [row.oldLine, row.newLine])).toEqual([
      [10, 10],
      [11, undefined],
      [undefined, 11],
      [12, 12],
    ])
  })

  it("strips the ‹…› context delimiters the engine reads and the reader must not see", () => {
    const rows = readingHunkOf(DIAGNOSTIC)?.rows ?? []
    expect(rows.every((row) => !row.text.includes("‹"))).toBe(true)
    expect(rows[0]?.text).toBe("fn average(total: i32, count: i32) -> i32 {")
  })

  // A step with no `diff` overlay has no delta to point at. Rendering every
  // line as context is the honest answer, and it is what keeps the reading
  // surface playable across the whole corpus rather than its patch-shaped
  // part.
  it("degrades a step with no diff overlay into an all-context card", () => {
    const hunk = readingHunkOf(CONSTRUCTION)
    expect(hunk?.path).toBeUndefined()
    expect(hunk?.rows.map((row) => row.kind)).toEqual(["context"])
    expect(hunk?.rows[0]?.text).toBe("map.entry(key)")
  })
})

describe("readingProbeOf", () => {
  it("poses the step's own claim as the answer, among distractors", () => {
    const probe = readingProbeOf(DIAGNOSTIC, FAR_POOL, 7)
    expect(probe.options).toHaveLength(READING_OPTION_COUNT)
    expect(probe.answerId).toBe(DIAGNOSTIC.id)
    const answer = probe.options.find((option) => option.id === probe.answerId)
    expect(answer?.text).toBe("the function divides by count unconditionally")
    expect(probe.justification).toBe(
      "only an early return avoids the undefined division"
    )
  })

  it("asks each family its own question", () => {
    expect(readingProbeOf(DIAGNOSTIC, FAR_POOL, 1).prompt).toMatch(/repair/i)
    expect(readingProbeOf(CONSTRUCTION, FAR_POOL, 1).prompt).toMatch(
      /establish/i
    )
  })

  // Replay is the whole reason this package specifies its own generator
  // rather than calling Math.random: a story, a test and a bug report from a
  // seed must all show one screen.
  it("is deterministic in the seed, and varies with it", () => {
    const first = readingProbeOf(DIAGNOSTIC, FAR_POOL, 99)
    const again = readingProbeOf(DIAGNOSTIC, FAR_POOL, 99)
    expect(again.options).toEqual(first.options)

    const seeds = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) =>
      readingProbeOf(DIAGNOSTIC, FAR_POOL, seed)
        .options.map((option) => option.id)
        .join(",")
    )
    expect(new Set(seeds).size).toBeGreaterThan(1)
  })

  // A distractor you can eliminate without reading the code makes the card
  // pass-without-reading, which probes nothing.
  it("prefers a distractor that shares a concept with the step", () => {
    const pool = [...claimPoolOf([CONSTRUCTION]), ...FAR_POOL]
    const probe = readingProbeOf(DIAGNOSTIC, pool, 3, 2)
    expect(probe.options.map((option) => option.id).sort()).toEqual(
      [CONSTRUCTION.id, DIAGNOSTIC.id].sort()
    )
  })

  // The families are authored in visibly different registers — a lowercase
  // subordinate clause, a lowercase claim, a sentence-cased imperative ending
  // in a period. An odd one out is spottable without reading a line of the
  // code, which is the same "pass without reading" failure a category-error
  // distractor is, wearing typography instead.
  it("prefers a distractor from the answer's own family, over a nearer one from another", () => {
    const sameFamily: Claim = {
      stepId: "other-diagnostic",
      family: "diagnostic",
      text: "the index runs one past the end of the slice",
      concepts: ["unrelated"],
    }
    const nearerOtherFamily: Claim = {
      stepId: "near-construction",
      family: "construction",
      text: "a guard can be hoisted out of the loop",
      concepts: ["precondition-guard"],
    }
    const probe = readingProbeOf(
      DIAGNOSTIC,
      [nearerOtherFamily, sameFamily],
      3,
      2
    )
    expect(probe.options.map((option) => option.id)).toContain(
      sameFamily.stepId
    )
    expect(probe.options.map((option) => option.id)).not.toContain(
      nearerOtherFamily.stepId
    )
  })

  it("reports which family the answer came from", () => {
    expect(readingProbeOf(DIAGNOSTIC, FAR_POOL, 1).family).toBe("diagnostic")
    expect(readingProbeOf(CONSTRUCTION, FAR_POOL, 1).family).toBe(
      "construction"
    )
    expect(readingProbeOf(GOAL_ONLY, FAR_POOL, 1).family).toBe("goal")
  })

  it("never offers the step's own claim twice, or a duplicate sentence", () => {
    const duplicated: ReadonlyArray<Claim> = [
      ...FAR_POOL,
      { stepId: "echo", family: "goal", text: "far one", concepts: [] },
      {
        stepId: "same-text",
        family: "goal",
        text: "the function divides by count unconditionally",
        concepts: [],
      },
    ]
    const probe = readingProbeOf(DIAGNOSTIC, duplicated, 11)
    const texts = probe.options.map((option) => option.text)
    expect(new Set(texts).size).toBe(texts.length)
  })

  // A corpus too small to supply distractors yields a shorter card rather
  // than repeated or invented ones.
  it("yields fewer options rather than padding an exhausted pool", () => {
    const probe = readingProbeOf(DIAGNOSTIC, FAR_POOL.slice(0, 1), 5)
    expect(probe.options).toHaveLength(2)
    expect(probe.options.some((option) => option.id === probe.answerId)).toBe(
      true
    )
  })
})

describe("claimPoolOf", () => {
  it("carries each step's concepts along with its claim", () => {
    expect(claimPoolOf([DIAGNOSTIC, CONSTRUCTION])).toEqual([
      expect.objectContaining({
        stepId: DIAGNOSTIC.id,
        concepts: ["precondition-guard"],
      }),
      expect.objectContaining({
        stepId: CONSTRUCTION.id,
        concepts: ["entry-api", "precondition-guard"],
      }),
    ])
  })
})
