/**
 * Unit-level checks for `scripts/merge-eye-score.mjs`'s pure `mergeEyeScores`
 * (#729) — no file I/O (that's `main()`'s job, deliberately untested here:
 * it's a thin wrapper with nothing to get wrong once the merge itself is
 * proven correct). No `page` fixture requested, matching `eye-score.spec.ts`.
 */

import { expect, test } from "@playwright/test"

import { mergeEyeScores } from "../../../scripts/merge-eye-score.mjs"
import type { EyeScore } from "../fixtures/eye-score"

function fakeScore(overrides: Partial<EyeScore> = {}): EyeScore {
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

test.describe("mergeEyeScores", () => {
  test("adds a new fixture id to an empty map", () => {
    const result = mergeEyeScores({}, { "sun-glare-badges": fakeScore() })
    expect(result.isUpdate).toBe(false)
    expect(result.fixtureId).toBe("sun-glare-badges")
    expect(Object.keys(result.merged)).toEqual(["sun-glare-badges"])
  })

  test("overwrites an existing fixture id cleanly — no duplicate/orphaned entries", () => {
    const oldScore = fakeScore({ overall: 10, reviewer: "first-pass" })
    const newScore = fakeScore({ overall: 80, reviewer: "second-pass" })
    const existing = { "muted-warm-dark": oldScore }

    const result = mergeEyeScores(existing, { "muted-warm-dark": newScore })

    expect(result.isUpdate).toBe(true)
    expect(Object.keys(result.merged)).toEqual(["muted-warm-dark"])
    expect(result.merged["muted-warm-dark"]).toEqual(newScore)
  })

  test("leaves other fixtures' scores untouched", () => {
    const existing = {
      "plain-light-card": fakeScore({ overall: 90 }),
      "sun-glare-badges": fakeScore({ overall: 5 }),
    }

    const result = mergeEyeScores(existing, {
      "sun-glare-badges": fakeScore({ overall: 8 }),
    })

    expect(result.merged["plain-light-card"]).toEqual(
      existing["plain-light-card"]
    )
    expect(result.merged["sun-glare-badges"]?.overall).toBe(8)
  })

  test("sorts keys for a stable, reviewable diff", () => {
    const existing = {
      "sun-glare-badges": fakeScore(),
      "borderline-mid-gray": fakeScore(),
    }
    const result = mergeEyeScores(existing, {
      "cool-blue-preserve-band": fakeScore(),
    })

    expect(Object.keys(result.merged)).toEqual([
      "borderline-mid-gray",
      "cool-blue-preserve-band",
      "sun-glare-badges",
    ])
  })

  test("rejects a payload with more than one fixture id", () => {
    expect(() =>
      mergeEyeScores({}, { "fixture-a": fakeScore(), "fixture-b": fakeScore() })
    ).toThrow(/exactly one fixture id/)
  })

  test("rejects a payload with zero fixture ids", () => {
    expect(() => mergeEyeScores({}, {})).toThrow(/exactly one fixture id/)
  })

  test("rejects a non-object payload", () => {
    expect(() => mergeEyeScores({}, null)).toThrow(/not a JSON object/)
    expect(() => mergeEyeScores({}, [])).toThrow(/not a JSON object/)
  })
})
