/**
 * Unit-level checks for the EyeScore schema (#728) — pure functions, no DOM,
 * so these tests deliberately don't request Playwright's `page` fixture (no
 * browser is launched for them). Kept in this suite rather than adding a
 * Vitest config to a package whose whole point is "Playwright, not another
 * test runner" for a handful of pure-function checks.
 */

import { expect, test } from "@playwright/test"

import { CORPUS, type CorpusFixture } from "../fixtures/corpus"
import {
  computeOverall,
  EYE_SCORE_COMFORTABLE_THRESHOLD,
  EYE_SCORE_HOSTILE_THRESHOLD,
  eyeScoreVerdict,
  requiresExplanation,
  validateEyeScore,
  type EyeScore,
} from "../fixtures/eye-score"

function score(overrides: Partial<EyeScore> = {}): EyeScore {
  return {
    luminanceComfort: 50,
    contrastComfort: 50,
    colorComfort: 50,
    emotionalComfort: 50,
    overall: 50,
    reviewer: "test-reviewer",
    notes: "",
    scoredAt: new Date(0).toISOString(),
    ...overrides,
  }
}

test.describe("computeOverall", () => {
  test("is the rounded mean of the four sub-scores (README's sun-glare-badges worked example)", () => {
    expect(
      computeOverall({
        luminanceComfort: 10,
        contrastComfort: 5,
        colorComfort: 20,
        emotionalComfort: 0,
      })
    ).toBe(9) // (10+5+20+0)/4 = 8.75 -> 9, cited verbatim in README.md
  })
})

test.describe("eyeScoreVerdict", () => {
  test("boundary values", () => {
    expect(eyeScoreVerdict(EYE_SCORE_COMFORTABLE_THRESHOLD)).toBe("comfortable")
    expect(eyeScoreVerdict(EYE_SCORE_COMFORTABLE_THRESHOLD - 1)).toBe(
      "borderline"
    )
    expect(eyeScoreVerdict(EYE_SCORE_HOSTILE_THRESHOLD)).toBe("hostile")
    expect(eyeScoreVerdict(EYE_SCORE_HOSTILE_THRESHOLD + 1)).toBe("borderline")
  })
})

test.describe("EyeScore JSON round-trip", () => {
  test("survives JSON.stringify/JSON.parse losslessly", () => {
    const original = score({ notes: "harsh, feels like staring at a monitor" })
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const roundTripped = JSON.parse(JSON.stringify(original)) as EyeScore
    expect(roundTripped).toEqual(original)
  })
})

test.describe("requiresExplanation / validateEyeScore", () => {
  const comfortableFixture: CorpusFixture = {
    ...CORPUS[0]!,
    id: "test-comfortable",
    expectComfortable: true,
  }
  const hostileFixture: CorpusFixture = {
    ...CORPUS[0]!,
    id: "test-hostile",
    expectComfortable: false,
  }
  const notApplicableFixture: CorpusFixture = {
    ...CORPUS[0]!,
    id: "test-na",
    expectComfortable: null,
  }

  test("no explanation required when the score agrees with expectComfortable", () => {
    expect(
      requiresExplanation(comfortableFixture, score({ overall: 80 }))
    ).toBe(false)
    expect(requiresExplanation(hostileFixture, score({ overall: 10 }))).toBe(
      false
    )
  })

  test("explanation required when the score disagrees with expectComfortable", () => {
    expect(
      requiresExplanation(comfortableFixture, score({ overall: 10 }))
    ).toBe(true)
    expect(requiresExplanation(hostileFixture, score({ overall: 80 }))).toBe(
      true
    )
  })

  test("borderline scores never require an explanation, even against a hard label", () => {
    expect(
      requiresExplanation(comfortableFixture, score({ overall: 50 }))
    ).toBe(false)
    expect(requiresExplanation(hostileFixture, score({ overall: 50 }))).toBe(
      false
    )
  })

  test("expectComfortable=null fixtures never require an explanation", () => {
    expect(
      requiresExplanation(notApplicableFixture, score({ overall: 5 }))
    ).toBe(false)
    expect(
      requiresExplanation(notApplicableFixture, score({ overall: 95 }))
    ).toBe(false)
  })

  test("validateEyeScore flags a disagreeing score with empty notes", () => {
    const issues = validateEyeScore(comfortableFixture, score({ overall: 10 }))
    expect(issues.some((issue) => issue.includes("notes"))).toBe(true)
  })

  test("validateEyeScore accepts a disagreeing score once notes explain it", () => {
    const issues = validateEyeScore(
      comfortableFixture,
      score({
        overall: 10,
        notes: "sub-scores were consistently low across the board",
      })
    )
    expect(issues).toEqual([])
  })

  test("validateEyeScore rejects an out-of-range sub-score", () => {
    const issues = validateEyeScore(
      notApplicableFixture,
      score({ luminanceComfort: 101 })
    )
    expect(issues.some((issue) => issue.includes("luminanceComfort"))).toBe(
      true
    )
  })

  test("validateEyeScore rejects an empty reviewer", () => {
    const issues = validateEyeScore(
      notApplicableFixture,
      score({ reviewer: "" })
    )
    expect(issues.some((issue) => issue.includes("reviewer"))).toBe(true)
  })
})
