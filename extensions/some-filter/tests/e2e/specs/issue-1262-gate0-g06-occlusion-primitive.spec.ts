/**
 * #1262 Gate 0, G0.6 — prove the candidate custody primitive.
 *
 * The same sustained shadow-DOM churn burst that G0.5 used to falsify the
 * naive remedy (a native-bright frame during every debounce window), run
 * here against `occlusion-primitive.ts`'s theme-independent, permanently-
 * engaged full-viewport hold instead. Per
 * docs/gate0/1262-falsification-report.md's G0.6, a sound custody primitive
 * must survive ordinary vendor subtree churn and must re-establish itself
 * before a removed/replaced covering artifact can expose native content.
 * Both are exercised here with the frame oracle (`frames.ts`) — the same
 * instrument G0.2/G0.5 used to *find* a leak is used here to confirm this
 * primitive produces none, across the identical churn.
 */

import { captureFrames, firstLeak } from "@filter/playwright/fixtures/frames"
import {
  expect,
  test,
  waitForClassification,
} from "@filter/playwright/fixtures/gate0-fixture"
import { sustainedShadowChurn } from "@filter/playwright/fixtures/naive-remedy"
import { installPermanentOcclusion } from "@filter/playwright/fixtures/occlusion-primitive"
import { DARK } from "@filter/playwright/fixtures/pixels"

const BURST_MS = 300

test.describe("G0.6 — occlusion primitive survives sustained shadow-root creation churn", () => {
  test("zero frames are native-bright throughout the same burst that broke the naive remedy (G0.5)", async ({
    gate0,
    context,
  }) => {
    const page = await gate0.goto("shadow-surface-page")
    await waitForClassification(page)
    await installPermanentOcclusion(page)

    const samples = await captureFrames(context, page, async () => {
      await sustainedShadowChurn(page, BURST_MS)
      await page.waitForTimeout(200)
    })

    expect(samples.length).toBeGreaterThan(0)
    const leak = firstLeak(samples, DARK)
    expect(
      leak,
      "the occlusion primitive should admit zero native-bright frames — " +
        "unlike G0.5's naive remedy, it does not need to discover a scope " +
        "at all to hold it"
    ).toBeUndefined()
  })
})

test.describe("G0.6 — occlusion primitive re-establishes itself before adversarial removal can expose native content", () => {
  test("removing the covering element mid-churn produces zero native-bright frames", async ({
    gate0,
    context,
  }) => {
    const page = await gate0.goto("shadow-surface-page")
    await waitForClassification(page)
    await installPermanentOcclusion(page)

    const samples = await captureFrames(context, page, async () => {
      // Adversarial removal races against sustained churn — the same shape
      // as a vendor's own head/body-replacement churn (#1259's fixture),
      // applied to this primitive instead of the production veil.
      const removeBurst = (async () => {
        const start = Date.now()
        while (Date.now() - start < BURST_MS) {
          await page.evaluate(() => {
            document.getElementById("__gate0_occlusion_primitive")?.remove()
          })
          await page.waitForTimeout(15)
        }
      })()
      await Promise.all([sustainedShadowChurn(page, BURST_MS), removeBurst])
      await page.waitForTimeout(200)
    })

    expect(samples.length).toBeGreaterThan(0)
    const leak = firstLeak(samples, DARK)
    expect(
      leak,
      "the self-healing observer should re-insert the covering element " +
        "before any frame can expose native content, even under repeated " +
        "adversarial removal"
    ).toBeUndefined()
  })
})
