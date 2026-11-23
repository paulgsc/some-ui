/**
 * An episode's thumbnail (EPISODES3 on #3030, C1026), drawn beside its video
 * as `thumbnail.png`: `@some-ui/video-render`'s `thumbnailPage` in a
 * headless page at 1280×720 and scale 1, its title measured at every size
 * that reads at 320×180 and drawn at the largest that fits
 * (`chooseTitleSize`). A title no such size fits gets no thumbnail, and the
 * recorder says why: Studio shows the genre's stock art instead. Home keeps
 * the file with the episode; the owner uploads it by hand (C1025).
 */

import { readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { Browser } from "@playwright/test"
import { fontFiles } from "@some-ui/video-motion/fonts"
import type { Parsed } from "@some-ui/video-render"
import { ASSET_FILE } from "@some-ui/video-render/assets"
import {
  chooseTitleSize,
  THUMBNAIL,
  thumbnailPage,
  titleSizes,
} from "@some-ui/video-render/thumbnail"
import type {
  ThumbnailFonts,
  ThumbnailInput,
  TitleMeasure,
} from "@some-ui/video-render/thumbnail"

/** video-motion's pinned Barlow Condensed, each as a `data:` URL. */
async function thumbnailFonts(): Promise<ThumbnailFonts> {
  const files = new Map(fontFiles())
  const read = async (name: string): Promise<string> => {
    const path = files.get(name)
    if (path === undefined) throw new Error(`no font ${name} in video-motion`)
    const bytes = await readFile(path)
    return `data:font/woff2;base64,${bytes.toString("base64")}`
  }
  return {
    title: await read("barlow-condensed-800.woff2"),
    label: await read("barlow-condensed-600.woff2"),
  }
}

/** `input`'s thumbnail as PNG bytes, or why its title can't be drawn. */
export async function drawThumbnail(
  browser: Browser,
  input: ThumbnailInput
): Promise<Parsed<Buffer>> {
  const fonts = await thumbnailFonts()
  const page = await browser.newPage({
    viewport: { width: THUMBNAIL.width, height: THUMBNAIL.height },
    deviceScaleFactor: 1,
  })
  try {
    await page.setContent(thumbnailPage(input, fonts), { waitUntil: "load" })
    await page.evaluate(async () => {
      await document.fonts.ready
    })
    const measured: ReadonlyArray<TitleMeasure> = await page.evaluate(
      (sizes) => {
        const title = document.querySelector<HTMLElement>("[data-title]")
        if (title === null) return []
        return sizes.map((px) => {
          title.style.fontSize = `${String(px)}px`
          return { px, width: title.scrollWidth, height: title.scrollHeight }
        })
      },
      [...titleSizes()]
    )
    const size = chooseTitleSize(input.title, measured)
    if (!size.ok) return size
    await page.setContent(thumbnailPage(input, fonts, size.value), {
      waitUntil: "load",
    })
    await page.evaluate(async () => {
      await document.fonts.ready
    })
    return {
      ok: true,
      value: await page.screenshot({
        type: "png",
        animations: "disabled",
        caret: "hide",
      }),
    }
  } finally {
    await page.close()
  }
}

/**
 * Removes `root`'s thumbnail, before its video is made again: a render that
 * fails leaves no thumbnail of an earlier run beside it.
 */
export async function clearThumbnail(root: string): Promise<void> {
  await rm(join(root, ASSET_FILE.thumbnail), { force: true })
}

/**
 * `input`'s thumbnail into `root`'s `thumbnail.png`, replacing any earlier
 * one; with a title that can't be drawn, none, and a line on stderr saying
 * why.
 */
export async function writeThumbnail(
  browser: Browser,
  root: string,
  input: ThumbnailInput
): Promise<void> {
  const file = join(root, ASSET_FILE.thumbnail)
  await clearThumbnail(root)
  const drawn = await drawThumbnail(browser, input)
  if (!drawn.ok) {
    process.stderr.write(`no thumbnail: ${drawn.problems.join("; ")}\n`)
    return
  }
  await writeFile(file, drawn.value)
  console.log(`wrote ${file}`)
}
