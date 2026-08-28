/**
 * Screenshot pixel sampling for e2e specs.
 *
 * `getComputedStyle` never reflects `filter` compositing — it reports the
 * declared value, not what the browser paints. Most of this suite reasons
 * about declared values because that is all it can reach, but a whole class
 * of this extension's bugs lives in the gap between the two: a surface
 * declared white is dark only if something actually filters it, and there
 * are three places where nothing does (the raw ticks before the root
 * filter's output covers newly materialised content, the top layer, and the
 * root scrollbar). Only pixels can tell those apart from the correct case.
 *
 * Shared by `legacy-invert-regimes.spec.ts` and
 * `issue-741-auto-defects.spec.ts`.
 */

import type { BrowserContext, Page } from "@playwright/test"

export type Region = { x: number; y: number; width: number; height: number }

export type SampledColor = {
  color: readonly [number, number, number]
  luminance: number
}

/** Dark enough that a human reads it as "the page is dark", not a flash. */
export const DARK = 0.05

/** WCAG 2.1 relative luminance, matching src/lib/content/color.ts. */
export function luminance8Bit([r, g, b]: readonly [
  number,
  number,
  number,
]): number {
  const lin = (channel: number): number => {
    const s = channel / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function describeColor(c: readonly [number, number, number]): string {
  const hex = c.map((v) => v.toString(16).padStart(2, "0")).join("")
  return `rgb(${c.join(", ")}) #${hex}`
}

/**
 * The viewport minus the classic scrollbar gutter.
 *
 * The root scrollbar is painted outside the root filter's render surface —
 * the same property that makes the top layer interesting here, and verified
 * the same way: a scrollbar declared `scrollbar-color: #00ff00 #ff0000`
 * under the legacy invert preset renders red and green, not the cyan and
 * magenta an inversion would produce. It is browser chrome rather than a
 * surface this extension declares, so it stays out of frame for these
 * assertions; `clientWidth` excludes it where `innerWidth` would not.
 */
export function contentWidth(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.clientWidth)
}

/**
 * The brightest distinct colour in `region` of a screenshot of `page`.
 *
 * Decoding happens in a scratch page rather than in `page` itself: `page` is
 * the thing under test and may be sitting under a root filter, and a canvas
 * drawn there would be one more surface for that filter to act on. A 2D
 * context's `getImageData` returns the bitmap that was drawn into it — CSS
 * filters never touch it — but keeping the decode off the filtered document
 * removes the question entirely.
 */
export async function brightestIn(
  page: Page,
  context: BrowserContext,
  region: Region
): Promise<SampledColor> {
  const shot = await page.screenshot({ clip: region, type: "png" })
  const scratch = await context.newPage()
  let sampled: Array<[number, number, number]>
  try {
    sampled = await scratch.evaluate(async (b64: string) => {
      const img = new Image()
      img.src = `data:image/png;base64,${b64}`
      await img.decode()
      const canvas = document.createElement("canvas")
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext("2d")
      if (ctx === null) throw new Error("no 2d context")
      ctx.drawImage(img, 0, 0)
      const { data } = ctx.getImageData(0, 0, img.width, img.height)
      const seen = new Map<string, [number, number, number]>()
      // Stride the grid rather than reading every pixel: a flat fill is the
      // expected result and a flash is never a single stray pixel, so a
      // sample every 4px in both axes is ample and keeps this fast.
      for (let y = 0; y < img.height; y += 4) {
        for (let x = 0; x < img.width; x += 4) {
          const i = (y * img.width + x) * 4
          const px: [number, number, number] = [
            data[i] ?? 0,
            data[i + 1] ?? 0,
            data[i + 2] ?? 0,
          ]
          seen.set(px.join(","), px)
        }
      }
      return Array.from(seen.values())
    }, shot.toString("base64"))
  } finally {
    await scratch.close()
  }

  const ranked = sampled
    .map((color) => ({ color, luminance: luminance8Bit(color) }))
    .sort((a, b) => b.luminance - a.luminance)
  const top = ranked[0]
  if (top === undefined) throw new Error("no pixels sampled")
  return top
}

/** The whole viewport of `page`, excluding the scrollbar gutter. */
export async function viewportRegion(page: Page): Promise<Region> {
  const size = page.viewportSize()
  if (size === null) throw new Error("no viewport")
  return { x: 0, y: 0, width: await contentWidth(page), height: size.height }
}
