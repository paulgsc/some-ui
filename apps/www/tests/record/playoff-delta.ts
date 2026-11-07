/**
 * Records and renders one week of Playoff Delta, said by home's Kokoro
 * speaker (FEED3 #2646): a still of each scene of the week's format version,
 * shape included (the locked intro, the brand slides, a chapter before each
 * marked slide), each scene's words said in Playoff Delta's voice
 * (`PD_VOICE`), and the renderer laying them together.
 *
 *   pnpm --filter www build
 *   pnpm --filter www record:playoff-delta --week 8 --narration SF-week-08.json [--voices kokoro|none] [--speaker http://127.0.0.1:8880] [--out out/playoff-delta]
 *   pnpm --filter www record:playoff-delta --app http://call-stage --season-file SF.json --week 8 --narration SF-week-08.json --voices kokoro [--brand /brand]
 *
 * `--narration` is the week's fill (`paulgsc/testing`'s
 * `playoff-delta/<season>/narration/`), written for version 2 of the format
 * or later: it is checked against the season the stage plays before
 * anything is said, and drawn in the version it names. `--week 0` is the
 * legend. `--voices none` leaves it silent, each scene held for its words'
 * reading time.
 *
 * `--season-file` records from a season file, as home keeps it: the stage's
 * read of `paulgsc/testing`'s season is answered from that file alone, so
 * home's render worker needs no network. Otherwise the build must be one that
 * reads content, as the home network's does.
 *
 * It refuses a scene the frame can't hold (`data-overflow`), since the video
 * would cut it off. Each still is taken with every animation at rest, so the
 * same week gives the same bytes. It serves the built app (never `vite dev`)
 * from `--dist`, relative to apps/www, or records the one served at `--app`.
 * Needs `ffmpeg` and `ffprobe` on `PATH`. Policy flags as `record:call`'s.
 *
 *   pnpm --filter www record:playoff-delta --clips --week 9 [--theme mochi]
 *
 * `--clips` records the episode for my own voice instead (SHOW SH2): one
 * 1080x1920 clip per slide of version 1, a still of each, and `episode.json`,
 * the primer the phone's Studio opens, until FEED6 (#2649) retires my voice
 * from episodes. Its clips are Playwright's .webm.
 */

import { createHash } from "node:crypto"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"
import type { Browser, BrowserContext, Page } from "@playwright/test"
import {
  checkNarration,
  episodeFor,
  formatOf,
  kindOf,
  parseStorySeason,
  PD_VOICE,
  RECORDING,
  VOICED_VERSION,
  voicedCutList,
  voicedScenes,
  type Narration,
  type StorySeason,
} from "@some-ui/playoff-delta/recording"
import { THEME_STORAGE_KEY } from "@some-ui/styles/theme"
import {
  clipFile,
  overLength,
  stillFile,
  unsaidMs,
} from "@some-ui/video-render"
import type { StillTake } from "@some-ui/video-render"
import {
  nodePorts,
  readJson,
  renderFolder,
  stepCache,
} from "@some-ui/video-render/node"
import { serve } from "@tests/ui-fit/harness"

import { fail, here, launchChromium, runCommand } from "./command"
import {
  placeBed,
  POLICY_OPTIONS,
  policyOf,
  speakerModel,
  takeOf,
  warn,
} from "./speaker"

/** Playoff Delta's series, sampled in the renderer's workspace. */
const SERIES = resolve(
  import.meta.dirname,
  "../../../../packages/video-render/src/sample/series/playoff-delta-week"
)

/** The stage's read of a season in `paulgsc/testing`'s `playoff-delta/`. */
const TESTING_SEASON =
  /\/paulgsc\/testing\/main\/playoff-delta\/\d{4}\/[A-Z]{2,3}\.json$/

/** After a slide's hold, in `--clips`: a beat of stillness to cut on. */
const TAIL_MS = 600

