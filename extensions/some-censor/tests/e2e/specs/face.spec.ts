/**
 * BOYO — the poster and the face (#1805, QD12, QD13)
 *
 * F1 — A plated video's poster is the plate: no pixel of the player's own
 *      vivid poster is on screen (F2's face is the control: the same region
 *      shows it once held).
 * F2 — Held for three seconds, by the keyboard or the pointer, the control
 *      shows the real poster and goes; an early release changes nothing.
 * F3 — A navigation forgets the face: the plate and the control are back.
 * F4 — Nothing on the control changes while it is held (#1966): no fill, no
 *      progress.
 * F5 — When YouTube draws the description again, the control comes back.
 * F6 — Strict offers no control; Standard offers it again (#1966).
 * F7 — Under Open the face shows at three seconds, still held, and no key
 *      of that press reaches YouTube; "Hide original" then puts the plate
 *      back (#1966).
 */

import { expect, test } from "@censor/playwright/fixture"
import { mutant, vividPixels } from "@censor/playwright/rendered"
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

test("F4: the control looks the same while it is held", async ({ fixture }) => {
  const page = await fixture.goto("yt-watch-page")
  await plated(page)
  const control = page.locator(CONTROL)
  // Shot after the pointer is on it, so a hover style is in both.
  await control.hover()
  const before = await control.screenshot({ animations: "disabled" })
  const heldShot = async (): Promise<Buffer> => {
    await page.mouse.down()
    await page.waitForTimeout(1_500)
    const shot = await control.screenshot({ animations: "disabled" })
    await page.mouse.up()
    return shot
  }
  expect((await heldShot()).equals(before)).toBe(true)

  // Negative control: a style that changes while held is seen.
  const undo = await mutant(
    page,
    "html body [data-boyo-face-hold]:active { background: rgb(255 0 255) !important; }"
  )
  await control.hover()
  expect((await heldShot()).equals(before)).toBe(false)
  await undo()
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

test("F6: Strict offers no control", async ({ fixture }) => {
  await fixture.settings({ mode: "strict" })
  const page = await fixture.goto("yt-watch-page")
  await plated(page)
  await expect(page.locator("#primary-inner")).toBeVisible()
  await expect(page.locator(CONTROL)).toHaveCount(0)

  await fixture.settings({ mode: "standard" })
  await expect(page.locator(CONTROL)).toBeVisible()
})

test("F7: under Open the face shows while held, and can be hidden", async ({
  fixture,
}) => {
  await fixture.settings({ mode: "open" })
  const page = await fixture.goto("yt-watch-page")
  await plated(page)
  const control = page.locator(CONTROL)
  // The first keydown and keyup that reach the page, as YouTube's would.
  await page.evaluate(() => {
    const reached: Array<string> = []
    Reflect.set(window, "__KEYS__", reached)
    for (const type of ["keydown", "keyup"]) {
      document.addEventListener(type, () => reached.push(type), { once: true })
    }
  })
  const reached = (): Promise<unknown> =>
    page.evaluate((): unknown => Reflect.get(window, "__KEYS__"))

  await control.focus()
  await page.keyboard.down(" ")
  await expect(page.locator("html")).toHaveAttribute("data-boyo-face", "", {
    timeout: 4_000,
  })
  expect(await showsFace(page), "shown, still held").toBe(true)
  await expect(control).toHaveText("Hide original")
  await page.keyboard.up(" ")
  await page.waitForTimeout(200)
  expect(await showsFace(page), "the release hides nothing").toBe(true)
  expect(await reached()).toEqual([])

  await control.click()
  await expect(page.locator("html")).not.toHaveAttribute("data-boyo-face")
  expect(await showsFace(page)).toBe(false)
  await expect(control).toHaveText("Hold to show the original thumbnail")
  // The listener hears a key that is not the control's.
  await control.evaluate((el) => {
    el.blur()
  })
  await page.keyboard.press("a")
  expect(await reached()).toEqual(["keydown", "keyup"])
})
