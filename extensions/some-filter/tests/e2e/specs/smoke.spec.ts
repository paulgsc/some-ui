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
 */

import { expect, test, waitForClassification } from "@filter/playwright/fixture"

test.describe("some-filter smoke", () => {
  test("light page: dark theme applies and prepaint veil drops", async ({
    fixture,
  }) => {
    const page = await fixture.goto("light-page")
    const snap = await waitForClassification(page)

    expect(snap.themeApplied).toBe("dark")
    expect(snap.hasDarkAttr).toBe(true)
    expect(snap.hasPrepaintVeil).toBe(false)
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
