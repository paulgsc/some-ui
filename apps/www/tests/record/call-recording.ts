/**
 * The weekly call's recording (STUDIO ST29, ST36), shared by `record:call`
 * (`./call`) and a template's preview, `record:preview` (`./preview`,
 * SFEED12): the stage's stills, each said in its section's voice, and the
 * renderer laying them together. `./call`'s header says how.
 */
import { readFile, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import type { Route } from "@playwright/test"
import {
  CALL_INDEX_SCHEMA,
  CALL_VOICES,
  callChapterMarks,
  callCutList,
  callFormat,
  callScenes,
  hasCaptions,
  parseCallWeek,
  previewOf,
} from "@some-ui/video-render"
import type { CallWeek } from "@some-ui/video-render"

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

/** The frame the stage is recorded at: the call's series. */
const FRAME = { width: 1920, height: 1080 } as const

/** The call's series, sampled in the renderer's workspace. */
const SERIES = resolve(
  import.meta.dirname,
  "../../../../packages/video-render/src/sample/series/conference-call"
)

/** The stage's reads of `paulgsc/testing`'s `call/` folder. */
const TESTING_CALL = /\/paulgsc\/testing\/main\/call\/[^/?#]+$/

/** A week as home keeps it: its file's bytes, and its days. */
type Kept = {
  readonly bytes: Buffer
  readonly from: string
  readonly to: string
}

async function keptWeek(path: string): Promise<Kept> {
  const bytes = await readFile(path)
  const parsed = parseCallWeek(JSON.parse(bytes.toString("utf8")))
  if (!parsed.ok)
    fail([`${path} isn't a week of the call:`, ...parsed.problems])
  return { bytes, ...parsed.value.week }
}

/**
 * Answers a read of `paulgsc/testing`'s `call/` from the kept week alone: an
 * index that lists only it, its own file, and nothing else.
 */
async function answer(route: Route, kept: Kept): Promise<void> {
  const name = new URL(route.request().url()).pathname.split("/").at(-1)
  const json = (body: string | Buffer): Promise<void> =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body,
    })
  if (name === "index.json")
    return json(
      JSON.stringify({
        schema: CALL_INDEX_SCHEMA,
        keep: 1,
        weeks: [{ from: kept.from, to: kept.to }],
      })
    )
  if (name === `${kept.from}.json`) return json(kept.bytes)
  return route.fulfill({ status: 404, body: "" })
}

/** The flags `record:call` and `record:preview` share. */
export const CALL_OPTIONS = {
  voices: { type: "string", default: "none" },
  speaker: { type: "string", default: "http://127.0.0.1:8880" },
  dist: { type: "string", default: "dist" },
  app: { type: "string" },
  // Home's brand folder: the owner's files the series names (#2673).
  brand: { type: "string" },
  ...POLICY_OPTIONS,
} as const

export type CallValues = {
  readonly week?: string
  readonly "week-file"?: string
  readonly voices: string
  readonly speaker: string
  readonly out: string
  readonly dist: string
  readonly app?: string
  readonly brand?: string
  readonly "max-video-minutes"?: string
  readonly "max-video-mb"?: string
  readonly "cache-mb"?: string
}

/**
 * Records and renders the call of `values`' week into `<out>/<week>/call.mp4`;
 * with `preview` (SFEED12), the template's sample week cut to its preview
 * (`previewOf`) into `<out>/preview.mp4`.
 */
export async function recordCall(
  values: CallValues,
  { preview = false }: { readonly preview?: boolean } = {}
): Promise<void> {
  const policy = policyOf(values)
  if (values.voices !== "kokoro" && values.voices !== "none")
    fail(["--voices is kokoro or none"])
  const kept = values["week-file"] ? await keptWeek(values["week-file"]) : null
  const weekAsked = kept?.from ?? values.week
  const site = await siteOf(values)
  const browser = await launchChromium()
  try {
    const page = await browser.newPage({
      viewport: FRAME,
      deviceScaleFactor: 1,
    })
    if (kept) await page.route(TESTING_CALL, (route) => answer(route, kept))
    const url = (scene: string): string =>
      `${site.origin}/call?${new URLSearchParams({
        ...(weekAsked ? { week: weekAsked } : {}),
        scene,
        record: "true",
      }).toString()}`

    // The week the stage plays, as it publishes it on the frame.
    await page.goto(url("open"))
    const frame = page.locator("[data-scene]")
    await frame.waitFor()
    const published = await frame.getAttribute("data-week")
    if (published === null) fail(["the stage published no week"])
    const parsed = parseCallWeek(JSON.parse(published))
    if (!parsed.ok)
      fail(["The stage's week can't make a call:", ...parsed.problems])
    const week: CallWeek = parsed.value
    if (weekAsked && weekAsked !== "sample" && week.week.from !== weekAsked)
      fail([`there is no week of ${weekAsked}`])

    const scenes = callScenes(week)
    refuseLong(scenes, policy)
    const root = here(preview ? values.out : join(values.out, week.week.from))
    const takes = await recordStills({
      page,
      root,
      shots: scenes.map((scene) => ({
        id: scene.id,
        url: url(scene.id),
        said: scene.said,
        voice: CALL_VOICES[scene.section],
      })),
      frame: (id) => `[data-scene="${id}"]`,
      speaker: values.voices === "kokoro" ? values.speaker : null,
      timed: hasCaptions(callFormat(week.template.version)),
      policy,
    })
    // The music bed plays once the call's series names one (#2673).
    const bed = await placeBed(
      SERIES,
      callFormat().series.version,
      values.brand,
      root
    )
    await writeFile(
      join(root, "week.json"),
      `${JSON.stringify(week, null, 1)}\n`
    )
    const whole = callCutList(week, takes, { bed })
    const cut = preview ? previewOf(whole) : { ok: true as const, value: whole }
    if (!cut.ok) fail(["The preview can't be cut:", ...cut.problems])
    await renderStills(root, SERIES, cut.value, {
      out: preview ? "preview.mp4" : "call.mp4",
      policy,
      browser,
      origin: site.origin,
      // A preview is never uploaded, so it has no chapters to describe.
      marks: preview ? [] : callChapterMarks(week),
    })
  } finally {
    await browser.close()
    await site.close()
  }
}
