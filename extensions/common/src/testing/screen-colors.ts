/**
 * What a screenshot shows, for e2e specs whose claim is about the rendered
 * output rather than a style the code declared: each distinct colour in a
 * PNG shot, with how many sampled pixels have it.
 *
 * The PNG is decoded on a canvas in `decoder`, a page the caller chooses: a
 * scratch page when the page under test may sit under a filter that would
 * put the decode itself in question, or the page under test when nothing
 * filters it. A `data:` PNG does not taint the canvas.
 */

import type { Page } from "@playwright/test"

export type ShotColor = {
  color: readonly [number, number, number]
  /** Sampled pixels of this colour: every `stride`th pixel on each axis. */
  count: number
}

export async function colorsIn(
  decoder: Page,
  shot: Buffer,
  stride = 1
): Promise<Array<ShotColor>> {
  return decoder.evaluate(
    async ([b64, step]): Promise<Array<ShotColor>> => {
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
      const seen = new Map<string, ShotColor>()
      for (let y = 0; y < img.height; y += step) {
        for (let x = 0; x < img.width; x += step) {
          const i = (y * img.width + x) * 4
          const color = [
            data[i] ?? 0,
            data[i + 1] ?? 0,
            data[i + 2] ?? 0,
          ] as const
          const key = color.join(",")
          const known = seen.get(key)
          if (known === undefined) seen.set(key, { color, count: 1 })
          else known.count += 1
        }
      }
      return Array.from(seen.values())
    },
    [shot.toString("base64"), stride] as const
  )
}
