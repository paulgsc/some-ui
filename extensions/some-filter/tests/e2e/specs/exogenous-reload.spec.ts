/**
 * Exogenous self-reload resilience: the page paints once, then its own
 * script reloads it, giving the content script a second document_start /
 * document_end on a fresh document (reported on YouTube, trigger
 * unconfirmed). Symptom: the second load settles to native light.
 *
 * fixtures/exogenous-reload-page.html reloads itself once
 * (sessionStorage-gated) — a reproducible proxy for the general pattern.
 *
 * Classification (#1360): visual claim, promoted — an independent read of
 * `document.body`'s computed background backs the extension's own dataset
 * bookkeeping (`buildDarkThemeCSS` uses `background-color`, not `filter`).
 */

import { parseColor, relativeLuminance } from "@filter/lib/content/color"
import { expect, test, waitForClassification } from "@filter/playwright/fixture"

/** Matches issue-1268-sfad-shadow-theming.spec.ts's own bar: below theme-adapter.ts's LIGHT_THRESHOLD (0.3), unambiguously off the original white canvas. */
const THEMED_LUMINANCE_CEILING = 0.3

test.describe("exogenous self-reload resilience", () => {
  test("settles to the themed dark canvas after the page reloads itself shortly after initial paint", async ({
    fixture,
  }) => {
    const page = await fixture.goto("exogenous-reload-page")

    // goto() consumed the first load; set this up at once (well within the
    // fixture's 200ms reload delay) so it matches only the second.
    await page.waitForEvent("load")

    const snap = await waitForClassification(page)

    expect(snap.themeApplied).toBe("dark")
    expect(snap.hasDarkAttr).toBe(true)
    expect(snap.hasPrepaintVeil).toBe(false)

    const bodyBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor
    )
    const rgba = parseColor(bodyBg)
    expect(
      rgba,
      `unparseable computed background-color: ${bodyBg}`
    ).not.toBeNull()
    if (rgba === null) throw new Error("unreachable")
    expect(
      relativeLuminance(rgba[0], rgba[1], rgba[2]),
      `body background ${bodyBg} after the self-reload — expected the themed ` +
        `dark canvas, not the original white`
    ).toBeLessThan(THEMED_LUMINANCE_CEILING)
  })
})
