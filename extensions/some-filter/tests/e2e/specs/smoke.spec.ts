/**
 * some-filter — smoke tests (non-headless, requires built extension).
 *
 * Minimal invariants: the content script loads and classifies page luminance
 * correctly, and the prepaint veil is removed after classification. If these
 * two behaviors break, the extension's entire classify-on-refresh pipeline is
 * broken regardless of what unit tests report.
 *
 * Run via:
 *   pnpm build:chromium && pnpm exec playwright test smoke
 *
 * Requires PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH (set by nix develop .#playwright).
 *
 * SF4 (#1360) classification: visual-claim, promoted. This file's own stated
 * purpose is whether real CSS injection actually lands in the page's
 * cascade — but every assertion below used to read only the extension's own
 * `document.*.dataset` bookkeeping, which is set by the same code path
 * regardless of whether the stylesheet actually painted. Added an
 * independent read of the real computed background so a broken injection
 * (the exact failure class this file exists to catch) cannot pass silently.
 * `buildDarkThemeCSS` sets it via plain `background-color`, not `filter`, so
 * `getComputedStyle` is sound here (no compositing gap, unlike legacy mode's
 * `filter: invert()`).
 */

import { parseColor, relativeLuminance } from "@filter/lib/content/color"
import { expect, test, waitForClassification } from "@filter/playwright/fixture"

/** Matches issue-1268-sfad-shadow-theming.spec.ts's own bar: below theme-adapter.ts's LIGHT_THRESHOLD (0.3). */
const THEMED_LUMINANCE_CEILING = 0.3

test.describe("some-filter smoke", () => {
  test("light page: dark theme applies and prepaint veil drops", async ({
    fixture,
  }) => {
    const page = await fixture.goto("light-page")
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
      `body background ${bodyBg} — the dark theme CSS must actually be ` +
        `painting, not just marking itself applied`
    ).toBeLessThan(THEMED_LUMINANCE_CEILING)
  })

  test("dark page: theme does not apply and prepaint veil still drops", async ({
    fixture,
  }) => {
    const page = await fixture.goto("dark-page")
    const snap = await waitForClassification(page)

    expect(snap.themeApplied).toBe("none")
    expect(snap.hasDarkAttr).toBe(false)
    expect(snap.hasPrepaintVeil).toBe(false)
  })
})
