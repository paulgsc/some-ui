/**
 * BOYO — rendered-output oracles (#1389, QC7)
 *
 * A claim that something is not visible is read off what the browser drew,
 * never off a stamp, a class or a computed style the extension wrote: a
 * stamp can be right while the paint is wrong. The fixtures paint every
 * image in one vivid colour, magenta (#f0f), which nothing the extension
 * draws comes near, so "no magenta pixel in this region" is "no image of
 * that region is on screen".
 *
 * Each oracle is evidence only with its negative control: the same region
 * must show magenta once the occlusion is taken away (the off switch, or a
 * mutant stylesheet), or the region was empty to begin with.
 */

import type { Locator, Page } from "@playwright/test"

/**
 * How many pixels of the region the target's box covers are the fixtures'
 * vivid magenta. The page is shot, not the element: an element shot waits
 * for the element to be visible, and a hidden one is the case in question.
 * An element with no box covers nothing, so it reads 0.
 */
export async function vividPixels(target: Locator): Promise<number> {
  await target.evaluate((el) => {
    el.scrollIntoView({ block: "center", inline: "center" })
  })
  const box = await target.boundingBox()
  if (box === null || box.width < 1 || box.height < 1) return 0
  const page = target.page()
  const png = await page.screenshot({ clip: box, animations: "disabled" })
  return page.evaluate(async (b64): Promise<number> => {
    const image = new Image()
    image.src = `data:image/png;base64,${b64}`
    await image.decode()
    const canvas = document.createElement("canvas")
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext("2d")
    if (context === null) return -1
    context.drawImage(image, 0, 0)
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    let vivid = 0
    for (let i = 0; i + 2 < data.length; i += 4) {
      const r = data[i] ?? 0
      const g = data[i + 1] ?? 0
      const b = data[i + 2] ?? 0
      if (r > 200 && g < 70 && b > 200) vivid += 1
    }
    return vivid
  }, png.toString("base64"))
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
