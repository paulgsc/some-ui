// Copyright (c) 2026 paulgsc — MIT License
//
// suspend-page.spec.ts — E2E smoke for the suspend page against the built
// bundle (dist/suspend.html + suspend.js), served over HTTP and driven in
// headless Chromium. See playwright.config.ts for why this is CI-portable.
//
// These assertions cover the seams jsdom can't: real Location parsing, real
// <head> favicon injection, and real navigation via location.replace().

import { expect, test } from "@playwright/test"

/** Build a suspend-page URL with the given params. */
function suspendUrl(params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString()
  return `/suspend.html?${qs}`
}

test.describe("suspend page", () => {
  test("renders a restorable card from query params", async ({ page }) => {
    const target = "https://example.com/article"
    const favicon = "https://example.com/favicon.ico"
    await page.goto(suspendUrl({ url: target, title: "My Tab", favicon }))

    const card = page.locator("main.suspend-card")
    await expect(card).toBeVisible()
    await expect(card).toHaveAttribute("data-recovery", "false")
    await expect(page.locator(".suspend-card__title")).toHaveText("My Tab")
    await expect(page.locator(".suspend-card__url")).toHaveText(target)
    await expect(page.locator(".suspend-card__restore")).toBeVisible()

    // Tab chrome is reflected onto the real document.
    await expect(page).toHaveTitle("My Tab")
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
      "href",
      favicon
    )
  })

  test("falls back to the host name when no title is given", async ({
    page,
  }) => {
    await page.goto(suspendUrl({ url: "https://news.example.org/path" }))
    await expect(page.locator(".suspend-card__title")).toHaveText(
      "news.example.org"
    )
  })

  test("enters recovery state when the url is missing", async ({ page }) => {
    await page.goto(suspendUrl({ title: "Orphaned tab" }))

    const card = page.locator("main.suspend-card")
    await expect(card).toHaveAttribute("data-recovery", "true")
    await expect(page.locator(".suspend-card__title")).toHaveText(
      "Nothing to restore"
    )
    await expect(page.locator(".suspend-card__note")).toBeVisible()
    // A recovery card has no restore affordance.
    await expect(page.locator(".suspend-card__restore")).toHaveCount(0)
  })

  test("rejects an unsafe favicon scheme", async ({ page }) => {
    await page.goto(
      suspendUrl({
        url: "https://example.com/",
        favicon: "javascript:alert(1)",
      })
    )
    // The guard keeps the payload out of both the <head> and the card <img>.
    await expect(page.locator('link[rel="icon"]')).toHaveCount(0)
    await expect(page.locator(".suspend-card__favicon")).toHaveCount(0)
  })

  test("restores by navigating to the original url on click", async ({
    page,
    baseURL,
  }) => {
    // Restore to a real, served page so the navigation actually lands.
    const target = new URL("/popup.html", baseURL).href
    await page.goto(suspendUrl({ url: target, title: "Restore me" }))

    await page.locator(".suspend-card__restore").click()
    await page.waitForURL("**/popup.html")
    expect(page.url()).toBe(target)
  })

  test("restores on Enter as well as click", async ({ page, baseURL }) => {
    const target = new URL("/popup.html", baseURL).href
    await page.goto(suspendUrl({ url: target, title: "Keyboard restore" }))

    await page.keyboard.press("Enter")
    await page.waitForURL("**/popup.html")
    expect(page.url()).toBe(target)
  })
})
