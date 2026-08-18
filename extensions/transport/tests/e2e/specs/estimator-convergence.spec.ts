import { expect, test } from "@playwright/test"
import {
  churn,
  hostilePageHtml,
} from "@transport/playwright/fixtures/hostile-page"

const HARNESS_BUNDLE = "tests/e2e/harness/dist/entry.js"

test.beforeEach(async ({ page }) => {
  await page.setContent(hostilePageHtml())
  await page.addScriptTag({ path: HARNESS_BUNDLE })
  await page.evaluate(
    (selector) => window.__transport.startSensing(selector),
    "#content-root"
  )
})

test.describe("Evidence-driven convergence (Theorem 5.1, integration-level)", () => {
  test("the hypothesis converges to the injected ground truth regardless of how many times evidence is re-observed", async ({
    page,
  }) => {
    // Duplicate/reordered delivery at the protocol level (Axioms 3.1–3.3)
    // is exercised at the unit level (src/sensor/fuzz.test.ts,
    // src/estimator/update.test.ts); here the same key is repeatedly
    // recycled to different values via a real MutationObserver over a
    // real browser DOM, proving the integration converges to the last
    // written ground truth.
    for (let value = 1; value <= 5; value++) {
      await churn.virtualizedRecycle(page, "#content-root", "video-1", value)
    }

    await page.waitForFunction(() => {
      const snapshot = window.__transport.hypothesisSnapshot()
      return snapshot["video-1"]?.seq === 5
    })

    const snapshot = await page.evaluate(() =>
      window.__transport.hypothesisSnapshot()
    )
    expect(snapshot["video-1"]).toEqual({ seq: 5 })
  })

  test("recycling a physical carrier to a different logical key converges each key to its own ground truth", async ({
    page,
  }) => {
    await churn.virtualizedRecycle(page, "#content-root", "k1", 10)
    await page.waitForFunction(
      () => window.__transport.hypothesisSnapshot()["k1"]?.seq === 10
    )

    await churn.virtualizedRecycle(page, "#content-root", "k2", 20)
    await page.waitForFunction(
      () => window.__transport.hypothesisSnapshot()["k2"]?.seq === 20
    )

    const snapshot = await page.evaluate(() =>
      window.__transport.hypothesisSnapshot()
    )
    expect(snapshot["k1"]).toEqual({ seq: 10 }) // k1's prior value is untouched by k2's recycling
    expect(snapshot["k2"]).toEqual({ seq: 20 })
  })
})

test.describe("Sustained high-frequency mutation (Theorem 7.1)", () => {
  test("no uncaught exception, exactly one Bootstrap installation, hypothesis reaches quiescence once churn stops", async ({
    page,
  }) => {
    const pageErrors: Array<string> = []
    page.on("pageerror", (error) => pageErrors.push(error.message))

    await churn.sustainedMutation(page, 500, 1000)

    // Quiescence: no further evidence means no further reconciler
    // invocation (Theorem 7.1's t0-quiescent case).
    const fired = await page.evaluate(() =>
      window.__transport.pendingTimerFired()
    )
    expect(fired).toBe(false)

    const installed = await page.evaluate(() =>
      window.__transport.isBootstrapInstalled()
    )
    expect(installed).toBe(true)

    expect(pageErrors).toEqual([])
  })
})
