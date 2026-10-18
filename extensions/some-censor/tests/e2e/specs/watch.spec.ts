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
 * W8 — An old video moved into the miniplayer plays on, shown.
 * W9 — When the miniplayer goes on to another video, that video is held: the
 *      page it was opened on says nothing about it.
 * W10 — Autoplay goes on only into a video the page admits; a click is never
 *       held.
 * W11 — A music video's page is shown whole at any age (QD15): its player and
 *       its own poster, and no face control.
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

/**
 * YouTube's "i", in its order: the home page shows, the player moves into
 * the miniplayer, the app reflects it as `miniplayer-is-active`, and only
 * then, a task later, the miniplayer's title bar fills in.
 */
async function toMiniplayer(page: Page): Promise<void> {
  await page.evaluate(async () => {
    document.querySelector("ytd-watch-flexy")?.setAttribute("hidden", "")
    document.querySelector("ytd-browse")?.removeAttribute("hidden")
    const mini = document.createElement("ytd-miniplayer")
    mini.innerHTML = '<h1 class="ytdMiniplayerInfoBarTitle"></h1>'
    const video = document.querySelector("video")
    if (video) mini.append(video)
    const app = document.querySelector("ytd-app")
    app?.append(mini)
    app?.setAttribute("miniplayer-is-active", "")
    await new Promise((r) => setTimeout(r, 50))
    const bar = mini.querySelector("h1")
    if (bar) bar.textContent = "Me at the zoo"
  })
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
  await toMiniplayer(page)
  await expect(page.locator(NOT_HERE)).toHaveCount(0)
  await expect(page.locator("ytd-miniplayer")).toBeHidden()
  await expect(page).toHaveTitle("YouTube")
  expect(await playsThrough(page)).toBe(false)
})

test("W8: an old video moved into the miniplayer plays on, shown", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-watch-page")
  await watchView(page, "plated")
  expect(await playsThrough(page), "playing before the move").toBe(true)
  await toMiniplayer(page)
  await expect(page.locator("ytd-miniplayer")).toBeVisible()
  await watchView(page, "plated")
  // Still playing, untouched: the move never read as another video.
  expect(
    await page.evaluate(() => document.querySelector("video")?.paused)
  ).toBe(false)
})

test("W9: the miniplayer going on to another video holds it", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-watch-page")
  await watchView(page, "plated")
  await toMiniplayer(page)
  await watchView(page, "plated")
  // Autoplay in the miniplayer: only its title bar follows the new video.
  await page.evaluate(() => {
    const bar = document.querySelector(".ytdMiniplayerInfoBarTitle")
    if (bar) bar.textContent = "A video posted an hour ago"
  })
  await watchView(page, "pending")
  await expect(page.locator("ytd-miniplayer")).toBeHidden()
  expect(await playsThrough(page)).toBe(false)
})

test("W10: autoplay goes on only into a video the page admits", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-watch-page")
  await watchView(page, "plated")
  // Two up-next cards: one old, one recent.
  await page.evaluate(() => {
    const card = (id: string, age: string): string =>
      `<ytd-compact-video-renderer><a id="video-title" href="/watch?v=${id}">${id}</a><ytd-channel-name><yt-formatted-string>Chan</yt-formatted-string></ytd-channel-name><a href="/@Chan">Chan</a><div id="metadata-line"><span>1M views</span><span>${age}</span></div></ytd-compact-video-renderer>`
    const secondary = document.querySelector("#secondary")
    if (secondary)
      secondary.innerHTML =
        card("old_next", "9 years ago") + card("new_next", "3 hours ago")
  })
  await expect(page.locator('[data-boyo-vid="old_next"]')).toHaveAttribute(
    "data-boyo",
    "plated"
  )
  await expect(page.locator('[data-boyo-vid="new_next"]')).toHaveAttribute(
    "data-boyo",
    "absent"
  )
  // Whether YouTube's app would see a navigation, as YouTube sends it.
  const reaches = (videoId: string, autonav?: string): Promise<boolean> =>
    page.evaluate(
      ([id, nav]) => {
        let reached = false
        const app = new AbortController()
        window.addEventListener(
          "yt-navigate",
          () => {
            reached = true
          },
          { signal: app.signal }
        )
        document.querySelector("ytd-watch-flexy")?.dispatchEvent(
          new CustomEvent("yt-navigate", {
            bubbles: true,
            composed: true,
            detail: {
              endpoint: { watchEndpoint: { videoId: id } },
              tempData: { autonav: nav },
            },
          })
        )
        app.abort()
        return reached
      },
      [videoId, autonav] as const
    )
  // Autoplay into the old one goes on; into the recent or an unseen one it is
  // held; a click on the recent one is the owner's own and is never held.
  expect(await reaches("old_next", "1")).toBe(true)
  expect(await reaches("new_next", "1")).toBe(false)
  expect(await reaches("unseen", "1")).toBe(false)
  expect(await reaches("new_next")).toBe(true)
})

test("W11: a music video's page is shown whole, at any age", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-watch-page")
  await watchView(page, "plated")
  await page.evaluate(() => {
    const title = document.querySelector("#title yt-formatted-string")
    if (title) title.textContent = "[MV] Stay With Me (Goblin OST)"
  })
  await setAge(page, "3 hours ago")
  await watchView(page, "whole")
  await expect(page.locator("#primary-inner")).toBeVisible()
  // The player's own poster, and no face control: nothing is plated.
  expect(
    await page
      .locator("#movie_player > .ytp-cued-thumbnail-overlay > div")
      .evaluate((el) => getComputedStyle(el).backgroundImage.includes("url("))
  ).toBe(true)
  await expect(page.locator("[data-boyo-face-hold]")).toHaveCount(0)
  expect(await playsThrough(page)).toBe(true)
})
