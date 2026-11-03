/**
 * Records one week of Playoff Delta as an episode of its show (SHOW SH2):
 * one 1080x1920 clip per scene (its slide's reveal fully played, then a beat
 * to cut on), a still of each slide's settled frame, and `episode.json`: a
 * primer the phone's Studio opens (each scene's point and the facts a take
 * keeps), the episode's pins, and a cut list whose pictures are the clips,
 * each starting where its slide appears after the app's boot frames.
 *
 *   pnpm --filter www build
 *   pnpm --filter www record:playoff-delta --week 9 [--theme mochi] [--out out/playoff-delta]
 *
 * `--week 0` records the legend episode, which teaches the words every week
 * uses.
 *
 * It serves the built app (never `vite dev`: the dev tools would be in the
 * frame) and drives `/playoff-delta?record`, which renders one slide with
 * nothing to press and publishes the season it plays on the frame; the
 * episode is made from that season (`@some-ui/playoff-delta`'s
 * `episodeFor`), pinned to its sum.
 *
 * Clips are .webm (Playwright's screencast); most editors take them as they
 * are. The bundled ffmpeg cannot transcode, so convert with a system one if an
 * editor needs .mp4.
 */

import { createHash } from "node:crypto"
import { mkdir, rename, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { chromium, type BrowserContext, type Page } from "@playwright/test"
import {
  episodeFor,
  formatOf,
  parseStorySeason,
  RECORDING,
} from "@some-ui/playoff-delta"
import { THEME_STORAGE_KEY } from "@some-ui/styles/theme"
import { clipFile } from "@some-ui/video-render"
import { serve } from "@tests/ui-fit/harness"

/** After a slide's hold: a beat of stillness to cut on. */
const TAIL_MS = 600

const { values } = parseArgs({
  options: {
    week: { type: "string", default: "9" },
    theme: { type: "string" },
    out: { type: "string", default: "out/playoff-delta" },
    dist: { type: "string", default: "dist" },
  },
})

const week = Number(values.week)
const outDir = resolve(values.out, `week-${String(week).padStart(2, "0")}`)
const site = await serve(resolve(values.dist), { fallback: "index.html" })
const browser = await chromium.launch(
  process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]
    ? { executablePath: process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"] }
    : {}
)

const fmt = (ms: number): string => `${(ms / 1000).toFixed(1)}s`

const url = (slide: number): string =>
  `${site.origin}/playoff-delta?week=${week}&slide=${slide}&record=true`

/** A page at the recording size, in the chosen theme. */
async function open(
  video?: string
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: RECORDING,
    deviceScaleFactor: 1,
    ...(video ? { recordVideo: { dir: video, size: RECORDING } } : {}),
  })
  if (values.theme) {
    const theme = values.theme
    await context.addInitScript(
      ({ key, id }) => {
        window.localStorage.setItem(key, id)
      },
      { key: THEME_STORAGE_KEY, id: theme }
    )
  }
  return { context, page: await context.newPage() }
}

try {
  await mkdir(outDir, { recursive: true })

  // The season the stage plays, as it publishes it on the frame. Its sum is
  // of that JSON (the season as the stage read it), not of the file's bytes.
  const probe = await open()
  await probe.page.goto(url(0))
  const data = await probe.page
    .locator("[data-pd-season]")
    .getAttribute("data-pd-season")
  await probe.context.close()
  if (data === null) throw new Error("the stage published no season")
  const season = parseStorySeason(JSON.parse(data))
  const sha256 = createHash("sha256").update(data).digest("hex")
  const scenes = formatOf(week === 0 ? "legend" : "week").scenes
  if (week !== 0 && !season.weeks.some((w) => w.week === week))
    throw new Error(`the season has no week ${week}`)
  /** Where each clip's slide appears, after the app's boot frames. */
  const starts: Array<number> = []

  for (const [i, scene] of scenes.entries()) {
    const clip = clipFile(scene.id, i)
    const name = clip.replace(/\.webm$/, "")
    const tmp = join(outDir, ".video")
    const { context, page } = await open(tmp)
    const opened = Date.now()
    await page.goto(url(i))
    await page.locator(`[data-slide="${scene.id}"]`).waitFor()
    starts.push(Date.now() - opened)
    await page.waitForTimeout(scene.holdMs + TAIL_MS)
    await page.screenshot({ path: join(outDir, `${name}.png`) })
    const video = page.video()
    await context.close()
    if (video) await rename(await video.path(), join(outDir, clip))
    console.log(`recorded ${name} (slide from ${fmt(starts[i] ?? 0)})`)
  }

  await rm(join(outDir, ".video"), { recursive: true, force: true })
  const episode = episodeFor(season, week, sha256, (i) => starts[i] ?? 0)
  if (!episode.ok) throw new Error(episode.problems.join("\n"))
  await writeFile(
    join(outDir, "episode.json"),
    `${JSON.stringify(episode.value, null, 2)}\n`
  )
  console.log(`wrote ${scenes.length} clips and episode.json to ${outDir}`)
} finally {
  await browser.close()
  await site.close()
}
