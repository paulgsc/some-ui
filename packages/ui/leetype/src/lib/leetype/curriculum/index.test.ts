import {
  availableLanguages,
  compareByCurriculum,
  CURRICULUM_STAGES,
  hasCurriculum,
  resolveLanguage,
  STAGE_META,
  stageOrder,
} from "@leetype/lib/leetype/curriculum"
import type {
  Challenge,
  ChallengeCurriculum,
  CurriculumStage,
} from "@leetype/types/leetype"
import { describe, expect, it } from "vitest"

function curriculum(
  overrides: Partial<ChallengeCurriculum> = {}
): ChallengeCurriculum {
  return {
    stage: "apply",
    step: 1,
    totalSteps: 10,
    insight: "One insight.",
    learningObjectives: [],
    conceptsIntroduced: [],
    conceptsReinforced: [],
    dependsOn: [],
    completionCriteria: [],
    targetProblem: "Implement a lock-free Treiber stack.",
    ...overrides,
  }
}

function challenge(overrides: Partial<Challenge> = {}): Challenge {
  return {
    id: "ex-1",
    title: "Ownership review",
    description: "Move a value between two functions.",
    difficulty: "easy",
    mode: "data-structure",
    tags: [],
    codePaths: { rust: "/leetype/samples/ex-1.rs" },
    levelRequired: 1,
    ...overrides,
  }
}

describe("stage ladder", () => {
  it("has metadata for every stage in the union", () => {
    for (const stage of CURRICULUM_STAGES) {
      expect(STAGE_META[stage].label.length).toBeGreaterThan(0)
      expect(STAGE_META[stage].blurb.length).toBeGreaterThan(0)
    }
  })

  it("orders the ladder from recall to the original problem", () => {
    expect(stageOrder("remember")).toBeLessThan(stageOrder("apply"))
    expect(stageOrder("apply")).toBeLessThan(stageOrder("integrate"))
    expect(stageOrder("integrate")).toBeLessThan(stageOrder("master"))
  })

  it("sorts an unrecognized stage last instead of throwing", () => {
    // A corpus is host-supplied data; one bad row must not take the picker
    // down with it.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- deliberately constructing an off-union value a JSON corpus could carry
    const bogus = "transcend" as CurriculumStage

    expect(stageOrder(bogus)).toBeGreaterThan(stageOrder("master"))
  })
})

describe("compareByCurriculum", () => {
  it("orders by the decomposition's own step numbers", () => {
    const third = challenge({ id: "c", curriculum: curriculum({ step: 3 }) })
    const first = challenge({ id: "a", curriculum: curriculum({ step: 1 }) })
    const second = challenge({ id: "b", curriculum: curriculum({ step: 2 }) })

    expect(
      [third, first, second].sort(compareByCurriculum).map((c) => c.id)
    ).toEqual(["a", "b", "c"])
  })

  it("falls back to stage order when two exercises claim the same step", () => {
    const later = challenge({
      id: "later",
      curriculum: curriculum({ step: 4, stage: "integrate" }),
    })
    const earlier = challenge({
      id: "earlier",
      curriculum: curriculum({ step: 4, stage: "remember" }),
    })

    expect([later, earlier].sort(compareByCurriculum).map((c) => c.id)).toEqual(
      ["earlier", "later"]
    )
  })

  it("puts loose challenges after every curriculum exercise", () => {
    const loose = challenge({ id: "loose" })
    const onLadder = challenge({
      id: "on-ladder",
      curriculum: curriculum({ step: 9 }),
    })

    expect(
      [loose, onLadder].sort(compareByCurriculum).map((c) => c.id)
    ).toEqual(["on-ladder", "loose"])
  })

  it("orders two loose challenges by title, so the result is stable", () => {
    const beta = challenge({ id: "b", title: "Beta" })
    const alpha = challenge({ id: "a", title: "Alpha" })

    expect([beta, alpha].sort(compareByCurriculum).map((c) => c.id)).toEqual([
      "a",
      "b",
    ])
  })
})

describe("hasCurriculum", () => {
  it("is false for a flat pool", () => {
    expect(hasCurriculum([challenge(), challenge({ id: "two" })])).toBe(false)
  })

  it("is true as soon as one row carries a curriculum", () => {
    expect(
      hasCurriculum([
        challenge(),
        challenge({ id: "two", curriculum: curriculum() }),
      ])
    ).toBe(true)
  })

  it("is false for an empty pool", () => {
    expect(hasCurriculum([])).toBe(false)
  })
})

describe("resolveLanguage", () => {
  it("keeps the preferred language when the challenge has it", () => {
    expect(
      resolveLanguage({ rust: "a.rs", typescript: "a.ts" }, "typescript")
    ).toBe("typescript")
  })

  it("falls back to Rust for a curriculum corpus that ships nothing else", () => {
    // The regression this exists for: a preferred language left over from an
    // earlier multi-language challenge would otherwise resolve to an empty
    // path and surface as a load error.
    expect(resolveLanguage({ rust: "a.rs" }, "typescript")).toBe("rust")
  })

  it("falls back past Rust when Rust is the one language absent", () => {
    expect(resolveLanguage({ cpp: "a.cpp" }, "typescript")).toBe("cpp")
  })

  it("ignores an empty path as though the language were absent", () => {
    expect(resolveLanguage({ rust: "a.rs", c: "" }, "c")).toBe("rust")
  })
})

describe("availableLanguages", () => {
  it("lists only what the challenge ships, Rust first", () => {
    expect(availableLanguages({ typescript: "a.ts", rust: "a.rs" })).toEqual([
      "rust",
      "typescript",
    ])
  })

  it("is empty when there is nothing to type", () => {
    expect(availableLanguages({})).toEqual([])
  })
})