const { values } = parseArgs({
  options: {
    week: { type: "string", default: "9" },
    narration: { type: "string" },
    voices: { type: "string", default: "kokoro" },
    speaker: { type: "string", default: "http://127.0.0.1:8880" },
    out: { type: "string", default: "out/playoff-delta" },
    dist: { type: "string", default: "dist" },
    app: { type: "string" },
    "season-file": { type: "string" },
    // Home's brand folder: the owner's files the series names (#2673).
    brand: { type: "string" },
    theme: { type: "string" },
    clips: { type: "boolean", default: false },
    ...POLICY_OPTIONS,
  },
})

const week = Number(values.week)
if (!Number.isInteger(week) || week < 0) fail(["--week is a whole number"])

/** A page at the recording size, in the chosen theme, every motion at rest. */
async function open(
  browser: Browser,
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
  const seasonFile = values["season-file"]
  if (seasonFile) {
    const bytes = await readFile(here(seasonFile))
    await context.route(TESTING_SEASON, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: bytes,
      })
    )
  }
  return { context, page: await context.newPage() }
}

/** The stage's address for one scene. */
const urlOf = (origin: string, query: Record<string, string>): string =>
  `${origin}/playoff-delta?${new URLSearchParams({
    week: String(week),
    record: "true",
    ...query,
  }).toString()}`

/**
 * The season the stage plays, as it publishes it on the frame, and the sum
 * of that JSON (the season as the stage read it, not the file's bytes).
 */
async function seasonOn(
  browser: Browser,
  origin: string
): Promise<{ season: StorySeason; sha256: string }> {
  const probe = await open(browser)
  await probe.page.goto(urlOf(origin, { slide: "0" }))
  const data = await probe.page
    .locator("[data-pd-season]")
    .getAttribute("data-pd-season")
  await probe.context.close()
  if (data === null) fail(["the stage published no season"])
  const season = parseStorySeason(JSON.parse(data))
  if (week !== 0 && !season.weeks.some((w) => w.week === week))
    fail([`the season has no week ${week}`])
  return {
    season,
    sha256: createHash("sha256").update(data).digest("hex"),
  }
}

/** The week's fill, checked against the season the stage plays. */
async function fillOf(season: StorySeason): Promise<Narration> {
  if (!values.narration)
    fail(["--narration names the week's fill: what is said over each scene"])
  const checked = await checkNarration(
    season,
    week,
    await readJson(here(values.narration))
  )
  if (!checked.ok)
    fail([`${values.narration} can't be said:`, ...checked.problems])
  if (checked.value.format.version < VOICED_VERSION)
    fail([
      `${values.narration} was written for version ${checked.value.format.version}, before the voiced shape: fill the week again`,
    ])
  return checked.value
}

