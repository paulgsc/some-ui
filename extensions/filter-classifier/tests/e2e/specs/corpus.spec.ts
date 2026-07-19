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
})
