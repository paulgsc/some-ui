/**
 * SF-RG (#1265), acceptance criterion: "A scope's hold survives adversarial
 * removal of its covering artifact (self-healing), proven with the frame
 * oracle Gate 0 built (tests/e2e/fixtures/frames.ts, reused/extended here —
 * this is exactly the reusable infrastructure Gate 0's own report flagged
 * as worth landing alongside its first real consumer)."
 *
 * Mirrors Gate 0's own G0.6 methodology (a sustained burst of adversarial
 * removals, not a single lucky recovery) against the production
 * `createOcclusionHold` primitive (`custody-primitive.ts`) instead of the
 * harness-only spike that inspired its shape
 * (`fixtures/occlusion-primitive.ts`, never imported from production code).
 */

import "@filter/playwright/fixtures/scope-registry-window-types"

import { captureFrames, firstLeak } from "@filter/playwright/fixtures/frames"
import { DARK } from "@filter/playwright/fixtures/pixels"
import {
  expect,
  test,
} from "@filter/playwright/fixtures/scope-registry-harness"

const ADVERSARIAL_REMOVALS = 5
const REMOVAL_INTERVAL_MS = 80

test("a HELD scope's hold survives repeated adversarial removal of its covering artifact", async ({
  context,
  harness,
}) => {
  const page = await harness.goto("scope-registry-harness-page")

  let finalVeilPresent: boolean | undefined

  const samples = await captureFrames(context, page, async () => {
    await page.evaluate(() => {
      const { createScopeRegistry } = window.ScopeRegistryModule
      const { createOcclusionHold } = window.CustodyPrimitiveModule

      const registry = createScopeRegistry()
      const hold = createOcclusionHold(document)
      registry.register("root", {
        ref: document,
        parent: null,
        contentEpoch: 0,
        hold,
      })
    })

    for (let i = 0; i < ADVERSARIAL_REMOVALS; i += 1) {
      await page.evaluate(() => {
        document.querySelector("[data-scope-registry-hold]")?.remove()
      })
      await page.waitForTimeout(REMOVAL_INTERVAL_MS)
    }

    finalVeilPresent = await page.evaluate(
      () => document.querySelector("[data-scope-registry-hold]") !== null
    )
  })

  expect(finalVeilPresent).toBe(true)

  const leak = firstLeak(samples, DARK)
  expect(
    leak,
    `frame ${String(leak?.frameIndex)} (${String(leak?.atSeconds)}s) leaked ` +
      `native-bright during adversarial removal: ${JSON.stringify(leak)}`
  ).toBeUndefined()
})
