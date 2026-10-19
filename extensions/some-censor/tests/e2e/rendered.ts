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

/** The fixtures' vivid image, as a URL an `<img>` or a stylesheet takes. */
export const VIVID =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='100%25' height='100%25' fill='%23f0f'/%3E%3C/svg%3E"

/** How far red and blue must each stand above green to read as magenta. */
const VIVID_MARGIN = 40

type Rgb = readonly [number, number, number]

/**
 * The colours of the region the target's box covers, and how many pixels
 * of each. The page is shot, not the element: an element shot waits for
 * the element to be visible, and a hidden one is the case in question. An
 * element with no box covers nothing.
 */
async function regionColors(
  target: Locator
): Promise<ReadonlyArray<{ color: Rgb; count: number }>> {
  await target.evaluate((el) => {
    el.scrollIntoView({ block: "center", inline: "center" })
  })
  const box = await target.boundingBox()
  if (box === null || box.width < 1 || box.height < 1) return []
  const page = target.page()
  const shot = await page.screenshot({ clip: box, animations: "disabled" })
  return colorsIn(page, shot)
}

const count = (
  colors: ReadonlyArray<{ color: Rgb; count: number }>,
  keep: (color: Rgb) => boolean
): number => colors.reduce((n, c) => (keep(c.color) ? n + c.count : n), 0)

/**
 * How many pixels of the region the target's box covers are the fixtures'
 * magenta, at any strength: red and blue each well above green, as magenta
 * stays under an opacity or a dimming filter (#f0f at 0.35 brightness is
 * 89, 0, 89). The plate's tones and the extension's text are near-grey, so
 * none of them reads as vivid.
 */
export async function vividPixels(target: Locator): Promise<number> {
  return count(
    await regionColors(target),
    ([r, g, b]) => r - g > VIVID_MARGIN && b - g > VIVID_MARGIN
  )
}

/**
 * How many pixels of the region the target's box covers differ from
 * `ground`, the page's background, by more than a rounding error in any
 * channel: whether anything at all is painted there. For a blurred and
 * dimmed image, whose magenta can fall under {@link vividPixels}' margin.
 */
export async function paintedPixels(
  target: Locator,
  ground: Rgb
): Promise<number> {
  const [gr, gg, gb] = ground
  return count(
    await regionColors(target),
    ([r, g, b]) =>
      Math.abs(r - gr) > 4 || Math.abs(g - gg) > 4 || Math.abs(b - gb) > 4
  )
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
