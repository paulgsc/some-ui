/**
 * BOYO — the watch page (#1805)
 *
 * W1 — No comment, comment count or comments panel renders while the
 *      extension is on; another engagement panel stays, and off is plain
 *      YouTube.
 * W2 — An old video's page shows as YouTube shows it.
 * W3 — A recent video's page is "Not here." and Back: no player, title or
 *      date, no playback, and a tab title that is not the video's.
 * W4 — Until the metadata names the page's video, none of it shows or plays,
 *      and it does not yet say "Not here."
 * W5 — A Short's page is "Not here."
 * W6 — Off, a recent video's page is plain YouTube.
 */

import { SWITCHED_OFF_ATTRIBUTE } from "@censor/lib/content/selectors"
import { expect, test } from "@censor/playwright/fixture"
import type { Page } from "@playwright/test"

test("W1: no comments render, unless off", async ({ fixture }) => {
  const page = await fixture.goto("yt-comments")
  const comments = page.locator("[data-comments]")
  await expect(comments).toHaveCount(5)
  for (const el of await comments.all()) await expect(el).toBeHidden()
  await expect(page.locator("#description-panel")).toBeVisible()

  await page.evaluate(
    (attribute) => document.documentElement.setAttribute(attribute, ""),
    SWITCHED_OFF_ATTRIBUTE
  )
  for (const el of await comments.all()) await expect(el).toBeVisible()
})

// ── The page's own video ─────────────────────────────────────────────────────

const NOT_HERE = "[data-boyo-not-here]"

async function watchView(page: Page, view: string): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("data-boyo-watch", view)
}

/** A play the page asks for, and whether it is still playing after a beat. */
async function playsThrough(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const video = document.querySelector("video")
    if (video === null) return false
    void video.play().catch(() => undefined)
    await new Promise((r) => setTimeout(r, 100))
    return !video.paused
  })
}

test("W2: an old video's page shows as YouTube shows it", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-watch-page")
  await watchView(page, "plated")
  await expect(page.locator("#primary-inner")).toBeVisible()
  await expect(page.locator(NOT_HERE)).toHaveCount(0)
  await expect(page).toHaveTitle("Me at the zoo - YouTube")
  expect(await playsThrough(page), "the control for W3 and W4").toBe(true)
})

test('W3: a recent video\'s page is "Not here.", with nothing of the video', async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-watch-page")
  await watchView(page, "plated")
  await page.evaluate(() => {
    const runs = document.querySelectorAll("#info > span")
    const age = runs[runs.length - 1]
    if (age) age.textContent = "3 hours ago"
  })
  await watchView(page, "absent")
  await expect(page.locator(NOT_HERE)).toHaveText("Not here.Back")
  await expect(page.getByRole("button", { name: "Back" })).toBeVisible()
  await expect(page.locator("ytd-watch-flexy")).toBeHidden()
  await expect(page).toHaveTitle("YouTube")
  expect(await playsThrough(page)).toBe(false)
})

test("W4: a page whose metadata has not named its video yet shows none of it", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-watch-page")
  await watchView(page, "plated")
  await page.evaluate(() =>
    document
      .querySelector("ytd-watch-flexy")
      ?.setAttribute("video-id", "dQw4w9WgXcQ")
  )
  await watchView(page, "pending")
  await expect(page.locator("#primary-inner")).toBeHidden()
  await expect(page.locator("#secondary")).toBeVisible()
  await expect(page.locator(NOT_HERE)).toHaveCount(0)
  await expect(page).toHaveTitle("YouTube")
  expect(await playsThrough(page)).toBe(false)
})

test('W5: a Short\'s page is "Not here."', async ({ fixture }) => {
  const page = await fixture.goto("yt-watch-page")
  await watchView(page, "plated")
  await page.evaluate(() => {
    document.querySelector("ytd-watch-flexy")?.setAttribute("hidden", "")
    const shorts = document.createElement("ytd-shorts")
    shorts.textContent = "A Short"
    document.querySelector("ytd-page-manager")?.append(shorts)
  })
  await watchView(page, "absent")
  await expect(page.locator("ytd-shorts")).toBeHidden()
  await expect(page.locator(NOT_HERE)).toBeVisible()
})

test("W6: off, a recent video's page is plain YouTube", async ({ fixture }) => {
  const page = await fixture.goto("yt-watch-page")
  await page.evaluate(() => {
    const runs = document.querySelectorAll("#info > span")
    const age = runs[runs.length - 1]
    if (age) age.textContent = "3 hours ago"
  })
  await watchView(page, "absent")
  await page.evaluate(
    (attribute) => document.documentElement.setAttribute(attribute, ""),
    SWITCHED_OFF_ATTRIBUTE
  )
  await expect(page.locator("#primary-inner")).toBeVisible()
  await expect(page.locator(NOT_HERE)).toBeHidden()
})
