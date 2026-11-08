/**
 * Records and renders one week of Playoff Delta, said by home's Kokoro
 * speaker (FEED3 #2646): a still of each scene of the fill's format version,
 * its shape included (`lib/voiced` in `@some-ui/playoff-delta`), said in
 * `PD_VOICE`, and the renderer laying them together (`./voiced`).
 *
 *   pnpm --filter www build
 *   pnpm --filter www record:playoff-delta --week 8 --narration SF-week-08.json [--voices kokoro|none] [--speaker http://127.0.0.1:8880] [--out out/playoff-delta]
 *   pnpm --filter www record:playoff-delta --app http://call-stage --season-file SF.json --week 8 --narration SF-week-08.json --voices kokoro [--brand /brand]
 *
 * `--narration` is the week's fill (`paulgsc/testing`'s
 * `playoff-delta/<season>/narration/`): it is checked against the season the
 * stage plays before anything is said, and drawn in the version it names,
 * which must be voiced (2 on). `--week 0` is the
 * legend. `--voices none` leaves it silent, each scene held for its words'
 * reading time.
 *
 * `--season-file` records from a season file, as home keeps it: the stage's
 * read of `paulgsc/testing`'s season is answered from that file alone, so
 * home's render worker needs no network. Otherwise the build must be one that
 * reads content, as the home network's does.
 *
 * It refuses a scene the frame can't hold, and takes each still with every
 * animation at rest, so the same week gives the same bytes. It serves the built app (never `vite dev`)
 * from `--dist`, relative to apps/www, or records the one served at `--app`.
 * Needs `ffmpeg` and `ffprobe` on `PATH`. Policy flags as `record:call`'s.
 *
 * An episode is never voiced by the owner: FEED6 (#2649) retired SHOW SH2's
 * `--clips`, which recorded one for the phone's Studio to voice.
 */

import { readFile, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"
import type { Browser, BrowserContext, Page } from "@playwright/test"
import {
  checkNarration,
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
import { chapterSlides, hasCaptions } from "@some-ui/video-render"
import { readJson } from "@some-ui/video-render/node"

import { fail, here, launchChromium, runCommand } from "./command"
import {
  placeBed,
  POLICY_OPTIONS,
  policyOf,
  recordStills,
  refuseLong,
  renderStills,
  siteOf,
} from "./voiced"

/** Playoff Delta's series, sampled in the renderer's workspace. */
const SERIES = resolve(
  import.meta.dirname,
  "../../../../packages/video-render/src/sample/series/playoff-delta-week"
)

/** The stage's read of a season in `paulgsc/testing`'s `playoff-delta/`. */
const TESTING_SEASON =
  /\/paulgsc\/testing\/main\/playoff-delta\/\d{4}\/[A-Z]{2,3}\.json$/

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
    ...POLICY_OPTIONS,
  },
})

const week = Number(values.week)
if (!Number.isInteger(week) || week < 0) fail(["--week is a whole number"])

/** A page at the recording size, in the chosen theme, every motion at rest. */
async function open(
  browser: Browser
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: RECORDING,
    deviceScaleFactor: 1,
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

/** The season the stage plays, as it publishes it on the frame. */
async function seasonOn(
  browser: Browser,
  origin: string
): Promise<{ season: StorySeason }> {
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
  return { season }
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
  const format = formatOf(kindOf(week), version)
  const scenes = voicedScenes(season, week, version, fill)
  refuseLong(scenes, policy)
  const root = here(
    join(values.out, `${season.label}-week-${String(week).padStart(2, "0")}`)
  )
  const { context, page } = await open(browser)
  // Every reveal at rest: the still is the slide as it settles.
  await page.emulateMedia({ reducedMotion: "reduce" })
  const takes = await recordStills({
    page,
    root,
    shots: scenes.map((scene) => ({
      id: scene.id,
      url: urlOf(origin, { scene: scene.id, v: String(version) }),
      said: scene.said,
      voice: PD_VOICE,
    })),
    frame: (id) => `[data-slide="${id}"]`,
    speaker: values.voices === "kokoro" ? values.speaker : null,
    timed: hasCaptions(format),
    policy,
  }).finally(() => context.close())
  const bed = await placeBed(SERIES, format.series.version, values.brand, root)
  await writeFile(
    join(root, "narration.json"),
    `${JSON.stringify(fill, null, 1)}\n`
  )
  await renderStills(
    root,
    SERIES,
    voicedCutList(season, week, fill, takes, { bed }),
    {
      out: "episode.mp4",
      policy,
      browser,
      origin,
      marks: chapterSlides(scenes.filter((s) => s.kind === "chapter")),
    }
  )
}

async function main(): Promise<void> {
  const site = await siteOf(values)
  const browser = await launchChromium()
  try {
    await voiced(browser, site.origin)
  } finally {
    await browser.close()
    await site.close()
  }
}

await runCommand(main)
