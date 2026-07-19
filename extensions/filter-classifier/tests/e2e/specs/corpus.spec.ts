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

import * as comfortLabStories from "../../../src/comfort-lab/ComfortFixture.stories"
import { CORPUS } from "../fixtures/corpus"
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

  // #731 (corpus expansion workflow): a fixture added to CORPUS without its
  // Comfort Lab story is a plain authoring omission, not something that
  // needs a human's time — CSF3 requires a literal named export per story
  // (ComfortFixture.stories.tsx's own header comment explains why this
  // can't be generated), so this is a hard failure, not a skip. Converts
  // "sun-glare-badges" -> "SunGlareBadges" to match that file's own naming.
  function storyExportName(fixtureId: string): string {
    return fixtureId
      .split("-")
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join("")
  }

  test("every CORPUS fixture has a matching Comfort Lab story export (#727)", () => {
    for (const fixture of CORPUS) {
      const exportName = storyExportName(fixture.id)
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      const story = (comfortLabStories as Record<string, unknown>)[exportName]
      expect(
        story,
        `"${fixture.id}" has no exported story "${exportName}" in ` +
          `src/comfort-lab/ComfortFixture.stories.tsx — add one alongside the ` +
          `CORPUS entry, not as a follow-up`
      ).toBeDefined()
    }
  })

  // Unlike the story-coverage check above, an unscored fixture isn't a bug
  // to fix right now — it requires an actual human to look at it (#726's
  // whole point). One skip per unscored fixture, each naming exactly which
  // one, so it stays visible in the report rather than silently absent —
  // the same "not a silent skip" bar #730's own empty-eye-scores.json
  // placeholder already meets, just per-fixture instead of suite-wide.
  const eyeScores = loadEyeScores()
  for (const fixture of CORPUS) {
    if (fixture.id in eyeScores) continue

    test(`"${fixture.id}" has not been scored in Comfort Lab yet`, () => {
      test.skip(
        true,
        `Score "${fixture.id}" in Comfort Lab (#727) and run ` +
          "`pnpm eye-score:merge` (#729) to activate its oracle regression check (#730)."
      )
    })
  }
})
