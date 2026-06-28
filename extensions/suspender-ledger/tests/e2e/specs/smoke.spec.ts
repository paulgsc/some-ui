/**
 * suspender-ledger — smoke tests (CI-portable, headless).
 *
 * Minimal invariants: does the suspend page render a usable card and restore
 * the original URL? These are the only two behaviors that must survive every
 * iteration. Failures here mean a build or manifest change broke the suspend
 * page before any deeper regression hunt is worthwhile.
 *
 * Why headless / no extension load:
 *   The suspend page is pure web — it reads url/title/favicon from the query
 *   string and navigates via location.replace(). No browser.* API is used,
 *   so the page can be driven in headless Chromium over HTTP (see
 *   playwright.config.ts → webServer).
 */

import { expect, test } from "@playwright/test"

function suspendUrl(params: Record<string, string>): string {
  return `/suspend.html?${new URLSearchParams(params).toString()}`
}

test.describe("suspender-ledger smoke", () => {
  test("renders a restorable card from query params", async ({ page }) => {
    await page.goto(suspendUrl({ url: "https://example.com/", title: "Smoke" }))

    await expect(page.locator("main.suspend-card")).toBeVisible()
    await expect(page.locator(".suspend-card__title")).toHaveText("Smoke")
    await expect(page.locator(".suspend-card__restore")).toBeVisible()
  })

  test("falls back to hostname when no title is given", async ({ page }) => {
    await page.goto(suspendUrl({ url: "https://news.example.org/path" }))

    await expect(page.locator(".suspend-card__title")).toHaveText(
      "news.example.org"
    )
  })
})