/** The week said by Kokoro and rendered: FEED3. */
async function voiced(browser: Browser, origin: string): Promise<void> {
  if (values.voices !== "kokoro" && values.voices !== "none")
    fail(["--voices is kokoro or none"])
  const policy = policyOf(values)
  const { season } = await seasonOn(browser, origin)
  const fill = await fillOf(season)
  const version = fill.format.version
  const scenes = voicedScenes(season, week, version, fill)

  // Policy, before the speaker: an episode whose words alone run past the
  // longest video is refused here.
  const tooLong = overLength(
    scenes.reduce((ms, scene) => ms + unsaidMs(scene.said), 0),
    policy
  )
  if (tooLong) fail([`${tooLong}, by its words; nothing was recorded`])

  const root = here(
    join(values.out, `${season.label}-week-${String(week).padStart(2, "0")}`)
  )
  await mkdir(root, { recursive: true })
  const ports = nodePorts(root)
  // Takes and every ffmpeg step are kept here between attempts, so a retry
  // runs only what changed; home's render worker removes it once rendered.
  const STEPS = "cache/steps"
  const cache = stepCache(join(root, STEPS), policy, warn)
  const model =
    values.voices === "kokoro" ? await speakerModel(values.speaker) : null
  const timed =
    (formatOf(kindOf(week), version).shape?.subtitles ?? "off") !== "off"
  const takes: Array<StillTake | null> = []
  const overflowing: Array<string> = []
  const { context, page } = await open(browser)
  // Every reveal at rest: the still is the slide as it settles.
  await page.emulateMedia({ reducedMotion: "reduce" })
  try {
    for (const [i, scene] of scenes.entries()) {
      const file = stillFile(i, scene.id)
      await page.goto(urlOf(origin, { scene: scene.id, v: String(version) }))
      const shown = page.locator(`[data-slide="${scene.id}"]`)
      await shown.waitFor()
      await page.evaluate(async () => {
        await document.fonts.ready
      })
      if ((await shown.getAttribute("data-overflow")) === "true")
        overflowing.push(scene.id)
      await page.screenshot({
        path: join(root, `${file}.png`),
        animations: "disabled",
        caret: "hide",
      })
      // A brand slide says nothing.
      takes.push(
        model !== null && scene.said !== ""
          ? await takeOf({
              speaker: values.speaker,
              model,
              voice: PD_VOICE,
              text: scene.said,
              timed,
              root,
              file,
              cache,
              ports,
            })
          : null
      )
      console.log(`recorded ${file}`)
    }
  } finally {
    await context.close()
  }
  if (overflowing.length > 0)
    fail([
      "These scenes don't fit the frame, so the video would cut them off:",
      ...overflowing,
    ])

  const format = formatOf(kindOf(week), version)
  const bed = await placeBed(SERIES, format.series.version, values.brand, root)
  const cutList = voicedCutList(season, week, fill, takes, { bed })
  await writeFile(
    join(root, "cut-list.json"),
    `${JSON.stringify(cutList, null, 1)}\n`
  )
  await writeFile(
    join(root, "narration.json"),
    `${JSON.stringify(fill, null, 1)}\n`
  )
  const done = await renderFolder(root, SERIES, {
    workDir: "cache",
    out: "episode.mp4",
    withoutBurnIns: true,
    policy,
    stepCacheDir: STEPS,
    warn,
  })
  if (!done.ok) fail(["Nothing was rendered:", ...done.problems])
  console.log(`wrote ${join(root, done.value.video)}`)
}

/** The episode for my own voice: SH2's clips and `episode.json`, until FEED6. */
async function clips(browser: Browser, origin: string): Promise<void> {
  const outDir = here(join(values.out, `week-${String(week).padStart(2, "0")}`))
  await mkdir(outDir, { recursive: true })
  const { season, sha256 } = await seasonOn(browser, origin)
  const scenes = formatOf(kindOf(week), VOICED_VERSION - 1).scenes
  /** Where each clip's slide appears, after the app's boot frames. */
  const starts: Array<number> = []
  for (const [i, scene] of scenes.entries()) {
    const clip = clipFile(scene.id, i)
    const name = clip.replace(/\.webm$/, "")
    const tmp = join(outDir, ".video")
    const { context, page } = await open(browser, tmp)
    const opened = Date.now()
    await page.goto(urlOf(origin, { slide: String(i) }))
    await page.locator(`[data-slide="${scene.id}"]`).waitFor()
    starts.push(Date.now() - opened)
    await page.waitForTimeout(scene.holdMs + TAIL_MS)
    await page.screenshot({ path: join(outDir, `${name}.png`) })
    const video = page.video()
    await context.close()
    if (video) await rename(await video.path(), join(outDir, clip))
    console.log(
      `recorded ${name} (slide from ${((starts[i] ?? 0) / 1000).toFixed(1)}s)`
    )
  }
  await rm(join(outDir, ".video"), { recursive: true, force: true })
  const episode = episodeFor(season, week, sha256, (i) => starts[i] ?? 0)
  if (!episode.ok) fail(episode.problems)
  await writeFile(
    join(outDir, "episode.json"),
    `${JSON.stringify(episode.value, null, 2)}\n`
  )
  console.log(`wrote ${scenes.length} clips and episode.json to ${outDir}`)
}

async function main(): Promise<void> {
  const site = values.app
    ? {
        origin: new URL(values.app).origin,
        close: async (): Promise<void> => {},
      }
    : await serve(resolve(values.dist), { fallback: "index.html" })
  const browser = await launchChromium()
  try {
    await (values.clips ? clips : voiced)(browser, site.origin)
  } finally {
    await browser.close()
    await site.close()
  }
}

await runCommand(main)
