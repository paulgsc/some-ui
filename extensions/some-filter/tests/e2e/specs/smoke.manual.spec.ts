/**
 * smoke.manual.spec.ts — pre-release smoke check, NOT a CI gate.
 *
 * Why this exists:
 *   The pipeline depends on something vitest/jsdom cannot observe: whether
 *   Chrome's real MV3 content-script CSS injection lands in the page's
 *   cascade, and how fast. A manifest or Vite config change can break real
 *   injection with every unit test green.
 *
 * Why this is NOT in CI:
 *   It needs a non-headless Chromium via launchPersistentContext +
 *   --load-extension, behind the `nix develop .#playwright` shell. It is
 *   excluded from playwright.config.ts's testMatch (.manual.spec.ts) and run
 *   by hand:
 *
 *     nix develop .#playwright
 *     pnpm build:chromium
 *     pnpm exec playwright test smoke.manual
 *
 * Classification (#1360): visual claim, promoted, as smoke.spec.ts — an
 * independent computed-background-luminance read against a twin of
 * smoke.spec.ts's `THEMED_LUMINANCE_CEILING`.
 *
 * When to run this:
 *   Before a release build, and after any change to:
 *     - public/manifest.json (content_scripts entries, run_at, matches)
 *     - public/prepaint.css
 *     - vite.config.ts (build input/output, public-dir copy behavior)
 *   The vitest suites remain the primary gates for the logic; this covers
 *   only the seam they cannot reach: real browser injection.
 */

import { parseColor, relativeLuminance } from "@filter/lib/content/color"
import { expect, test, waitForClassification } from "@filter/playwright/fixture"

/** Matches smoke.spec.ts's own bar: below theme-adapter.ts's LIGHT_THRESHOLD (0.3). */
const THEMED_LUMINANCE_CEILING = 0.3

test.describe("pre-release smoke check (manual only — see file header)", () => {
  test("cold load on a light page: dark theme applies, veil drops", async ({
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

  test("cold load on a dark page: theme does not apply, veil still drops", async ({
    fixture,
  }) => {
    const page = await fixture.goto("dark-page")
    const snap = await waitForClassification(page)

    expect(snap.themeApplied).toBe("none")
    expect(snap.hasDarkAttr).toBe(false)
    expect(snap.hasPrepaintVeil).toBe(false)
  })
})
