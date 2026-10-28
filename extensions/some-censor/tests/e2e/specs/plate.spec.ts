/**
 * BOYO — the plate (QD12, #1804)
 *
 * P1 — A plated card's thumbnail and channel photo leave zero visible pixels:
 *      no vivid pixel is in the card's box, which renders the same with the
 *      images removed, and the thumbnail and disc show their images once a
 *      mutant lifts what hides them. The fill and the disc are the plate's
 *      own tones, and the disc carries the initial.
 * P2 — The plate is pixel-identical across reloads.
 * P3 — One click on the title, channel name or duration opens its link;
 *      the plate takes no pointer.
 * P4 — The hover preview never shows.
 * P5 — On every fixture, an image or background image put under any plated
 *      card is not painted, whatever the card's shape: no vivid pixel is on
 *      screen, and the same probes paint once a mutant undoes the plate.
 * P6 — No channel photo outside a card is visible while the extension is on,
 *      and off is plain YouTube.
 * P7 — The same for the page header's images and the player's overlays, read
 *      off the screen, each painting once the extension is off.
 * P8 — Music mix shows a community post's own image, never its author's photo
 *      nor one under a plated card; Standard shows neither (#1966).
 */

import { SWITCHED_OFF_ATTRIBUTE } from "@censor/lib/content/selectors"
import { expect, test } from "@censor/playwright/fixture"
import { mutant, VIVID, vividPixels } from "@censor/playwright/rendered"
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
    expect(await vividPixels(box), `${name} shows no image`).toBe(0)
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

  // The control, on a fresh page: lift every rule hiding a plated card's
  // images (the plate's, and the channel photos' on the disc), and the
  // thumbnail and the disc show theirs. (Off is no control here: the
  // plate's rules hold on a stamped card, and the fixture's own images
  // outside a card would paint the box from behind.)
  await page.reload()
  await plated(page)
  await mutant(
    page,
    `html:root body [data-boyo="plated"] img { visibility: visible !important }`
  )
  for (const [name, card] of Object.entries(CARDS)) {
    for (const part of [card.thumb, card.disc]) {
      expect(
        await vividPixels(page.locator(part)),
        `${name}: ${part} shows its image without the plate`
      ).toBeGreaterThan(0)
    }
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
    // An image and a background image put under every plated card, in the
    // fixtures' vivid colour, whatever the card's own shape.
    // Each decoded before the first shot, so none reads 0 for not having
    // loaded yet; `flex: none`, so no flex card squeezes one to nothing.
    await page.evaluate(async (vivid) => {
      const size = "display:block;flex:none;width:24px;height:24px"
      const decoding: Array<Promise<void>> = []
      for (const card of document.querySelectorAll('[data-boyo="plated"]')) {
        const img = document.createElement("img")
        img.className = "probe"
        img.src = vivid
        img.style.cssText = size
        const painted = document.createElement("div")
        painted.className = "probe"
        painted.style.cssText = `${size};background-image:url("${vivid}")`
        card.append(img, painted)
        decoding.push(img.decode())
      }
      const background = new Image()
      background.src = vivid
      await Promise.all([...decoding, background.decode()])
    }, VIVID)
    const probes = await page.locator('[data-boyo="plated"] .probe').all()
    let shown = 0
    for (const probe of probes) {
      expect(await vividPixels(probe), name).toBe(0)
    }

    // The control: undo the plate, and the same probes paint.
    const restore = await mutant(
      page,
      `html body [data-boyo="plated"] img.probe { visibility: visible !important }
       html body [data-boyo="plated"] div.probe { background-image: url("${VIVID}") !important }`
    )
    for (const probe of probes) {
      if ((await vividPixels(probe)) > 0) shown += 1
    }
    await restore()
    expect(shown, `${name}: every probe paints without the plate`).toBe(
      probes.length
    )
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

test("P7: no header or player image paints, unless off", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-headers")
  const images = await page.locator("#images [data-name]").all()
  expect(images).toHaveLength(16)
  for (const image of images) {
    const name = await image.getAttribute("data-name")
    expect(await vividPixels(image), `${name ?? ""} paints nothing`).toBe(0)
  }

  // The control: off, every one of them paints.
  await page.evaluate(
    (attribute) => document.documentElement.setAttribute(attribute, ""),
    SWITCHED_OFF_ATTRIBUTE
  )
  for (const image of images) {
    const name = await image.getAttribute("data-name")
    expect(
      await vividPixels(image),
      `${name ?? ""} paints when off`
    ).toBeGreaterThan(0)
  }
})

test("P8: Music mix shows a post's image, never its author's photo", async ({
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

  await fixture.settings({ mode: "mix" })
  await expect(page.locator("html")).toHaveAttribute("data-boyo-posts", "shown")
  expect(await vividPixels(image)).toBeGreaterThan(0)
  expect(await vividPixels(author)).toBe(0)

  // A post inside a plated card stays plated (QD12).
  await page.locator("#posts").evaluate((el) => {
    el.dataset["boyo"] = "plated"
  })
  expect(await vividPixels(image)).toBe(0)
  await page.locator("#posts").evaluate((el) => {
    delete el.dataset["boyo"]
  })

  // The author's photo paints once the extension is off.
  await page.evaluate(
    (attribute) => document.documentElement.setAttribute(attribute, ""),
    SWITCHED_OFF_ATTRIBUTE
  )
  expect(await vividPixels(author)).toBeGreaterThan(0)
})
