/**
 * Records and renders one cards essay (CARDS7, #2979): its cut list, every
 * scene a card, drawn by the built app's burn-ins page (`./burn-ins`) and
 * laid together by the renderer (`@some-ui/video-render`). Nothing is said
 * over it, so no speaker is asked.
 *
 *   pnpm --filter www build
 *   pnpm --filter www record:cards --cut-list-file <key>.json [--out out/cards]
 *   pnpm --filter www record:cards --dist /opt/stage --cut-list-file <key>.json --brand /brand --out <dir>
 *
 * `--cut-list-file` is an essay as home keeps it, `<key>.json`, its name its
 * key (`parseCardsEssay`): a cut list in a cards series whose stamp's day
 * ends its key. It is refused before anything is drawn when it isn't one.
 * It writes `<out>/<key>/cards.mp4`, with `cut-list.json` and
 * `shot-times.json` beside it.
 *
 * It takes the flags every home recorder takes (`CALL_OPTIONS`); the voice
 * and speaker go unused. Policy, the step cache and `--brand` are the
 * call's (`./call` says how). Needs `ffmpeg` and `ffprobe` on `PATH`.
 */

import { copyFile, mkdir } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { parseCardsEssay } from "@some-ui/video-render"
import { readJson } from "@some-ui/video-render/node"

import { openRecorder, renderWithBurnIns } from "./burn-ins"
import { CALL_OPTIONS } from "./call-recording"
import { fail, here, launchChromium, runCommand } from "./command"
import { policyOf, siteOf, STEP_CACHE } from "./voiced"

/** The series an essay may be drawn in, sampled in the renderer's workspace. */
const SERIES = resolve(
  import.meta.dirname,
  "../../../../packages/video-render/src/sample/series"
)

const { values } = parseArgs({
  options: {
    "cut-list-file": { type: "string" },
    out: { type: "string", default: "out/cards" },
    ...CALL_OPTIONS,
  },
})

async function main(): Promise<void> {
  const file = values["cut-list-file"]
  if (!file) fail(["usage: record:cards --cut-list-file <key>.json"])
  const key = basename(file, ".json")
  const essay = parseCardsEssay(key, await readJson(here(file)))
  if (!essay.ok) fail([`${file} isn't a cards essay:`, ...essay.problems])
  const policy = policyOf(values)
  const root = join(here(values.out), key)
  await mkdir(root, { recursive: true })
  await copyFile(here(file), join(root, "cut-list.json"))

  const site = await siteOf(values)
  const browser = await launchChromium()
  try {
    const page = await openRecorder(browser, site.origin)
    // Read by paulgsc/server's render worker, as the other recorders say it.
    console.log("assembling")
    const done = await renderWithBurnIns(
      page,
      root,
      join(SERIES, essay.value.series.id),
      {
        workDir: "cache",
        out: "cards.mp4",
        policy,
        ...STEP_CACHE,
        ...(values.brand === undefined ? {} : { brand: here(values.brand) }),
      }
    )
    if (!done.ok) fail(["Nothing was rendered:", ...done.problems])
    console.log(`wrote ${join(root, done.value.video)}`)
  } finally {
    await browser.close()
    await site.close()
  }
}

await runCommand(main)
