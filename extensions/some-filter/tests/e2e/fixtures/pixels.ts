/**
 * Screenshot pixel sampling for e2e specs.
 *
 * `getComputedStyle` reports declared values, never `filter` compositing. A
 * surface declared white is dark only if something filters it, and three
 * places are not filtered: raw ticks before the root filter covers new
 * content, the top layer, and the root scrollbar. Only pixels tell those
 * apart.
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
 * The viewport minus the classic scrollbar gutter. The root scrollbar is
 * painted outside the root filter (verified: declared green/red renders
 * green/red under the invert preset), and is browser chrome, so it stays
 * out of frame; `clientWidth` excludes it.
 */
export function contentWidth(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.clientWidth)
}

/**
 * The brightest distinct colour in `region` of a screenshot of `page`.
 *
 * Decoded in a scratch page rather than `page`, which may sit under a root
 * filter, so the decode is never in question.
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
      // A 4px stride: a flat fill is expected and a flash is never a single
      // stray pixel.
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
