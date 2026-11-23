/**
 * Makes one of an episode's assets on its own (ASSETS-R, C1300), from what
 * its render kept in the episode's folder, with the video untouched: the
 * asset home's worker runs when the owner asks for one an episode lacks
 * (`POST /feeds/:feed/videos/:key/produce`). Only an asset made `alone`
 * (`@some-ui/video-render/assets`) can be asked for; one made by the render
 * (the video, its description) comes only by rendering again.
 *
 *   pnpm --filter www record:asset --asset thumbnail --feed call --root <episode folder> --out <work folder>
 *
 * `--feed` is the episode's feed (its genre); `--root` is its folder on home,
 * read only, where its recorder left `cut-list.json` and its facts' file
 * (`./thumbnail-facts`); `--out` is the folder home's worker hands it, the
 * only place it writes (`./asset-make`), and home puts the file beside the
 * video. A thumbnail is drawn as its recorder draws it (C1026), the same
 * bytes for the same folder. Exit 0 means `<out>/thumbnail.png` was written;
 * exit 1, with why on stderr, means none was: a folder that lacks either
 * file, a title no readable size fits, or a thumbnail already in `--out`,
 * which it never overwrites. Asking again would come out the same.
 */

import { parseArgs } from "node:util"
import { GENRES } from "@some-ui/styles/brand/genres"
import type { Genre } from "@some-ui/styles/brand/genres"
import { ALONE_ASSETS, isAloneAsset } from "@some-ui/video-render/assets"

import { makeAsset } from "./asset-make"
import { fail, here, launchChromium, runCommand } from "./command"

const { values } = parseArgs({
  options: {
    asset: { type: "string" },
    feed: { type: "string" },
    root: { type: "string" },
    out: { type: "string" },
  },
})

const isGenre = (value: string): value is Genre =>
  GENRES.some((genre) => genre === value)

await runCommand(async () => {
  const { asset, feed, root, out } = values
  if (asset === undefined || !isAloneAsset(asset))
    fail([`--asset is one of ${ALONE_ASSETS.join(", ")}`])
  if (feed === undefined || !isGenre(feed))
    fail([`--feed is one of ${GENRES.join(", ")}`])
  if (root === undefined) fail(["--root is the episode's folder"])
  if (out === undefined) fail(["--out is the folder to make it in"])
  const browser = await launchChromium()
  try {
    const made = await makeAsset(browser, asset, feed, here(root), here(out))
    if (!made.ok) fail([`No ${asset} made:`, ...made.problems])
    console.log(`wrote ${made.value}`)
  } finally {
    await browser.close()
  }
})
