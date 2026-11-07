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
 * With a shape that has subtitles (version 2 on), it asks the speaker for
 * each take's words too (`/timed`) and keeps them beside it. A series that
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

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"
import type { Route } from "@playwright/test"
import {
  CALL_INDEX_SCHEMA,
  CALL_VOICES,
  callCutList,
  callFile,
  callFormat,
  callScenes,
  estimatedCallMs,
  overLength,
  parseCallWeek,
} from "@some-ui/video-render"
import type { CallTake, CallWeek } from "@some-ui/video-render"
import { nodePorts, renderFolder, stepCache } from "@some-ui/video-render/node"
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
  const site = values.app
    ? {
        origin: new URL(values.app).origin,
        close: async (): Promise<void> => {},
      }
    : await serve(resolve(values.dist), { fallback: "index.html" })
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

    // Policy, before an hour on the speaker: a week whose words alone run
    // past the longest video is refused here.
    const tooLong = overLength(estimatedCallMs(week), policy)
    if (tooLong) fail([`${tooLong}, by its words; nothing was recorded`])

    const root = here(join(values.out, week.week.from))
    await mkdir(root, { recursive: true })
    const ports = nodePorts(root)
    const scenes = callScenes(week)
    // Takes and every ffmpeg step are kept here between attempts, so a retry
    // runs only what changed; the render worker removes it once the week is
    // rendered (paulgsc/server `infra/render/render-calls.sh`).
    const STEPS = "cache/steps"
    const cache = stepCache(join(root, STEPS), policy, warn)
    const model =
      values.voices === "kokoro" ? await speakerModel(values.speaker) : null
    const takes: Array<CallTake | null> = []
    // Subtitles, as the week's shape says, need each word's place in its take.
    const timed =
      (callFormat(week.template.version).shape?.subtitles ?? "off") !== "off"
    const overflowing: Array<string> = []

    for (const [i, scene] of scenes.entries()) {
      const file = callFile(i, scene.id)
      await page.goto(url(scene.id))
      const shown = page.locator(`[data-scene="${scene.id}"]`)
      await shown.waitFor()
      await page.evaluate(async () => {
        await document.fonts.ready
      })
      if ((await shown.getAttribute("data-overflow")) === "true")
        overflowing.push(scene.id)
      await page.screenshot({ path: join(root, `${file}.png`) })
      // A brand slide says nothing.
      if (model !== null && scene.said !== "") {
        takes.push(
          await takeOf({
            speaker: values.speaker,
            model,
            voice: CALL_VOICES[scene.section],
            text: scene.said,
            timed,
            root,
            file,
            cache,
            ports,
          })
        )
      } else {
        takes.push(null)
      }
      console.log(`recorded ${file}`)
    }
    if (overflowing.length > 0)
      fail([
        "These scenes don't fit the frame, so the video would cut them off:",
        ...overflowing,
      ])

    // The music bed plays once the call's series names one (#2673).
    const bed = await placeBed(
      SERIES,
      callFormat().series.version,
      values.brand,
      root
    )
    const cutList = callCutList(week, takes, { bed })
    await writeFile(
      join(root, "cut-list.json"),
      `${JSON.stringify(cutList, null, 1)}\n`
    )
    await writeFile(
      join(root, "week.json"),
      `${JSON.stringify(week, null, 1)}\n`
    )
    const done = await renderFolder(root, SERIES, {
      workDir: "cache",
      out: "call.mp4",
      withoutBurnIns: true,
      policy,
      stepCacheDir: STEPS,
      warn,
    })
    if (!done.ok) fail(["Nothing was rendered:", ...done.problems])
    console.log(`wrote ${join(root, done.value.video)}`)
  } finally {
    await browser.close()
    await site.close()
  }
}

await runCommand(main)
