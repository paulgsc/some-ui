/**
 * Playoff Delta's recording (FEED3 #2646), shared by `record:playoff-delta`
 * (`./playoff-delta`) and a template's preview, `record:preview`
 * (`./preview`, SFEED12): a still of each scene of the fill's format version,
 * its shape included (`lib/voiced` in `@some-ui/playoff-delta`), said in
 * `PD_VOICE`, and the renderer laying them together (`./voiced`).
 * `./playoff-delta`'s header says how.
 *
 * A preview is the sample season's episode of its template (the legend or
 * the sample's newest week), said from the sample's fill, which is kept in
 * code (`sampleFill`), and cut to 15–30 s (`previewOf`), as the call's is.
 */

import { readFile, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import type { Browser, BrowserContext, Page } from "@playwright/test"
import {
  checkNarration,
  formatOf,
  kindOf,
  parseStorySeason,
  PD_VOICE,
  RECORDING,
  SAMPLE_SEASON,
  sampleFill,
  sampleWeekOf,
  seasonData,
  VOICED_VERSION,
  voicedCutList,
  voicedScenes,
  type FormatKind,
  type Narration,
  type StorySeason,
} from "@some-ui/playoff-delta/recording"
import { THEME_STORAGE_KEY } from "@some-ui/styles/theme"
import { chapterSlides, hasCaptions, previewOf } from "@some-ui/video-render"
import { readJson } from "@some-ui/video-render/node"

import { fail, here, launchChromium } from "./command"
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

/** The flags `record:playoff-delta` takes beyond `record:preview`'s. */
export const PD_OPTIONS = {
  week: { type: "string", default: "9" },
  narration: { type: "string" },
  voices: { type: "string", default: "kokoro" },
  speaker: { type: "string", default: "http://127.0.0.1:8880" },
  dist: { type: "string", default: "dist" },
  app: { type: "string" },
  "season-file": { type: "string" },
  // Home's brand folder: the owner's files the series names (#2673).
  brand: { type: "string" },
  theme: { type: "string" },
  ...POLICY_OPTIONS,
} as const

export type PdValues = {
  readonly week?: string
  readonly narration?: string
  readonly voices: string
  readonly speaker: string
  readonly out: string
  readonly dist: string
  readonly app?: string
  readonly "season-file"?: string
  readonly brand?: string
  readonly theme?: string
  readonly "max-video-minutes"?: string
  readonly "max-video-mb"?: string
  readonly "cache-mb"?: string
}

/** What one recording is of: an episode from its files, or a template's preview. */
type Asked =
  | {
      readonly preview: false
      readonly week: number
      /** The season file the stage's read is answered from, as home keeps it. */
      readonly seasonBytes: Buffer | null
    }
  | {
      readonly preview: true
      readonly kind: FormatKind
      readonly week: number
      /** The sample season, as the stage's read is answered. */
      readonly seasonBytes: string
    }

/** A page at the recording size, in the chosen theme, every motion at rest. */
async function open(
  browser: Browser,
  values: PdValues,
  asked: Asked
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
  const bytes = asked.seasonBytes
  if (bytes !== null)
    await context.route(TESTING_SEASON, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: bytes,
      })
    )
  return { context, page: await context.newPage() }
}

/** The stage's address for one scene. */
const urlOf = (
  origin: string,
  week: number,
  query: Record<string, string>
): string =>
  `${origin}/playoff-delta?${new URLSearchParams({
    week: String(week),
    record: "true",
    ...query,
  }).toString()}`

/** The season the stage plays, as it publishes it on the frame. */
async function seasonOn(
  browser: Browser,
  origin: string,
  values: PdValues,
  asked: Asked
): Promise<StorySeason> {
  const probe = await open(browser, values, asked)
  await probe.page.goto(urlOf(origin, asked.week, { slide: "0" }))
  const data = await probe.page
    .locator("[data-pd-season]")
    .getAttribute("data-pd-season")
  await probe.context.close()
  if (data === null) fail(["the stage published no season"])
  // A preview is of the sample season alone, whichever build plays it.
  if (asked.preview && data !== asked.seasonBytes)
    fail(["the stage played another season than the sample"])
  const season = parseStorySeason(JSON.parse(data))
  if (asked.week !== 0 && !season.weeks.some((w) => w.week === asked.week))
    fail([`the season has no week ${asked.week}`])
  return season
}

