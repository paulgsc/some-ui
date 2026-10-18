/**
 * BOYO — rendered-output oracles (#1389, QC7)
 *
 * A claim that something is not visible is read off what the browser drew,
 * never off a stamp, a class or a computed style the extension wrote: a
 * stamp can be right while the paint is wrong. The fixtures paint every
 * image in one vivid colour, magenta (#f0f), which nothing the extension
 * draws comes near, so "no magenta pixel in this region" is "no image of
 * that region is on screen", dimmed or not.
 *
 * Each oracle is evidence only with its negative control: the same region
 * must show magenta once the occlusion is taken away (the off switch, or a
 * mutant stylesheet), or the region was empty to begin with.
 */

import type { Locator, Page } from "@playwright/test"
import { colorsIn } from "@some-extension/common/testing"

/** How far red and blue must each stand above green to read as magenta. */
const VIVID_MARGIN = 40

/**
 * How many pixels of the region the target's box covers are the fixtures'
 * magenta, at any strength: red and blue each well above green, as magenta
 * stays under an opacity or a dimming filter (#f0f at 0.35 brightness is
 * 89, 0, 89). The plate's tones and the extension's text are near-grey, so
 * none of them reads as vivid.
 *
 * The page is shot, not the element: an element shot waits for the
 * element to be visible, and a hidden one is the case in question. An
 * element with no box covers nothing, so it reads 0.
 */
export async function vividPixels(target: Locator): Promise<number> {
  await target.evaluate((el) => {
    el.scrollIntoView({ block: "center", inline: "center" })
  })
  const box = await target.boundingBox()
  if (box === null || box.width < 1 || box.height < 1) return 0
  const page = target.page()
  const shot = await page.screenshot({ clip: box, animations: "disabled" })
  let vivid = 0
  for (const { color, count } of await colorsIn(page, shot)) {
    const [r, g, b] = color
    if (r - g > VIVID_MARGIN && b - g > VIVID_MARGIN) vivid += count
  }
  return vivid
}

/**
 * A mutant: a stylesheet that undoes one occlusion, for a negative control.
 * Its rules must outrank the extension's (`html body` and `!important`).
 * Returns the function that takes it away.
 */
export async function mutant(
  page: Page,
  css: string
): Promise<() => Promise<void>> {
  const style = await page.addStyleTag({ content: css })
  return async (): Promise<void> => {
    await style.evaluate((el) => {
      el.parentNode?.removeChild(el)
    })
  }
}
