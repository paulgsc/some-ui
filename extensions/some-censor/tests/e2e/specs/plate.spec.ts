/**
 * BOYO — the plate (QD12, #1804)
 *
 * P1 — A plated card's thumbnail and channel photo leave zero visible pixels:
 *      the card's box renders the same with the image removed. The fill and
 *      the disc are the plate's own tones, and the disc carries the initial.
 * P2 — The plate is pixel-identical across reloads.
 * P3 — One click on the title, channel name or duration opens its link;
 *      the plate takes no pointer.
 * P4 — The hover preview never shows.
 * P5 — On every fixture, an image or background image put under any plated
 *      card is not painted, whatever the card's shape.
 * P6 — No channel photo outside a card is visible while the extension is on,
 *      and off is plain YouTube.
 */

import { SWITCHED_OFF_ATTRIBUTE } from "@censor/lib/content/selectors"
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

/** Is `selector`'s background the colour the card's `variable` names? */
async function paintedWith(
  page: Page,
  selector: string,
  variable: string
): Promise<boolean> {
  return page.evaluate(
    ([sel, v]) => {
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
        expected !== "" && getComputedStyle(el).backgroundColor === expected
      )
    },
    [selector, variable] as const
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
    ["#poly ytd-channel-name a", "/@plate_poly"],
    ["#poly .ytBadgeShapeText", "/watch?v=vid_plate01"],
    ["#lockup .ytLockupMetadataViewModelTitle", "/watch?v=vid_plate02"],
    ["#lockup .ytBadgeShapeText", "/watch?v=vid_plate02"],
  ] as const) {
    await page.locator(selector).click()
    await expect(page.locator("body"), selector).toHaveAttribute(
      "data-opened",
      href
    )
  }

  // The plate itself takes no pointer, so no hover there starts a preview.
  for (const card of Object.values(CARDS)) {
    const box = await page.locator(card.thumb).boundingBox()
    if (box === null) throw new Error(`${card.thumb} has no box`)
    await page.mouse.click(box.x + 20, box.y + 20)
    await expect(page.locator("body"), card.thumb).toHaveAttribute(
      "data-opened",
      ""
    )
  }
})

test("P4: the hover preview never shows", async ({ fixture }) => {
  const page = await fixture.goto("yt-plate")
  await plated(page)
  await expect(page.locator("#preview")).toBeHidden()
  await expect(page.locator("#inline-preview-player")).toBeHidden()
})

test("P5: no image under any plated card paints, on every fixture", async ({
  fixture,
}) => {
  for (const name of ["yt-home", "yt-watch", "yt-shelves", "yt-search"]) {
    const page = await fixture.goto(name)
    await page.waitForSelector('[data-boyo="plated"]')
    const leaks = await page.evaluate(() => {
      const found: Array<string> = []
      for (const card of document.querySelectorAll('[data-boyo="plated"]')) {
        const img = document.createElement("img")
        img.src =
          "data:image/gif;base64,R0lGODlhAQABAIAAAP8A/wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw=="
        const painted = document.createElement("div")
        painted.style.backgroundImage = `url("${img.src}")`
        card.append(img, painted)
        if (getComputedStyle(img).visibility !== "hidden")
          found.push(`${card.tagName} img`)
        if (getComputedStyle(painted).backgroundImage !== "none")
          found.push(`${card.tagName} background`)
      }
      return found
    })
    expect(leaks, name).toEqual([])
    await page.close()
  }
})

test("P6: no channel photo outside a card is visible, unless off", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-channel-photos")
  const photos = page.locator("#photos img")
  await expect(photos).toHaveCount(5)
  for (const photo of await photos.all()) await expect(photo).toBeHidden()

  await page.evaluate(
    (attribute) => document.documentElement.setAttribute(attribute, ""),
    SWITCHED_OFF_ATTRIBUTE
  )
  for (const photo of await photos.all()) await expect(photo).toBeVisible()
})
