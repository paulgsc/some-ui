/**
 * Exogenous self-reload resilience — reproduces a real-world pattern
 * reported from live YouTube (exact vendor trigger unconfirmed, no network
 * access to youtube.com from this suite): the page loads and paints once,
 * then the page's OWN script fires a full reload shortly after, giving the
 * content script a second document_start/document_end cycle on a fresh
 * document. Reported symptom: prepaint covers correctly on both loads, but
 * the settled state after the SECOND load shows native (light) background
 * instead of the extension's dark theme.
 *
 * fixtures/exogenous-reload-page.html drives exactly that shape (a plain
 * light page that reloads itself once, sessionStorage-gated). This can't
 * confirm what YouTube itself is doing internally — only that our pipeline
 * correctly recovers from the general "a page reloads itself shortly after
 * initial paint" pattern, which is the useful, reproducible proxy for it.
 *
 * SF4 (#1360) classification: visual-claim, promoted. The reported symptom
 * ("settles to white after the second document_end") is a rendering claim,
 * but this spec used to check it only through the pipeline's own
 * self-reported bookkeeping (`themeApplied`/`hasDarkAttr`, both
 * `document.*.dataset` values the extension writes about itself) — exactly
 * the class of proxy this story exists to catch. Added an independent read
 * of `document.body`'s actual computed background: `buildDarkThemeCSS`
 * (theme-apply.ts) sets it via a plain `background-color` rule, not
 * `filter`, so `getComputedStyle` has no compositing gap to hide behind here
 * (contrast the legacy `filter: invert()` mechanism, where it would).
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

    // fixture.goto() already waited out the *first* load internally (via
    // page.goto()'s own default waitUntil). Set up this listener immediately
    // after it returns — well within the fixture's own 200ms reload delay —
    // so it can only match the second, self-triggered load, never race with
    // the one goto() already consumed.
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
