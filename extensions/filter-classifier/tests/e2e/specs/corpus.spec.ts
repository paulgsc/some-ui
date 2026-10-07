/**
 * The training/verification loop over `fixtures/corpus.ts` (#721 Story 1 +
 * Story 4, #722): for every human-labeled fixture, load it as a plain page
 * (no extension), inject the harness bundle wired to the real classifier
 * modules, and assert both independent verdicts — `detect().alreadyDark`
 * and the generalized `satisfiesComfort` — against the label. A failure
 * here means the shipped classifier and a human's own judgment disagree on
 * a fixture concrete enough to point at, which is the whole point: this
 * suite is meant to be falsifiable, not a tautology over its own fixtures.
 */

import { expect, test } from "@playwright/test"

import { CORPUS } from "../fixtures/corpus"
import { computeOverall, validateEyeScore } from "../fixtures/eye-score"
import { loadEyeScores } from "../fixtures/eye-scores-store"

const HARNESS_BUNDLE = "tests/e2e/harness/dist/entry.js"

for (const fixture of CORPUS) {
  test.describe(`${fixture.grammar} — ${fixture.label}`, () => {
    test(`${fixture.id}: detect().alreadyDark matches the verified label`, async ({
      page,
    }) => {
      await page.setContent(fixture.html())
      await page.addScriptTag({ path: HARNESS_BUNDLE })

      const detection = await page.evaluate(() => window.__classifier.detect())
      expect(detection.alreadyDark, fixture.note).toBe(
        fixture.expectAlreadyDark
      )
    })

    // expectComfortable is null exactly when Φ_comfort isn't a meaningful
    // question for this fixture (not a dark-theme candidate, or nothing
    // sampleable) — see corpus.ts's own type doc.
    if (fixture.expectComfortable !== null) {
      test(`${fixture.id}: sampleBodyComfort() matches the verified label`, async ({
        page,
      }) => {
        await page.setContent(fixture.html())
        await page.addScriptTag({ path: HARNESS_BUNDLE })

        const comfort = await page.evaluate(() =>
          window.__classifier.sampleBodyComfort()
        )
        expect(
          comfort.sampled,
          "expected a sampleable body (bg, text) pair"
        ).toBe(true)
        expect(comfort.comfortable, fixture.note).toBe(
          fixture.expectComfortable
        )
      })
    }
  })
}

test.describe("corpus coverage", () => {
  test("every recognized human label is represented by at least one fixture", () => {
    const labels = new Set(CORPUS.map((fixture) => fixture.label))
    const required = [
      "needs-theming",
      "comfortable",
      "hostile",
      "borderline",
      "ambiguous",
    ] as const

    for (const label of required) {
      expect(labels.has(label), label).toBe(true)
    }
  })

  test("the motivating 'sun' pattern (#722) is both alreadyDark and not comfortable", () => {
    const sunFixture = CORPUS.find(
      (fixture) => fixture.id === "sun-glare-badges"
    )
    expect(sunFixture).toBeDefined()
    expect(sunFixture?.expectAlreadyDark).toBe(true)
    expect(sunFixture?.expectComfortable).toBe(false)
  })

  // Scores are written by hand and `pnpm eye-score:merge` does not validate
  // them, so the committed map is checked here instead. A malformed entry
  // would otherwise reach the oracle (#730) and pass it: an `overall` that is
  // not a number reads as borderline, and borderline agrees with anything.
  test("every committed eye score is valid for its fixture (#728)", () => {
    const problems: Array<string> = []

    for (const [fixtureId, score] of Object.entries(loadEyeScores())) {
      const fixture = CORPUS.find((entry) => entry.id === fixtureId)
      if (fixture === undefined) {
        problems.push(`${fixtureId}: no CORPUS fixture has this id`)
        continue
      }

      let issues: Array<string>
      try {
        issues = [...validateEyeScore(fixture, score)]
      } catch (error) {
        // A missing `reviewer` or `notes` throws inside the validator.
        issues = [`malformed entry: ${String(error)}`]
      }
      const derived = computeOverall(score)
      if (score.overall !== derived) {
        issues.push(
          `overall must be the rounded mean of the four sub-scores (${derived})`
        )
      }

      for (const issue of issues) problems.push(`${fixtureId}: ${issue}`)
    }

    expect(problems, problems.join("\n")).toEqual([])
  })

  // An unscored fixture isn't a bug to fix right now — it requires an actual
  // human to look at it (#726's whole point). One skip per unscored fixture,
  // each naming exactly which one, so it stays visible in the report rather
  // than silently absent — the same "not a silent skip" bar #730's own
  // empty-eye-scores.json placeholder already meets, just per-fixture
  // instead of suite-wide.
  const eyeScores = loadEyeScores()
  for (const fixture of CORPUS) {
    if (fixture.id in eyeScores) continue

    test(`"${fixture.id}" has not been scored yet`, () => {
      test.skip(
        true,
        `Score "${fixture.id}" (README, "Comfort Lab") and run ` +
          "`pnpm eye-score:merge` (#729) to activate its oracle regression check (#730)."
      )
    })
  }
})
