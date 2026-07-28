/**
 * #831 — "polling pattern causing constant rerenders and flushing state?"
 *
 * Two symptoms, one root cause family, both asserted here against the real
 * --load-extension pipeline:
 *
 *   1. The theme applies correctly and is then undone by a later round,
 *      revealing the white vendor background. The Sensor was reading the
 *      *extension's own* static-layer output (html/body/input/pre/th/... —
 *      recolored by buildDarkThemeCSS but never tagged data-sw-patched) back
 *      in as vendor evidence; since Ĥ is append-only, pageAlreadyDark()'s
 *      mean drifted down until decide() emitted restore-native.
 *
 *   2. Rounds never stop on a page that is not changing. Realizing a verdict
 *      is itself a DOM write (the theme sheet into <head>, the dynamic
 *      sheet's text, the veil's sw-dirty class on <html>) — mutations the
 *      Sensor's own observer sees, schedules another round for, and thereby
 *      causes again. The tell in the issue is a log line that keeps ticking
 *      up on an idle tab.
 *
 * Both are stated as invariants of a *settled* page: once classification has
 * resolved, an untouched page must hold its verdict and cost nothing.
 */

import { expect, test, waitForClassification } from "@filter/playwright/fixture"

/** Long enough to span many reconcile windows (RECONCILE_POLICY.debounceMs = 50). */
const QUIET_WINDOW_MS = 1_500

test.describe("auto theme quiescence on a settled page (#831)", () => {
  test("the theme survives the rounds that follow the one that applied it", async ({
    fixture,
  }) => {
    const page = await fixture.goto("self-feedback-page")
    const settled = await waitForClassification(page)

    expect(settled.themeApplied).toBe("dark")

    // Past the fixture's own delayed mutation (400ms), so at least one
    // reactive round has run against a page already wearing the theme.
    await page.waitForTimeout(QUIET_WINDOW_MS)

    const after = await page.evaluate(() => ({
      themeApplied: document.body.dataset["swThemeApplied"],
      hasDarkAttr: document.documentElement.hasAttribute("data-sw-dark"),
      hasThemeSheet: document.getElementById("__sw_dark_theme") !== null,
      bodyBg: getComputedStyle(document.body).backgroundColor,
    }))

    expect(
      after.themeApplied,
      "the page's vendor colors never changed, so no later round may reach a " +
        "different verdict than the one that applied the theme"
    ).toBe("dark")
    expect(after.hasDarkAttr).toBe(true)
    expect(after.hasThemeSheet).toBe(true)
    expect(after.bodyBg).not.toBe("rgb(255, 255, 255)")
  })

  test("a settled, untouched page costs zero further extension DOM writes", async ({
    fixture,
  }) => {
    const page = await fixture.goto("self-feedback-page")
    await waitForClassification(page)

    // Let the fixture's single delayed mutation land and settle first — the
    // round it triggers is legitimate. What follows must be silence.
    await page.waitForTimeout(800)

    const churn = await page.evaluate(async (windowMs: number) => {
      // Count only mutations to artifacts the extension owns: its two
      // stylesheets (rebuilt per round) and <html>'s class attribute (the
      // prepaint veil's ownership signal, rewritten by every
      // commitVisualState -> disablePrepaint). This page's own script is
      // done mutating by now, so anything counted here is self-inflicted.
      let count = 0
      const observer = new MutationObserver((records) => {
        count += records.length
      })

      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      })
      for (const id of ["__sw_dark_theme", "__sw_dark_dynamic"]) {
        const sheet = document.getElementById(id)
        if (sheet !== null) {
          observer.observe(sheet, {
            childList: true,
            subtree: true,
            characterData: true,
          })
        }
      }
      observer.observe(document.head, { childList: true })

      await new Promise((resolve) => setTimeout(resolve, windowMs))
      observer.disconnect()
      return count
    }, QUIET_WINDOW_MS)

    expect(
      churn,
      `the extension rewrote its own artifacts ${churn} time(s) over ` +
        `${QUIET_WINDOW_MS}ms on a page nothing was changing — each of those ` +
        `writes is a mutation its own Sensor reacts to, which is the loop`
    ).toBe(0)
  })
})
