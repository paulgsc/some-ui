/**
 * The oracle regression (#730): for every fixture that has been scored via
 * Comfort Lab (#727) and merged into `eye-scores.json` (#729), the
 * classifier's real, live-rendered `sampleBodyComfort()` verdict must agree
 * with the human's — outside the declared borderline band
 * (`checkOracleAgreement`, #728's `eye-score.ts`).
 *
 * `eye-scores.json` starts empty (no human has used Comfort Lab yet) — this
 * suite is written and unit-tested against synthetic values
 * (`eye-score.spec.ts`'s `checkOracleAgreement` cases) so the mechanism is
 * proven correct before it has real data to enforce. It starts asserting
 * real fixtures the moment `eye-scores.json` gains entries, with zero code
 * changes needed here — that's the whole point of keeping the boundary
 * constants and the agreement check in `eye-score.ts`, shared with #728's
 * own disagreement guard.
 *
 * An unscored fixture is unaffected: `corpus.spec.ts`'s own
 * `expectComfortable` assertions (#724) keep running regardless of this
 * suite's state.
 */

import { expect, test } from "@playwright/test"

import { CORPUS } from "../fixtures/corpus"
import { checkOracleAgreement } from "../fixtures/eye-score"
import { loadEyeScores } from "../fixtures/eye-scores-store"

const HARNESS_BUNDLE = "tests/e2e/harness/dist/entry.js"

const eyeScores = loadEyeScores()
const scoredFixtureIds = Object.keys(eyeScores)

test.describe("eye-score oracle regression (#730)", () => {
  if (scoredFixtureIds.length === 0) {
    test("no fixtures scored yet — eye-scores.json is empty (#729)", () => {
      test.skip(
        true,
        "Score a fixture in Comfort Lab (#727) and run `pnpm eye-score:merge` (#729) to activate this suite."
      )
    })
  }

  for (const fixtureId of scoredFixtureIds) {
    const fixture = CORPUS.find((entry) => entry.id === fixtureId)
    const score = eyeScores[fixtureId]

    test(`${fixtureId}: classifier verdict agrees with the recorded eye score (or is borderline)`, async ({
      page,
    }) => {
      expect(
        fixture,
        `eye-scores.json references unknown fixture id "${fixtureId}" — check for a typo or a renamed/removed CORPUS entry`
      ).toBeDefined()
      expect(score).toBeDefined()

      await page.setContent(fixture!.html())
      await page.addScriptTag({ path: HARNESS_BUNDLE })

      const comfort = await page.evaluate(() =>
        window.__classifier.sampleBodyComfort()
      )
      expect(
        comfort.sampled,
        "expected a sampleable body (bg, text) pair"
      ).toBe(true)

      const result = checkOracleAgreement(score!.overall, comfort.comfortable)
      expect(
        result.agrees,
        `${result.reason} — eye score: ${JSON.stringify(score)}`
      ).toBe(true)
    })
  }
})
