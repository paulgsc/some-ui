/**
 * Records and renders one weekly call (STUDIO ST29): a still of each scene
 * from the built app's `/call?record`, each scene's words said in its
 * section's voice, and the renderer (`@some-ui/video-render`) laying them
 * together.
 *
 *   pnpm --filter www build
 *   pnpm --filter www record:call [--week 2026-10-30] [--voices kokoro|none] [--speaker http://127.0.0.1:8880] [--out out/call]
 *   pnpm --filter www record:call --app http://call-stage --week-file week.json [--voices kokoro] [--brand /brand] [--out out/call]
 *
 * `--week` names the week by its first day (the newest `paulgsc/testing`
 * keeps by default, `sample` for the template's); the build must be one that
 * reads content, as the home network's does. `--voices kokoro` says each
 * scene in its section's voice (`CALL_VOICES`) through home's Kokoro speaker
 * at `--speaker` (paulgsc/server `infra/compose/kokoro.yml`), which gives the
 * same audio for the same words (ST36, #2635); `none` leaves the call
 * silent, each scene held for its words' reading time, which the frame shows
 * anyway.
 *
 * `--week-file` records a week from a file, as home keeps it (ST36): the
 * stage's reads of `paulgsc/testing`'s `call/` are answered from that file
 * alone, so a week the repository has let go still records the same.
 *
 * It refuses a scene the frame can't hold (`data-overflow`), since the
 * video would cut it off. It serves the built app (never `vite dev`: the dev
 * tools would be in the frame), from `--dist`, relative to apps/www, or
 * records the one already served at `--app` (home's render worker records
 * the published image, #2639). Needs `ffmpeg` and `ffprobe` on `PATH`.
 *
 * With a shape that has captions (version 2 on), it asks the speaker for
 * each take's words too (`/timed`) and keeps them beside it, and records
 * each scene's captions in the series' look from the app's burn-ins page
 * (`./burn-ins`), which `--app` serves too. A series that
 * names a music bed takes its file from `--brand`, home's folder of the
 * owner's files, never a repository.
 *
 * Policy (`RenderPolicy`, #2635): `--max-video-minutes` and `--max-video-mb`
 * cap the video, which is refused past either, by its words before anything
 * is said and exactly before anything is drawn; `--cache-mb` caps what one
 * week keeps in `<out>/<week>/cache/steps`, its takes and every ffmpeg step,
 * so a retry runs only what changed. A step past that budget runs uncached,
 * with a `cache warning:` line on stderr, which home's render worker reports.
 */

import { readFile, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"
import type { Route } from "@playwright/test"
import {
  CALL_INDEX_SCHEMA,
  CALL_VOICES,
  callCutList,
  callFormat,
  callScenes,
  hasCaptions,
  parseCallWeek,
} from "@some-ui/video-render"
import type { CallWeek } from "@some-ui/video-render"

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

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      week: { type: "string" },
      voices: { type: "string", default: "none" },
      speaker: { type: "string", default: "http://127.0.0.1:8880" },
      out: { type: "string", default: "out/call" },
      dist: { type: "string", default: "dist" },
      app: { type: "string" },
      "week-file": { type: "string" },
      // Home's brand folder: the owner's files the series names (#2673).
      brand: { type: "string" },
      ...POLICY_OPTIONS,
    },
  })
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
    const root = here(join(values.out, week.week.from))
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
      callFormat(week.template.version).series.version,
      values.brand,
      root
    )
    await writeFile(
      join(root, "week.json"),
      `${JSON.stringify(week, null, 1)}\n`
    )
    await renderStills(root, SERIES, callCutList(week, takes, { bed }), {
      out: "call.mp4",
      policy,
      browser,
      origin: site.origin,
    })
  } finally {
    await browser.close()
    await site.close()
  }
}

await runCommand(main)
