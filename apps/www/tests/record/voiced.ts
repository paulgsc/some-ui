/**
 * What every voiced feed's recorder shares (FEED3 #2646): the stage served
 * or reached, a still of each scene, each scene said by home's Kokoro
 * speaker, the policy flags, and the render.
 *
 * A take is keyed by the speaker's model, the voice and the words, so a
 * retry asks the speaker only for what changed; with `timed`, each word's
 * place in it (`/timed`, for captions) is kept beside it. Takes, every
 * ffmpeg step and each scene's captions are kept in `<root>/cache/steps`
 * between attempts; home's render worker removes the cache once a video is
 * made.
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import type { Browser, Locator, Page } from "@playwright/test"
import {
  chapterLines,
  chaptersOf,
  DEFAULT_POLICY,
  estimatedMs,
  MB,
  overLength,
  stillFile,
  TimedWordSchema,
  UploadCopySchema,
} from "@some-ui/video-render"
import type {
  ChapterMark,
  CutList,
  Ports,
  RenderPolicy,
  StillTake,
  TimedWord,
} from "@some-ui/video-render"
import {
  keyOf,
  nodePorts,
  placeBrandFiles,
  readSeries,
  stepCache,
} from "@some-ui/video-render/node"
import type { StepCache } from "@some-ui/video-render/node"
import { serve } from "@tests/ui-fit/harness"
import { z } from "zod"

import { openRecorder, renderWithBurnIns } from "./burn-ins"
import { fail, here } from "./command"

/** A take and each word said in it, as the speaker's `/timed` gives them. */
const TimedSchema = z.object({
  audio: z.string().min(1),
  words: z.array(TimedWordSchema),
})

/**
 * `text` said in `voice` by home's Kokoro speaker at `speaker`, as a WAV: the
 * same bytes for the same words and voice. With `timed`, each word's place
 * in it too (`/timed`), for the captions.
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

/**
 * Scene `file`'s take in `root`: `<file>.wav`, and with `timed`
 * `<file>.words.json`, asked of the speaker unless `cache` holds them for
 * these words, this voice and this model.
 */
