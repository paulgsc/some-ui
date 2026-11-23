/**
 * How each asset made alone is made (ASSETS-R, C1300), for `record:asset`
 * (`./asset`) and its spec. It reads only from `root`, the episode's folder
 * on home, and writes only `<out>/<its file>` (`ASSET_FILE`), the work folder
 * home's worker hands it: home, not this, puts the file beside the video.
 *
 * Where things go wrong, it leaves nothing it shouldn't:
 *
 * - **Never overwrites.** An asset already in `out` is refused before
 *   anything is drawn, and the final step is a hard link, which fails rather
 *   than replace a file that appeared since.
 * - **No half file.** The bytes go to `.<file>.partial` in `out` first, then
 *   are linked into place whole; the partial is removed however the make
 *   ends, so a make that fails leaves `out` as it found it, but for a
 *   partial a killed process can't remove (home sweeps those).
 * - **Same bytes.** A thumbnail is drawn by the one template the recorders
 *   use (C1026, `./thumbnail`), from facts read by the recorders' own
 *   functions (`./thumbnail-facts`), so the same folder gives the same file.
 */

import { link, readFile, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { Browser } from "@playwright/test"
import type { Genre } from "@some-ui/styles/brand/genres"
import { parseCutList } from "@some-ui/video-render"
import type { CutList, Parsed } from "@some-ui/video-render"
import { ASSET_FILE } from "@some-ui/video-render/assets"
import type { AloneAsset } from "@some-ui/video-render/assets"
import { thumbnailInput } from "@some-ui/video-render/thumbnail"

import { drawThumbnail } from "./thumbnail"
import { FACTS_FROM_FOLDER } from "./thumbnail-facts"

/** Where an asset is made to: the work folder home hands, and only there. */
export const madePath = (out: string, asset: AloneAsset): string =>
  join(out, ASSET_FILE[asset])

/** Where its bytes are written before they are put in place. */
const partialPath = (out: string, asset: AloneAsset): string =>
  join(out, `.${ASSET_FILE[asset]}.partial`)

const exists = async (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false
  )

/** `root`'s cut list, or why it can't be read. */
async function cutListOf(root: string): Promise<Parsed<CutList>> {
  const path = join(root, "cut-list.json")
  let raw: unknown
  try {
    raw = JSON.parse(await readFile(path, "utf8"))
  } catch {
    return { ok: false, problems: [`${path} can't be read`] }
  }
  return parseCutList(raw)
}

/** Each asset made alone: its bytes, drawn from `root`, or why not. */
const DRAW: {
  readonly [A in AloneAsset]: (
    browser: Browser,
    feed: Genre,
    root: string
  ) => Promise<Parsed<Buffer>>
} = {
  thumbnail: async (browser, feed, root) => {
    const facts = await FACTS_FROM_FOLDER[feed](root)
    if (!facts.ok) return facts
    const cut = await cutListOf(root)
    if (!cut.ok) return cut
    return drawThumbnail(browser, thumbnailInput(facts.value, cut.value))
  },
}

/**
 * `asset` of the episode in `root`, made into `out`: the file it wrote, or
 * why it made none. Never rejects for a refusal; an error of the drive
 * itself (out not writable, say) rejects, and still leaves no partial.
 */
export async function makeAsset(
  browser: Browser,
  asset: AloneAsset,
  feed: Genre,
  root: string,
  out: string
): Promise<Parsed<string>> {
  const made = madePath(out, asset)
  if (await exists(made))
    return { ok: false, problems: [`${made} is already made`] }
  const drawn = await DRAW[asset](browser, feed, root)
  if (!drawn.ok) return drawn
  const partial = partialPath(out, asset)
  try {
    await writeFile(partial, drawn.value)
    await link(partial, made)
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST")
      return { ok: false, problems: [`${made} was made meanwhile`] }
    throw error
  } finally {
    await rm(partial, { force: true })
  }
  return { ok: true, value: made }
}
