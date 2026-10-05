/**
 * #831 — "polling pattern causing constant rerenders and flushing state?"
 *
 * Two symptoms, asserted against the real --load-extension pipeline:
 *
 *   1. The theme applies and a later round undoes it: the Sensor read the
 *      extension's own static-layer output back in as vendor evidence, and
 *      since Ĥ is append-only, pageAlreadyDark()'s mean drifted until
 *      decide() emitted restore-native.
 *   2. Rounds never stop on an idle page: realizing a verdict is a DOM write
 *      the Sensor's observer sees, schedules a round for, and causes again.
 *
 * Both are invariants of a *settled* page: it holds its verdict and costs
 * nothing.
 *
 * Classification (#1360): the first test is a visual claim, promoted to a
 * real luminance threshold (`buildDarkThemeCSS` sets background-color
 * directly, no `filter`). The second (mutation count) is an internal-state
 * claim by design.
 */

import { parseColor, relativeLuminance } from "@filter/lib/content/color"
import { expect, test, waitForClassification } from "@filter/playwright/fixture"

/** Matches issue-1268-sfad-shadow-theming.spec.ts's own bar: below theme-adapter.ts's LIGHT_THRESHOLD (0.3). */
const THEMED_LUMINANCE_CEILING = 0.3

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
    const rgba = parseColor(after.bodyBg)
    expect(
      rgba,
      `unparseable computed background-color: ${after.bodyBg}`
    ).not.toBeNull()
    if (rgba === null) throw new Error("unreachable")
    expect(
      relativeLuminance(rgba[0], rgba[1], rgba[2]),
      `body background ${after.bodyBg} after the quiet window — expected the ` +
        `themed dark canvas to still be actually painted, not just declared`
    ).toBeLessThan(THEMED_LUMINANCE_CEILING)
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
      // Count only mutations to extension-owned artifacts: its two
      // stylesheets and <html>'s class (the veil's ownership signal). The
      // page's own script is done, so anything counted is self-inflicted.
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
