/**
 * BOYO — the watch page (#1805)
 *
 * W1 — No comment, comment count or comments panel renders while the
 *      extension is on; another engagement panel stays, and off is plain
 *      YouTube.
 * W2 — An old video's page shows as YouTube shows it.
 * W3 — A recent video's page is "Not here." and Back: no player, title or
 *      date, no playback, and a tab title that is not the video's.
 * W4 — While the page still shows the previous video's date under the next
 *      video, none of it shows or plays, and it does not yet say "Not here."
 * W5 — A Short's page is "Not here."
 * W6 — Off, the stylesheet lifts from a recent video's page. (The tab title
 *      coming back on off is `runtime.test.ts`'s.)
 * W7 — A held video moved into the miniplayer stays hidden and paused, and
 *      "Not here." does not cover the page shown.
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

/** Rewrite the info line's age run, as YouTube does when the date arrives. */
async function setAge(page: Page, age: string): Promise<void> {
  await page.evaluate((text) => {
    const runs = document.querySelectorAll("#info > span")
    const run = runs[runs.length - 1]
    if (run) run.textContent = text
  }, age)
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
  await setAge(page, "3 hours ago")
  await watchView(page, "absent")
  await expect(page.locator(NOT_HERE)).toHaveText("Not here.Back")
  await expect(page.getByRole("button", { name: "Back" })).toBeVisible()
  await expect(page.locator("ytd-watch-flexy")).toBeHidden()
  await expect(page).toHaveTitle("YouTube")
  expect(await playsThrough(page)).toBe(false)
})

test("W4: the next video's page shows none of it while the old date is still up", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-watch-page")
  await watchView(page, "plated")
  // As YouTube moves to the next video: both ids at once, the date later.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("[video-id]")) {
      el.setAttribute("video-id", "dQw4w9WgXcQ")
    }
  })
  await watchView(page, "pending")
  await expect(page.locator("#primary-inner")).toBeHidden()
  await expect(page.locator("#secondary")).toBeVisible()
  await expect(page.locator(NOT_HERE)).toHaveCount(0)
  await expect(page).toHaveTitle("YouTube")
  expect(await playsThrough(page)).toBe(false)

  await setAge(page, "3 hours ago")
  await watchView(page, "absent")
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

test("W6: off, the stylesheet lifts from a recent video's page", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-watch-page")
  await setAge(page, "3 hours ago")
  await watchView(page, "absent")
  await page.evaluate(
    (attribute) => document.documentElement.setAttribute(attribute, ""),
    SWITCHED_OFF_ATTRIBUTE
  )
  await expect(page.locator("#primary-inner")).toBeVisible()
  await expect(page.locator(NOT_HERE)).toBeHidden()
})

test("W7: a held video moved into the miniplayer stays held, and says nothing", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-watch-page")
  await setAge(page, "3 hours ago")
  await watchView(page, "absent")
  await expect(page.locator(NOT_HERE)).toBeVisible()
  // YouTube's "i": the home page shows, the player moves into the miniplayer.
  await page.evaluate(() => {
    document.querySelector("ytd-watch-flexy")?.setAttribute("hidden", "")
    document.querySelector("ytd-browse")?.removeAttribute("hidden")
    const mini = document.createElement("ytd-miniplayer")
    mini.setAttribute("active", "")
    const video = document.querySelector("video")
    if (video) mini.append(video)
    document.querySelector("ytd-app")?.append(mini)
  })
  await expect(page.locator(NOT_HERE)).toHaveCount(0)
  await expect(page.locator("ytd-miniplayer")).toBeHidden()
  await expect(page).toHaveTitle("YouTube")
  expect(await playsThrough(page)).toBe(false)
})
