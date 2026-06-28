// Copyright (c) 2026 paulgsc — MIT License
//
// suspend-page.spec.ts — E2E smoke for the suspend page against the built
// bundle (dist/suspend.html + suspend.js), served over HTTP and driven in
// headless Chromium. See playwright.config.ts for why this is CI-portable.
//
// These assertions cover the seams jsdom can't: real Location parsing, real
// <head> favicon injection, and real navigation via location.replace().

import { expect, test } from "@playwright/test"

/**
 * Build a suspend-page URL in the current hash form: `title` is encoded, the
 * original address is the verbatim tail after `uri=` (mirrors buildSuspendUrl).
 */
function suspendUrl({ title, uri }: { title?: string; uri?: string }): string {
  const fields = new URLSearchParams()
  if (title) fields.set("title", title)
  let fragment = fields.toString()
  if (uri) fragment += `${fragment ? "&" : ""}uri=${uri}`
  return fragment ? `/suspend.html#${fragment}` : "/suspend.html"
}

test.describe("suspend page", () => {
  test("renders a restorable card from hash params", async ({ page }) => {
    const target = "https://example.com/article"
    await page.goto(suspendUrl({ title: "💤 My Tab", uri: target }))

    const card = page.locator("main.suspend-card")
    await expect(card).toBeVisible()
    await expect(card).toHaveAttribute("data-recovery", "false")
    await expect(page.locator(".suspend-card__badge")).toHaveText(
      "Tab suspended by Suspender Ledger"
    )
    await expect(page.locator(".suspend-card__title")).toHaveText("💤 My Tab")
    await expect(page.locator(".suspend-card__url")).toHaveText(target)
    await expect(page.locator(".suspend-card__restore")).toBeVisible()

    // The tab title carries the marker prefix — never the verbatim original.
    await expect(page).toHaveTitle("💤 My Tab")
  })

  test("preserves a query string in the restored address", async ({ page }) => {
    const target = "https://example.com/search?a=1&b=2&c=3"
    await page.goto(suspendUrl({ title: "💤 Results", uri: target }))
    await expect(page.locator(".suspend-card__url")).toHaveText(target)
  })

  test("shows its own suspended badge favicon, never the original site's", async ({
    page,
  }) => {
    // Even a legacy URL that smuggles an origin favicon must be ignored: the
    // suspend page always serves its own badge (deceptive-pattern fix, #317).
    await page.goto(
      "/suspend.html?url=https%3A%2F%2Fexample.com%2F&favicon=https%3A%2F%2Fexample.com%2Ffavicon.ico"
    )
    const href = await page.locator('link[rel="icon"]').getAttribute("href")
    expect(href).toContain("data:image/svg+xml")
    expect(href).not.toContain("example.com")
  })

  test("falls back to the host name when no title is given", async ({
    page,
  }) => {
    await page.goto(suspendUrl({ uri: "https://news.example.org/path" }))
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

  test("restores by navigating to the original url on click", async ({
    page,
    baseURL,
  }) => {
    // Restore to a real, served page so the navigation actually lands.
    const target = new URL("/popup.html", baseURL).href
    await page.goto(suspendUrl({ title: "💤 Restore me", uri: target }))

    await page.locator(".suspend-card__restore").click()
    await page.waitForURL(target)
    expect(page.url()).toBe(target)
  })

  test("restores on Enter as well as click", async ({ page, baseURL }) => {
    const target = new URL("/popup.html", baseURL).href
    await page.goto(suspendUrl({ title: "💤 Keyboard restore", uri: target }))

    await page.keyboard.press("Enter")
    await page.waitForURL(target)
    expect(page.url()).toBe(target)
  })

  test("still restores tabs suspended by an older build (legacy query form)", async ({
    page,
    baseURL,
  }) => {
    const target = new URL("/popup.html", baseURL).href
    const legacy = `/suspend.html?url=${encodeURIComponent(target)}&title=Old`
    await page.goto(legacy)

    await page.locator(".suspend-card__restore").click()
    await page.waitForURL(target)
    expect(page.url()).toBe(target)
  })
})
