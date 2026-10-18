/**
 * BOYO — the plate (QD12, #1804)
 *
 * P1 — A plated card's thumbnail and channel photo leave zero visible pixels:
 *      the card's box renders the same with the image removed. The fill and
 *      the disc are the plate's own tones, and the disc carries the initial.
 * P2 — The plate is pixel-identical across reloads.
 * P3 — The title, channel name and duration are visible, and one click on
 *      the title or the plate opens the watch page.
 * P4 — The hover preview never shows.
 */

import { expect, test } from "@censor/playwright/fixture"
import type { Page } from "@playwright/test"

const CARDS = {
  poly: {
    id: "vid_plate01",
    thumb: "#poly a#thumbnail",
    disc: "#poly #channel-thumbnail yt-img-shadow",
    initial: '"P"',
  },
  lockup: {
    id: "vid_plate02",
    thumb: "#lockup .ytThumbnailViewModelImage",
    disc: "#lockup .ytSpecAvatarShapeHost",
    initial: '"L"',
  },
} as const

async function plated(page: Page): Promise<void> {
  await expect(page.locator("#poly")).toHaveAttribute("data-boyo", "plated")
  await expect(page.locator("#lockup")).toHaveAttribute("data-boyo", "plated")
}

/** Is `selector`'s computed `prop` the colour the card's `variable` names? */
async function paintedWith(
  page: Page,
  selector: string,
  variable: string,
  pseudo: string | null = null
): Promise<boolean> {
  return page.evaluate(
    ([sel, v, p]) => {
      const el = document.querySelector(sel)
      const card = el?.closest("[data-boyo]")
      if (!(el instanceof HTMLElement) || !(card instanceof HTMLElement))
        return false
      const probe = document.createElement("div")
      probe.style.color = card.style.getPropertyValue(v)
      document.body.appendChild(probe)
      const expected = getComputedStyle(probe).color
      probe.remove()
      return (
        expected !== "" && getComputedStyle(el, p).backgroundColor === expected
      )
    },
    [selector, variable, pseudo] as const
  )
}

test("P1: no pixel of a plated card's images is visible", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-plate")
  await plated(page)

  for (const [name, card] of Object.entries(CARDS)) {
    const box = page.locator(`#${name}`)
    const before = await box.screenshot()
    await page.evaluate((n) => {
      for (const img of document.querySelectorAll(`#${n} img`)) img.remove()
    }, name)
    expect(
      await box.screenshot(),
      `${name} renders without its images`
    ).toEqual(before)

    expect(await paintedWith(page, card.thumb, "--boyo-plate"), name).toBe(true)
    expect(await paintedWith(page, card.disc, "--boyo-disc"), name).toBe(true)
    const letter = await page
      .locator(card.disc)
      .evaluate((el) => getComputedStyle(el, "::after").content)
    expect(letter, `${name}'s initial`).toBe(card.initial)
  }
})

test("P2: the plate is pixel-identical across reloads", async ({ fixture }) => {
  const page = await fixture.goto("yt-plate")
  await plated(page)
  const shots = async (): Promise<Array<Buffer>> =>
    Promise.all(
      Object.values(CARDS).map(async (c) => page.locator(c.thumb).screenshot())
    )
  const first = await shots()
  await page.reload()
  await plated(page)
  expect(await shots()).toEqual(first)
})

test("P3: a plated card reads and opens in one click", async ({ fixture }) => {
  const page = await fixture.goto("yt-plate")
  await plated(page)
  await expect(page.locator("#poly #video-title")).toBeVisible()
  await expect(page.locator("#poly ytd-channel-name a")).toBeVisible()
  await expect(page.locator("#poly .ytBadgeShapeText")).toBeVisible()
  await expect(page.locator("#lockup .ytBadgeShapeText")).toBeVisible()

  // The link one click activates, with the navigation itself cancelled: a
  // fixture's `/watch` has no page to open.
  await page.evaluate(() => {
    // Lifetime: the test's page, which closes with its context.
    // eslint-disable-next-line extension-charter/require-scoped-lifetime
    document.addEventListener("click", (e) => {
      const link = e.target instanceof Element ? e.target.closest("a") : null
      document.body.dataset["opened"] = link?.getAttribute("href") ?? ""
      e.preventDefault()
    })
  })
  for (const [selector, href] of [
    ["#poly #video-title", "/watch?v=vid_plate01"],
    [CARDS.poly.thumb, "/watch?v=vid_plate01"],
    [CARDS.lockup.thumb, "/watch?v=vid_plate02"],
  ] as const) {
    await page.locator(selector).click()
    await expect(page.locator("body"), selector).toHaveAttribute(
      "data-opened",
      href
    )
  }
})

test("P4: the hover preview never shows", async ({ fixture }) => {
  const page = await fixture.goto("yt-plate")
  await plated(page)
  await expect(page.locator("#preview")).toBeHidden()
})
