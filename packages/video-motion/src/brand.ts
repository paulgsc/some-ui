/**
 * The brand's open and close (HYPER5, #2728): every version kept. A version
 * is one composition, `brand-v<n>`, drawn as the open or the close by its
 * `part` variable, fitted to any video's frame (`data-fit-frame`), and
 * carrying its own copy of the mark. Its files are pinned here: a version a
 * published video used is never edited, and a new mark (ask #2674) or a new
 * motion is a new version, so an older one still renders the same bytes.
 *
 * What a version shares with the others, `lib/motion.js`, is not pinned:
 * a change there must keep what `track` draws for the keys a version uses.
 */

import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { filesUnder } from "./node"
import { COMPOSITIONS } from "./render"

export type BrandVersion = {
  readonly version: number
  /** The composition, a folder under `compositions/`. */
  readonly ref: string
  /** What it draws, for a reader choosing one. */
  readonly says: string
  /** The sha256 of its own files (`ownDigest`), fixed once it is released. */
  readonly files: string
}

export const BRAND_VERSIONS: ReadonlyArray<BrandVersion> = [
  {
    version: 1,
    ref: "brand-v1",
    says: "today's still mochi, drawn in with a small overshoot and out with a shrink",
    files: "91333047acdae2a45e848c1e6afbf8141bd8425fc896f3ed17d1c4cb59a8b7ec",
  },
]

/** The sha256 of a composition folder's own files, by name and bytes. */
export async function ownDigest(ref: string): Promise<string> {
  const dir = join(COMPOSITIONS, ref)
  const hash = createHash("sha256")
  for (const file of await filesUnder(dir)) {
    hash.update(`${file}\n`)
    hash.update(await readFile(join(dir, file)))
  }
  return hash.digest("hex")
}
