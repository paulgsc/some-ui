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
 * - **No half file.** The bytes go to a partial of this make's own in `out`
 *   first, opened only if new, then are linked into place whole; the partial
 *   is removed however the make ends, so a make that fails leaves `out` as
 *   it found it, but for a partial a killed process can't remove (home
 *   sweeps those, `.<file>.*.partial`).
 * - **Never in `root`.** An `out` that is the episode's folder or inside it,
 *   as the drive resolves both, is refused.
 * - **Same bytes.** A thumbnail is drawn by the one template the recorders
 *   use (C1026, `./thumbnail`), from facts read by the recorders' own
 *   functions (`./thumbnail-facts`), so the same folder gives the same file.
 */

import { randomBytes } from "node:crypto"
import { link, realpath, rm, stat, writeFile } from "node:fs/promises"
import { isAbsolute, join, relative } from "node:path"
import type { Browser } from "@playwright/test"
import type { Genre } from "@some-ui/styles/brand/genres"
import { parseCutList } from "@some-ui/video-render"
import type { Parsed } from "@some-ui/video-render"
import { ASSET_FILE } from "@some-ui/video-render/assets"
import type { AloneAsset } from "@some-ui/video-render/assets"
import { thumbnailInput } from "@some-ui/video-render/thumbnail"

import { drawThumbnail } from "./thumbnail"
import { FACTS_FROM_FOLDER, keptJson } from "./thumbnail-facts"

/** Where an asset is made to: the work folder home hands, and only there. */
export const madePath = (out: string, asset: AloneAsset): string =>
  join(out, ASSET_FILE[asset])

/**
 * Where its bytes are written before they are put in place: a name of this
 * make's own (`.<file>.<pid>.<random>.partial`), opened only if new, so a
 * partial a killed make left (which may share the made file's bytes on the
 * drive), a link planted there, or a second make into the same folder is
 * never written through. Home sweeps leftovers by that shape.
 */
const partialPath = (out: string, asset: AloneAsset): string =>
  join(
    out,
    `.${ASSET_FILE[asset]}.${String(process.pid)}.${randomBytes(6).toString("hex")}.partial`
  )

/** Whether `inner` is `outer` or below it, both as the drive resolves them. */
async function within(inner: string, outer: string): Promise<boolean> {
  const [i, o] = await Promise.all([realpath(inner), realpath(outer)])
  const rel = relative(o, i)
  return rel === "" || !(rel.startsWith("..") || isAbsolute(rel))
}

const exists = async (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false
  )

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
    const raw = await keptJson(root, "cut-list.json")
    if (!raw.ok) return raw
    const cut = parseCutList(raw.value)
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
  if (await within(out, root))
    return {
      ok: false,
      problems: [`${out} is in the episode's folder, which is only read`],
    }
  const made = madePath(out, asset)
  if (await exists(made))
    return { ok: false, problems: [`${made} is already made`] }
  const drawn = await DRAW[asset](browser, feed, root)
  if (!drawn.ok) return drawn
  const partial = partialPath(out, asset)
  try {
    await writeFile(partial, drawn.value, { flag: "wx" })
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
