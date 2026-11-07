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

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import { parseArgs } from "node:util"
import type { Route } from "@playwright/test"
import {
  CALL_INDEX_SCHEMA,
  CALL_VOICES,
  callCutList,
  callFile,
  callFormat,
  callScenes,
  DEFAULT_POLICY,
  estimatedCallMs,
  MB,
  overLength,
  parseCallWeek,
  TimedWordSchema,
} from "@some-ui/video-render"
import type {
  CallTake,
  CallWeek,
  RenderPolicy,
  TimedWord,
} from "@some-ui/video-render"
import {
  keyOf,
  nodePorts,
  readSeries,
  renderFolder,
  stepCache,
} from "@some-ui/video-render/node"
import { serve } from "@tests/ui-fit/harness"
import { z } from "zod"

import { fail, here, launchChromium, runCommand } from "./command"

/** The frame the stage is recorded at: the call's series. */
const FRAME = { width: 1920, height: 1080 } as const

/** The call's series, sampled in the renderer's workspace. */
const SERIES = resolve(
  import.meta.dirname,
  "../../../../packages/video-render/src/sample/series/conference-call"
)

/** A take and each word said in it, as the speaker's `/timed` gives them. */
const TimedSchema = z.object({
  audio: z.string().min(1),
  words: z.array(TimedWordSchema),
})

/**
 * `text` said in `voice` by home's Kokoro speaker at `speaker`, as a WAV: the
 * same bytes for the same words and voice. With `timed`, each word's place
 * in it too (`/timed`), for the subtitles.
 */
async function said(
  speaker: string,
  text: string,
  voice: string,
  timed: boolean
): Promise<{ wav: Buffer; words: ReadonlyArray<TimedWord> | null }> {
  const response = await fetch(new URL(timed ? "/timed" : "/say", speaker), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice }),
  })
  if (!response.ok)
    fail([
      `The speaker at ${speaker} answered ${String(response.status)}: ${await response.text()}`,
    ])
  if (!timed)
    return { wav: Buffer.from(await response.arrayBuffer()), words: null }
  const parsed = TimedSchema.safeParse(await response.json())
  if (!parsed.success)
    fail([`The speaker at ${speaker} gave no words with its take`])
  return {
    wav: Buffer.from(parsed.data.audio, "base64"),
    words: parsed.data.words,
  }
}

/** The speaker's model, by its SHA-256: part of every take's key. */
async function speakerModel(speaker: string): Promise<string> {
  const response = await fetch(new URL("/health", speaker))
  if (!response.ok)
    fail([`The speaker at ${speaker} answered ${String(response.status)}`])
  const health: unknown = await response.json()
  if (
    typeof health !== "object" ||
    health === null ||
    !("model" in health) ||
    typeof health.model !== "string"
  )
    fail([`The speaker at ${speaker} named no model`])
  return health.model
}

/** A cache warning, on its own line so the render worker can find it. */
const warn = (line: string): void => {
  process.stderr.write(`cache warning: ${line}\n`)
}

/** A whole number from a flag, or `fallback` when the flag is unset. */
function wholeFlag(
  value: string | undefined,
  flag: string,
  fallback: number
): number {
  if (value === undefined) return fallback
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) fail([`--${flag} is a whole number`])
  return n
}

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
      // Policy (`RenderPolicy`): the longest and largest video, and what one
      // week's step cache may hold.
      "max-video-minutes": { type: "string" },
      "max-video-mb": { type: "string" },
      "cache-mb": { type: "string" },
    },
  })
  const policy: RenderPolicy = {
    maxVideoMs:
      wholeFlag(
        values["max-video-minutes"],
        "max-video-minutes",
        DEFAULT_POLICY.maxVideoMs / 60_000
      ) * 60_000,
    maxVideoBytes:
      wholeFlag(
        values["max-video-mb"],
        "max-video-mb",
        DEFAULT_POLICY.maxVideoBytes / MB
      ) * MB,
    cacheBytes:
      wholeFlag(
        values["cache-mb"],
        "cache-mb",
        DEFAULT_POLICY.cacheBytes / MB
      ) * MB,
  }
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
      if (values.voices === "kokoro" && scene.said !== "") {
        const voice = CALL_VOICES[scene.section]
        const wav = join(root, `${file}.wav`)
        const kept = join(root, `${file}.words.json`)
        const key = keyOf({ take: 1, model, voice, text: scene.said })
        const wordsKey = keyOf({ words: 1, model, voice, text: scene.said })
        const cached =
          (await cache.get(key, ".wav", wav)) &&
          (!timed || (await cache.get(wordsKey, ".json", kept)))
        if (!cached) {
          const take = await said(values.speaker, scene.said, voice, timed)
          await writeFile(wav, take.wav)
          await cache.put(key, ".wav", wav, `${file}.wav`)
          if (take.words) {
            await writeFile(kept, `${JSON.stringify(take.words)}\n`)
            await cache.put(wordsKey, ".json", kept, `${file}.words.json`)
          }
        }
        const facts = await ports.probe(`${file}.wav`)
        if (!facts) fail([`${file}.wav can't be read`])
        const words = timed
          ? TimedSchema.shape.words.parse(
              JSON.parse(await readFile(kept, "utf8"))
            )
          : undefined
        takes.push({
          ms: Math.round(facts.durationMs),
          ...(words ? { words } : {}),
        })
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
    const series = await readSeries(SERIES, callFormat().series.version)
    if (!series.ok)
      fail(["The call's series can't be read:", ...series.problems])
    // Its file comes from home's brand folder (`--brand`), never a
    // repository; the renderer checks it against the series' sum.
    const bed = series.value.music?.bed
    if (bed) {
      if (!values.brand)
        fail([
          `The series names the music ${bed.file}, and --brand names no folder holding it`,
        ])
      await mkdir(dirname(join(root, bed.file)), { recursive: true })
      await copyFile(
        join(here(values.brand), basename(bed.file)),
        join(root, bed.file)
      )
    }
    const cutList = callCutList(week, takes, { bed: bed !== undefined })
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
