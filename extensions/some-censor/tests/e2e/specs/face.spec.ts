/**
 * BOYO — the poster and the face (#1805, QD12, QD13)
 *
 * F1 — A plated video's poster is the plate: no pixel of the player's own
 *      vivid poster is on screen (F2's face is the control: the same region
 *      shows it once held).
 * F2 — Held for three seconds, by the keyboard or the pointer, the control
 *      shows the real poster and goes; an early release changes nothing.
 * F3 — A navigation forgets the face: the plate and the control are back.
 * F4 — Under `prefers-reduced-motion` the control's fill does not animate.
 * F5 — When YouTube draws the description again, the control comes back.
 */

import { expect, test } from "@censor/playwright/fixture"
import { vividPixels } from "@censor/playwright/rendered"
import type { Page } from "@playwright/test"

const CONTROL = "[data-boyo-face-hold]"
const POSTER = "#movie_player > .ytp-cued-thumbnail-overlay > div"

/**
 * Whether the poster paints the player's own image, read off the screen:
 * the fixture's poster is vivid, and the plate is not (QC7).
 */
async function showsFace(page: Page): Promise<boolean> {
  return (await vividPixels(page.locator(POSTER))) > 0
}

async function plated(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute(
    "data-boyo-watch",
    "plated"
  )
}

test("F1: a plated video's poster is the plate", async ({ fixture }) => {
  const page = await fixture.goto("yt-watch-page")
  await plated(page)
  expect(await showsFace(page)).toBe(false)
  const fill = await page
    .locator(POSTER)
    .evaluate((el) => getComputedStyle(el).backgroundImage)
  expect(fill).toContain("linear-gradient")
  await expect(page.locator(CONTROL)).toHaveText(
    "Hold to show the original thumbnail"
  )
})

test("F2: a full hold shows the face, and an early release does not", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-watch-page")
  await plated(page)
  const control = page.locator(CONTROL)

  await control.focus()
  await page.keyboard.down(" ")
  await page.waitForTimeout(1_500)
  await page.keyboard.up(" ")
  await page.waitForTimeout(2_000)
  expect(await showsFace(page), "released at 1.5 s").toBe(false)

  const box = await control.boundingBox()
  if (box === null) throw new Error("the control has no box")
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(3_300)
  await page.mouse.up()
  await expect(page.locator("html")).toHaveAttribute("data-boyo-face", "")
  expect(await showsFace(page)).toBe(true)
  await expect(control).toHaveCount(0)
})

test("F3: a navigation forgets the face", async ({ fixture }) => {
  const page = await fixture.goto("yt-watch-page")
  await plated(page)
  await page.locator(CONTROL).focus()
  await page.keyboard.down("Enter")
  await page.waitForTimeout(3_300)
  await page.keyboard.up("Enter")
  await expect(page.locator("html")).toHaveAttribute("data-boyo-face", "")

  await page.evaluate(() =>
    window.dispatchEvent(new Event("yt-navigate-finish"))
  )
  await expect(page.locator("html")).not.toHaveAttribute("data-boyo-face")
  expect(await showsFace(page)).toBe(false)
  await expect(page.locator(CONTROL)).toBeVisible()
})

test("F4: reduced motion drops the fill's animation", async ({ fixture }) => {
  const page = await fixture.goto("yt-watch-page")
  await page.emulateMedia({ reducedMotion: "reduce" })
  await plated(page)
  await page.locator(CONTROL).focus()
  await page.keyboard.down(" ")
  await expect(page.locator(CONTROL)).toHaveAttribute("data-holding", "")
  const duration = await page
    .locator(CONTROL)
    .evaluate((el) => getComputedStyle(el, "::before").transitionDuration)
  await page.keyboard.up(" ")
  expect(duration).toBe("0s")
})

test("F5: the control comes back when the description is drawn again", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-watch-page")
  await plated(page)
  await expect(page.locator(CONTROL)).toBeVisible()
  await page.evaluate(() => {
    const inner = document.querySelector("#description-inner")
    const fresh = document.createElement("div")
    fresh.id = "description-inner"
    fresh.textContent = "A description."
    inner?.replaceWith(fresh)
  })
  await expect(page.locator(`#description-inner ${CONTROL}`)).toBeVisible()
})
