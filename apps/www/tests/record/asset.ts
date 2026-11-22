/**
 * Makes one of an episode's assets on its own (ASSETS-R, C1300), from what
 * its render kept in the episode's folder, with the video untouched: the
 * asset home's worker runs when the owner asks for one an episode lacks
 * (`POST /feeds/:feed/videos/:key/produce`). Only an asset made `alone`
 * (`@some-ui/video-render/assets`) can be asked for; one made by the render
 * (the video, its description) comes only by rendering again.
 *
 *   pnpm --filter www record:asset --asset thumbnail --feed call --root <episode folder>
 *
 * `--feed` is the episode's feed (its genre); `--root` is its folder on home,
 * where its recorder left `cut-list.json` and its facts' file
 * (`./thumbnail-facts`). A thumbnail is drawn from those as its recorder
 * draws it (C1026), the same bytes for the same folder. It refuses, with why,
 * a folder that lacks either, and a title no readable size fits, leaving no
 * file: asking again would come out the same.
 */

import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { parseArgs } from "node:util"
import { GENRES } from "@some-ui/styles/brand/genres"
import type { Genre } from "@some-ui/styles/brand/genres"
import { parseCutList } from "@some-ui/video-render"
import { ALONE_ASSETS, isAloneAsset } from "@some-ui/video-render/assets"
import type { AloneAsset } from "@some-ui/video-render/assets"
import { thumbnailInput } from "@some-ui/video-render/thumbnail"

import { fail, here, jsonOr, launchChromium, runCommand } from "./command"
import { writeThumbnail } from "./thumbnail"
import { FACTS_FROM_FOLDER } from "./thumbnail-facts"

const { values } = parseArgs({
  options: {
    asset: { type: "string" },
    feed: { type: "string" },
    root: { type: "string" },
  },
})

const isGenre = (value: string): value is Genre =>
  GENRES.some((genre) => genre === value)

/** Each asset made on its own, and how it is made from `root`. */
const MAKE: {
  readonly [A in AloneAsset]: (feed: Genre, root: string) => Promise<void>
} = {
  thumbnail: async (feed, root) => {
    const facts = await FACTS_FROM_FOLDER[feed](root)
    if (!facts.ok)
      fail(["The episode's facts can't be read:", ...facts.problems])
    const path = join(root, "cut-list.json")
    const cut = parseCutList(jsonOr(await readFile(path, "utf8"), path))
    if (!cut.ok) fail([`${path} isn't a cut list:`, ...cut.problems])
    const browser = await launchChromium()
    try {
      const written = await writeThumbnail(
        browser,
        root,
        thumbnailInput(facts.value, cut.value)
      )
      if (!written.ok)
        fail(["The thumbnail can't be drawn:", ...written.problems])
    } finally {
      await browser.close()
    }
  },
}

await runCommand(async () => {
  const { asset, feed, root } = values
  if (asset === undefined || !isAloneAsset(asset))
    fail([`--asset is one of ${ALONE_ASSETS.join(", ")}`])
  if (feed === undefined || !isGenre(feed))
    fail([`--feed is one of ${GENRES.join(", ")}`])
  if (root === undefined) fail(["--root is the episode's folder"])
  await MAKE[asset](feed, here(root))
})
