/**
 * BOYO — environment + extension diagnostics
 *
 * Purpose
 * -------
 * These tests validate the *test harness itself* before running the more
 * expensive behavioral invariant suite.
 *
 * Why this file exists
 * --------------------
 * When extension loading, Firefox profile wiring, Playwright context setup,
 * or content-script injection breaks, the behavioral tests become noisy and
 * misleading. This suite isolates infrastructure failures from runtime logic
 * failures.
 *
 * Typical usage
 * -------------
 * Run this file first when debugging:
 *
 *   pnpm playwright test diagnostics.spec.ts
 *
 * Only run the full invariant suite after these diagnostics pass.
 *
 * Guarantees checked here
 * -----------------------
 *   D1 — Playwright can reach and mutate the page main world.
 *   D2 — The fixture HTML loaded correctly.
 *   D3 — addInitScript debug bridge wiring works.
 *   D4 — The content script actually injected into the page.
 *   D5 — BOYO CSS + runtime markers exist.
 *
 * Non-goals
 * ---------
 *   - Runtime behavioral correctness
 *   - Navigation/session semantics
 *   - Click progression/state machine correctness
 */

import { expect, test } from "@censor/playwright/fixture"

// ─────────────────────────────────────────────────────────────────────────────
// D1: page reachability + writable main world
// ─────────────────────────────────────────────────────────────────────────────

test("D1: page is reachable and main world is writable", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")

  /**
   * Sanity check:
   * confirms Playwright can communicate with the page.
   */
  const title = await page.title()
  console.log("Page title:", title)

  /**
   * Verify writes into the page's main execution world succeed.
   *
   * If this fails, evaluate() isolation or context wiring is broken.
   */
  await page.evaluate(() => {
    ;(window as any).__DIAG__ = "hello"
  })

  const diag = await page.evaluate(() => (window as any).__DIAG__)

  expect(diag).toBe("hello")

  /**
   * Confirm the local fixture HTML rendered.
   *
   * The extension bootstrap depends on ytd-app existing.
   */
  const hasApp = await page.evaluate(() => !!document.querySelector("ytd-app"))

  expect(hasApp).toBe(true)

  /**
   * Verify the addInitScript event bridge works.
   *
   * The fixture injects a listener that mirrors debug snapshots onto
   * window.__BOYO_DEBUG__.
   *
   * If this fails:
   *   - addInitScript may not have attached
   *   - event serialization may be broken
   *   - page/main-world separation may be incorrect
   */
  await page.evaluate(() => {
    document.dispatchEvent(
      new CustomEvent("__boyo_debug_update__", {
        detail: JSON.stringify({
          tick: 999,
          phase: "running",
          mounted: 0,
          unresolved: 0,
          entries: {},
          lastMutationMs: null,
          navigations: 0,
          sessionOrdinal: 1,
        }),
      })
    )
  })

  const debug = await page.evaluate(() => (window as any).__BOYO_DEBUG__)

  console.log("__BOYO_DEBUG__ after manual event:", debug)

  expect(debug?.tick).toBe(999)
})

// ─────────────────────────────────────────────────────────────────────────────
// D2: content script injection
// ─────────────────────────────────────────────────────────────────────────────

test("D2: content script is injecting and running", async ({ fixture }) => {
  const page = await fixture.goto("yt-home")

  /**
   * Give the extension bootstrap time to:
   *   - inject scripts
   *   - attach observers
   *   - process initial cards
   */
  await page.waitForTimeout(3000)

  /**
   * Presence of data-boyo attributes proves the content script mutated DOM.
   */
  const boyoCount = await page.evaluate(
    () => document.querySelectorAll("[data-boyo]").length
  )

  console.log("Elements with data-boyo:", boyoCount)

  /**
   * Presence of veil nodes proves masking UI injected successfully.
   */
  const veilCount = await page.evaluate(
    () => document.querySelectorAll(".boyo-veil").length
  )

  console.log("Veil elements:", veilCount)

  /**
   * Required bootstrap root.
   */
  const hasApp = await page.evaluate(() => !!document.querySelector("ytd-app"))

  console.log("ytd-app present:", hasApp)

  /**
   * Optional runtime marker.
   *
   * Add temporarily near the top of content.ts:
   *
   *   (window as any).__BOYO_LOADED__ = true
   *
   * Useful when diagnosing whether the content script executed at all.
   */
  const loaded = await page.evaluate(() => (window as any).__BOYO_LOADED__)

  console.log("__BOYO_LOADED__:", loaded)

  /**
   * Detect whether extension CSS injected successfully.
   *
   * Firefox extension failures commonly show up as:
   *   - script injected
   *   - stylesheet missing
   */
  const hasStyle = await page.evaluate(() => {
    const sheets = Array.from(document.styleSheets)

    return sheets.some((sheet) => {
      try {
        return (
          sheet.cssRules.length > 0 &&
          Array.from(sheet.cssRules).some((rule) =>
            rule.cssText.includes("boyo")
          )
        )
      } catch {
        /**
         * Accessing cross-origin stylesheets can throw.
         * Ignore inaccessible sheets.
         */
        return false
      }
    })
  })

  console.log("BOYO CSS injected:", hasStyle)

  /**
   * Hard assertions.
   *
   * These ensure diagnostics actually fail meaningfully instead of
   * silently logging suspicious state.
   */
  expect(hasApp).toBe(true)
  expect(boyoCount).toBeGreaterThan(0)
  expect(veilCount).toBeGreaterThan(0)
  expect(hasStyle).toBe(true)
})