/** The week's fill, checked against the season the stage plays. */
async function fillOf(
  season: StorySeason,
  values: PdValues,
  asked: Asked
): Promise<Narration> {
  const name = asked.preview ? "the sample's fill" : values.narration
  if (name === undefined)
    fail(["--narration names the week's fill: what is said over each scene"])
  const checked = await checkNarration(
    season,
    asked.week,
    asked.preview ? await sampleFill(asked.kind) : await readJson(here(name))
  )
  if (!checked.ok) fail([`${name} can't be said:`, ...checked.problems])
  if (checked.value.format.version < VOICED_VERSION)
    fail([
      `${name} was written for version ${checked.value.format.version}, before the voiced shape: fill the week again`,
    ])
  return checked.value
}

/** What `values` and `preview` ask to record. */
async function askedOf(
  values: PdValues,
  preview: FormatKind | null
): Promise<Asked> {
  if (preview !== null)
    return {
      preview: true,
      kind: preview,
      week: sampleWeekOf(preview),
      seasonBytes: seasonData(SAMPLE_SEASON),
    }
  const week = Number(values.week)
  if (!Number.isInteger(week) || week < 0) fail(["--week is a whole number"])
  const file = values["season-file"]
  return {
    preview: false,
    week,
    seasonBytes: file ? await readFile(here(file)) : null,
  }
}

/**
 * Records and renders one week of Playoff Delta, said by home's Kokoro
 * speaker, into `<out>/<season>-week-NN/episode.mp4`; with `preview`
 * (SFEED12), that template's sample episode, whatever week `values` names,
 * cut to its preview (`previewOf`) into `<out>/preview.mp4`.
 */
export async function recordPlayoffDelta(
  values: PdValues,
  { preview = null }: { readonly preview?: FormatKind | null } = {}
): Promise<void> {
  if (values.voices !== "kokoro" && values.voices !== "none")
    fail(["--voices is kokoro or none"])
  const policy = policyOf(values)
  const asked = await askedOf(values, preview)
  const site = await siteOf(values)
  const browser = await launchChromium()
  try {
    const { origin } = site
    const season = await seasonOn(browser, origin, values, asked)
    const fill = await fillOf(season, values, asked)
    const version = fill.format.version
    const format = formatOf(kindOf(asked.week), version)
    const scenes = voicedScenes(season, asked.week, version, fill)
    // A preview's length is its cut's, which the renderer checks exactly; the
    // whole sample's words don't bound it.
    if (!asked.preview) refuseLong(scenes, policy)
    const root = here(
      asked.preview
        ? values.out
        : join(
            values.out,
            `${season.label}-week-${String(asked.week).padStart(2, "0")}`
          )
    )
    const { context, page } = await open(browser, values, asked)
    // Every reveal at rest: the still is the slide as it settles.
    await page.emulateMedia({ reducedMotion: "reduce" })
    const takes = await recordStills({
      page,
      root,
      shots: scenes.map((scene) => ({
        id: scene.id,
        url: urlOf(origin, asked.week, {
          scene: scene.id,
          v: String(version),
        }),
        said: scene.said,
        voice: PD_VOICE,
      })),
      frame: (id) => `[data-slide="${id}"]`,
      speaker: values.voices === "kokoro" ? values.speaker : null,
      timed: hasCaptions(format),
      policy,
    }).finally(() => context.close())
    const bed = await placeBed(
      SERIES,
      format.series.version,
      values.brand,
      root
    )
    await writeFile(
      join(root, "narration.json"),
      `${JSON.stringify(fill, null, 1)}\n`
    )
    const whole = voicedCutList(season, asked.week, fill, takes, { bed })
    const cut = asked.preview
      ? previewOf(whole)
      : { ok: true as const, value: whole }
    if (!cut.ok) fail(["The preview can't be cut:", ...cut.problems])
    await renderStills(root, SERIES, cut.value, {
      out: asked.preview ? "preview.mp4" : "episode.mp4",
      policy,
      browser,
      origin,
      // A preview is never uploaded, so it has no chapters to describe.
      marks: asked.preview
        ? []
        : chapterSlides(scenes.filter((s) => s.kind === "chapter")),
    })
  } finally {
    await browser.close()
    await site.close()
  }
}
