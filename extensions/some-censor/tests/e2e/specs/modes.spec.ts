/**
 * BOYO — the modes (#1966)
 *
 * Each mode row that differs from Standard, read off the page, and each
 * checked the other way by switching back in the same tab, live.
 *
 * M1 — Strict reads only the channel's music signs: a title token alone
 *      shows nothing of the video, and a Topic channel or the artist badge
 *      still shows it whole.
 * M2 — Strict offers no face control on a plated watch page.
 * M3 — Strict keeps autoplay from a music video in the lane: into another
 *      music video, never into a plated one.
 * M4 — Open shows a community post's own image, and never its author's
 *      photo.
 * M5 — Strict paints no card the content script has not read; Standard
 *      blurs it.
 */

import { expect, test } from "@censor/playwright/fixture"
import { paintedPixels, vividPixels } from "@censor/playwright/rendered"
import type { Page } from "@playwright/test"

/** The fixtures' vivid image: what a rendered oracle looks for. */
const VIVID =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='100%25' height='100%25' fill='%23f0f'/%3E%3C/svg%3E"

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

test("M1: Strict shows music whole by its channel's signs alone", async ({
  fixture,
}) => {
  await fixture.settings({ mode: "strict" })
  const page = await fixture.goto("yt-lane")
  // "[MV] … OST", three days old, from a channel with no sign: held.
  await expect(page.locator("#ost")).toHaveAttribute("data-boyo", "absent")
  expect(await vividPixels(page.locator("#ost img.thumb"))).toBe(0)
  for (const id of ["topic", "artist"]) {
    await expect(page.locator(`#${id}`), id).toHaveAttribute(
      "data-boyo",
      "whole"
    )
    expect(
      await vividPixels(page.locator(`#${id} img.thumb`)),
      id
    ).toBeGreaterThan(0)
  }

  await fixture.settings({ mode: "standard" })
  await expect(page.locator("#ost")).toHaveAttribute("data-boyo", "whole")
  expect(await vividPixels(page.locator("#ost img.thumb"))).toBeGreaterThan(0)
})

test("M2: Strict offers no face control", async ({ fixture }) => {
  await fixture.settings({ mode: "strict" })
  const page = await fixture.goto("yt-watch-page")
  await watchView(page, "plated")
  await expect(page.locator("#primary-inner")).toBeVisible()
  await expect(page.locator("[data-boyo-face-hold]")).toHaveCount(0)

  await fixture.settings({ mode: "standard" })
  await expect(page.locator("[data-boyo-face-hold]")).toBeVisible()
})

test("M3: Strict keeps autoplay from music in the lane", async ({
  fixture,
}) => {
  await fixture.settings({ mode: "strict" })
  const page = await fixture.goto("yt-watch-page")
  await watchView(page, "plated")
  // A music video, by its channel: whole under every mode.
  await page.evaluate(() => {
    document
      .querySelector("ytd-watch-metadata #title")
      ?.insertAdjacentHTML(
        "afterend",
        "<ytd-video-owner-renderer><ytd-channel-name><yt-formatted-string>Ailee - Topic</yt-formatted-string></ytd-channel-name></ytd-video-owner-renderer>"
      )
  })
  await setAge(page, "3 hours ago")
  await watchView(page, "whole")
  await page.evaluate(() => {
    const card = (id: string, age: string, channel: string): string =>
      `<ytd-compact-video-renderer><a id="video-title" href="/watch?v=${id}">${id}</a><ytd-channel-name><yt-formatted-string>${channel}</yt-formatted-string></ytd-channel-name><a href="/@${id}">${channel}</a><div id="metadata-line"><span>1M views</span><span>${age}</span></div></ytd-compact-video-renderer>`
    const secondary = document.querySelector("#secondary")
    if (secondary)
      secondary.innerHTML =
        card("old_next", "9 years ago", "Chan") +
        card("song_next", "3 hours ago", "Crush - Topic")
  })
  await expect(page.locator('[data-boyo-vid="old_next"]')).toHaveAttribute(
    "data-boyo",
    "plated"
  )
  await expect(page.locator('[data-boyo-vid="song_next"]')).toHaveAttribute(
    "data-boyo",
    "whole"
  )
  // Whether YouTube's app would see autoplay's navigation to `videoId`.
  const reaches = (videoId: string): Promise<boolean> =>
    page.evaluate((id) => {
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
            tempData: { autonav: "1" },
          },
        })
      )
      app.abort()
      return reached
    }, videoId)
  expect(await reaches("song_next")).toBe(true)
  expect(await reaches("old_next")).toBe(false)

  await fixture.settings({ mode: "standard" })
  await expect
    .poll(() => reaches("old_next"), { message: "Standard goes on" })
    .toBe(true)
})

test("M4: Open shows a post's image, never its author's photo", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-channel-photos")
  const image = page.locator("#posts img.post-image")
  const author = page.locator("#posts img.author")
  await expect(page.locator("html")).toHaveAttribute(
    "data-boyo-posts",
    "hidden"
  )
  expect(await vividPixels(image)).toBe(0)

  await fixture.settings({ mode: "open" })
  await expect(page.locator("html")).toHaveAttribute("data-boyo-posts", "shown")
  expect(await vividPixels(image)).toBeGreaterThan(0)
  expect(await vividPixels(author)).toBe(0)
})

test("M5: Strict paints no unread card, and Standard blurs it", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")
  await fixture.pollDebug(page, (d) => d.phase === "running")
  // A card with no video link: the stylesheet occludes it, and the content
  // script never reads it, so it stays unread for the whole test.
  await page.evaluate((src) => {
    const card = document.createElement("ytd-video-renderer")
    card.id = "unread"
    card.style.cssText = "display: block; width: 240px; height: 135px"
    const img = document.createElement("img")
    img.src = src
    img.style.cssText = "display: block; width: 100%; height: 100%"
    card.append(img)
    document.querySelector("ytd-app")?.append(card)
  }, VIVID)
  const card = page.locator("#unread")
  await expect(card).not.toHaveAttribute("data-boyo")
  // The fixture's page background, #0f0f0f.
  const ground = [15, 15, 15] as const
  expect(
    await paintedPixels(card, ground),
    "Standard: blurred"
  ).toBeGreaterThan(0)

  await fixture.settings({ mode: "strict" })
  await expect(page.locator("html")).toHaveAttribute(
    "data-boyo-loading",
    "blank"
  )
  expect(await paintedPixels(card, ground), "Strict: not painted").toBe(0)
  await expect(card).not.toHaveAttribute("data-boyo")
})