async function takeOf({
  speaker,
  model,
  voice,
  text,
  timed,
  root,
  file,
  cache,
  ports,
}: {
  readonly speaker: string
  readonly model: string
  readonly voice: string
  readonly text: string
  readonly timed: boolean
  readonly root: string
  readonly file: string
  readonly cache: StepCache
  readonly ports: Ports
}): Promise<StillTake> {
  const wav = join(root, `${file}.wav`)
  const kept = join(root, `${file}.words.json`)
  const key = keyOf({ take: 1, model, voice, text })
  const wordsKey = keyOf({ words: 1, model, voice, text })
  const cached =
    (await cache.get(key, ".wav", wav)) &&
    (!timed || (await cache.get(wordsKey, ".json", kept)))
  if (!cached) {
    const take = await said(speaker, text, voice, timed)
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
    ? TimedSchema.shape.words.parse(JSON.parse(await readFile(kept, "utf8")))
    : undefined
  return { ms: Math.round(facts.durationMs), ...(words ? { words } : {}) }
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

/**
 * The policy flags (`RenderPolicy`, #2635): the longest and largest video,
 * and what one video's step cache may hold.
 */
export const POLICY_OPTIONS = {
  "max-video-minutes": { type: "string" },
  "max-video-mb": { type: "string" },
  "cache-mb": { type: "string" },
} as const

/** The policy the flags set, each unset one at its default. */
export function policyOf(values: {
  readonly "max-video-minutes"?: string
  readonly "max-video-mb"?: string
  readonly "cache-mb"?: string
}): RenderPolicy {
  return {
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
}

/**
 * The brand files `seriesDir`'s version `version` names (its music bed, each
 * sound of its kit), copied into `root` from `brand`, home's folder of the
 * owner's files (`placeBrandFiles`); the renderer checks each against the
 * series' sum. Whether the series names a bed.
 */
export async function placeBed(
  seriesDir: string,
  version: number,
  brand: string | undefined,
  root: string
): Promise<boolean> {
  const series = await readSeries(seriesDir, version)
  if (!series.ok) fail(["The series can't be read:", ...series.problems])
  const placed = await placeBrandFiles(
    series.value,
    brand === undefined ? undefined : here(brand),
    root
  )
  if (!placed.ok) fail(placed.problems)
  return placed.value.bed
}

/** The built app served from `dist`, or the one already served at `app`. */
export function siteOf(values: {
  readonly app?: string
  readonly dist: string
}): Promise<{ readonly origin: string; close: () => Promise<void> }> {
  if (values.app)
    return Promise.resolve({
      origin: new URL(values.app).origin,
      close: (): Promise<void> => Promise.resolve(),
    })
  return serve(resolve(values.dist), { fallback: "index.html" })
}

/** Refuses, before the speaker, scenes whose words alone run past the policy. */
export function refuseLong(
  scenes: ReadonlyArray<{ readonly said: string }>,
  policy: RenderPolicy
): void {
  const tooLong = overLength(estimatedMs(scenes), policy)
  if (tooLong) fail([`${tooLong}, by its words; nothing was recorded`])
}

/** Where the cache of takes and ffmpeg steps is kept in a video's folder. */
const STEPS = "cache/steps"

/** A scene to record: its stage address, and what is said over it, in which voice. */
export type Shot = {
  readonly id: string
  readonly url: string
  readonly said: string
  readonly voice: string
}

/**
 * A still of each scene into `root` (`stillFile(i, id)`.png), from the
 * element `frame(id)` selects once the page's fonts are in, and its take
 * where something is said and `speaker` is given. Refuses, once all are
 * recorded, the scenes whose frame says they overflow (`data-overflow`).
 * Every animation is at rest in the still.
 */
/**
 * Waits for `frame` on `page`, or for the stage's refusal (VS1, #2796): a
 * stage asked for a template version newer than it knows says so in a
 * `[data-refused]` element, and the recording fails with its words instead
 * of drawing the newer template in an older look.
 */
export async function shownFrame(page: Page, frame: string): Promise<Locator> {
  const refusal = page.locator("[data-refused]")
  await page.locator(`${frame}, [data-refused]`).first().waitFor()
  if ((await refusal.count()) > 0)
    fail([
      "The stage refused to draw this:",
      ...((await refusal.first().getAttribute("data-refused")) ?? "").split(
        "\n"
      ),
    ])
  return page.locator(frame)
}

export async function recordStills({
  page,
  root,
  shots,
  frame,
  speaker,
  timed,
  policy,
}: {
  readonly page: Page
  readonly root: string
  readonly shots: ReadonlyArray<Shot>
  readonly frame: (id: string) => string
  /** Home's speaker, or null for a silent video. */
  readonly speaker: string | null
  readonly timed: boolean
  readonly policy: RenderPolicy
}): Promise<ReadonlyArray<StillTake | null>> {
  await mkdir(root, { recursive: true })
  const ports = nodePorts(root)
  const cache = stepCache(join(root, STEPS), policy, warn)
  const model = speaker === null ? null : await speakerModel(speaker)
  const takes: Array<StillTake | null> = []
  const overflowing: Array<string> = []
  for (const [i, shot] of shots.entries()) {
    const file = stillFile(i, shot.id)
    await page.goto(shot.url)
    const shown = await shownFrame(page, frame(shot.id))
    await page.evaluate(async () => {
      await document.fonts.ready
    })
    if ((await shown.getAttribute("data-overflow")) === "true")
      overflowing.push(shot.id)
    await page.screenshot({
      path: join(root, `${file}.png`),
      animations: "disabled",
      caret: "hide",
    })
    takes.push(
      speaker !== null && model !== null && shot.said !== ""
        ? await takeOf({
            speaker,
            model,
            voice: shot.voice,
            text: shot.said,
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
  if (overflowing.length > 0)
    fail([
      "These scenes don't fit the frame, so the video would cut them off:",
      ...overflowing,
    ])
  return takes
}

/**
 * `cutList` kept as `cut-list.json` in `root` and rendered to `out` in
 * `series`, its burn-ins (each scene's captions) drawn by the recorder page
 * of the app at `origin` (`./burn-ins`). The episode's chapters at the
 * scenes' real times (`marks`, SFEED4) go in `description.txt` beside it,
 * for the upload's YouTube description; with too few to show, it is not
 * written.
 */
export async function renderStills(
  root: string,
  series: string,
  cutList: CutList,
  {
    out,
    policy,
    browser,
    origin,
    marks,
  }: {
    readonly out: string
    readonly marks: ReadonlyArray<ChapterMark>
    readonly policy: RenderPolicy
    readonly browser: Browser
    readonly origin: string
  }
): Promise<void> {
  await writeFile(
    join(root, "cut-list.json"),
    `${JSON.stringify(cutList, null, 1)}\n`
  )
  const page = await openRecorder(browser, origin)
  try {
    const done = await renderWithBurnIns(page, root, series, {
      workDir: "cache",
      out,
      policy,
      stepCacheDir: STEPS,
      warn,
    })
    if (!done.ok) fail(["Nothing was rendered:", ...done.problems])
    console.log(`wrote ${join(root, done.value.video)}`)
    // A render with no chapters leaves none from an earlier one.
    const file = join(root, "description.txt")
    await rm(file, { force: true })
    const lines = chapterLines(chaptersOf(done.value.shotTimes, marks))
    const description = UploadCopySchema.shape.description.safeParse(lines)
    if (lines !== "" && !description.success)
      process.stderr.write(
        `no chapters written: ${description.error.issues.map((i) => i.message).join("; ")}\n`
      )
    else if (lines !== "") {
      await writeFile(file, lines)
      console.log(`wrote ${file}`)
    }
  } finally {
    await page.close()
  }
}
