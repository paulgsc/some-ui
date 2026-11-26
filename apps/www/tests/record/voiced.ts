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
 * made. A scene the owner said (a Rust Rounds answer, RR16) plays their own
 * take instead, never the speaker's.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import type { Browser, Locator, Page } from "@playwright/test"
import { installedCompositionPort } from "@some-ui/video-motion/node"
import {
  chapterLines,
  chaptersFound,
  chaptersOf,
  DEFAULT_POLICY,
  estimatedMs,
  FEWEST_CHAPTERS,
  MB,
  overflowLines,
  overLength,
  previewOf,
  QUIET,
  spreadWords,
  stillFile,
  thumbnailInput,
  UploadCopySchema,
  withSeries,
} from "@some-ui/video-render"
import type {
  CastLayout,
  ChapterMark,
  CutList,
  Overflowing,
  Ports,
  RenderPolicy,
  StillTake,
  TakeFiles,
  ThumbnailFacts,
} from "@some-ui/video-render"
import {
  hit,
  nodePorts,
  placeBrandFiles,
  readSeries,
  speakerOf,
  STEPS,
  TimedSchema,
  warn,
} from "@some-ui/video-render/node"
import { serve } from "@tests/ui-fit/harness"

import { openRecorder, renderWithBurnIns } from "./burn-ins"
import { fail, here } from "./command"
import { clearThumbnail, writeThumbnail } from "./thumbnail"

/**
 * The owner's take of scene `file`, from `own` (any audio ffmpeg reads), as
 * `<file>.wav` in the video's folder (`ports`'), played whole: its length is the scene's. Its words
 * are the times home kept beside it, or with none, `said` spread over it.
 */
async function ownTake({
  own,
  said: text,
  timed,
  file,
  ports,
}: {
  readonly own: TakeFiles
  readonly said: string
  readonly timed: boolean
  readonly file: string
  readonly ports: Ports
}): Promise<StillTake> {
  const made = await ports.ffmpeg({
    args: [...QUIET, "-i", own.audio, "-vn", "-ac", "1", `${file}.wav`],
  })
  if (!made.ok) fail([`${own.audio} can't be read as audio:`, made.stderr])
  const facts = await ports.probe(`${file}.wav`)
  if (!facts) fail([`${own.audio} can't be read as audio`])
  const ms = Math.round(facts.durationMs)
  if (!timed) return { ms, owner: true }
  const words =
    own.words === null
      ? spreadWords(text, ms)
      : TimedSchema.shape.words.parse(
          JSON.parse(await readFile(own.words, "utf8"))
        )
  return { ms, words, owner: true }
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

/**
 * How a recorder keeps a video's steps: in its folder's `cache/steps`,
 * saying each step not kept and each answered from the cache.
 */
const STEP_CACHE = { stepCacheDir: STEPS, warn, hit } as const

/**
 * A scene to record: its stage address, and what is said over it, in which
 * voice, or by the owner (`own`), whose take plays instead.
 */
export type Shot = {
  readonly id: string
  readonly url: string
  readonly said: string
  readonly voice: string
  /** Absolute paths. */
  readonly own?: TakeFiles
  /** Its files' name, when not its place in `shots` (`stillFile`). */
  readonly file?: string
  /**
   * Its name for a person, said when it doesn't fit the frame (RETRY):
   * "<chapter>, scene <n>" (`sceneNames`); "scene <n>" by its place here
   * when absent.
   */
  readonly name?: string
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

/** Each cast bubble the shown frame draws, and its box on the page, in whole pixels. */
async function castLayoutOf(shown: Locator): Promise<CastLayout> {
  const bubbles = shown.locator("[data-speaker]")
  const layout: Array<CastLayout[number]> = []
  for (const bubble of await bubbles.all()) {
    const box = await bubble.boundingBox()
    const who = await bubble.getAttribute("data-speaker")
    if (box === null || who === null) continue
    layout.push({
      who,
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height),
    })
  }
  return layout
}

export async function recordStills({
  page,
  root,
  shots,
  frame,
  speaker,
  timed,
  policy,
  announce = true,
  casts,
}: {
  readonly page: Page
  readonly root: string
  readonly shots: ReadonlyArray<Shot>
  readonly frame: (id: string) => string
  /** Home's speaker, or null for a silent video. */
  readonly speaker: string | null
  readonly timed: boolean
  readonly policy: RenderPolicy
  /**
   * Whether it says `scenes <n>` itself; false when its caller counts these
   * shots with others it records (a cards essay's cards and spoken scenes).
   */
  readonly announce?: boolean
  /**
   * Where each still draws its cast, by shot id, filled in when given: each
   * `[data-speaker]` bubble's box in the still's pixels (HOST18, C1561).
   */
  readonly casts?: Map<string, CastLayout>
}): Promise<ReadonlyArray<StillTake | null>> {
  await mkdir(root, { recursive: true })
  const ports = nodePorts(root)
  const say =
    speaker === null
      ? null
      : await speakerOf(root, speaker, policy, nodePorts(root))
  const takes: Array<StillTake | null> = []
  const overflowing: Array<Overflowing> = []
  // Home's board says "scene k of n" (#2899): `scenes <n>` once, before the
  // first `recorded <file>`, is the n (paulgsc/server's render worker reads it).
  if (announce) console.log(`scenes ${String(shots.length)}`)
  for (const [i, shot] of shots.entries()) {
    const file = shot.file ?? stillFile(i, shot.id)
    await page.goto(shot.url)
    const shown = await shownFrame(page, frame(shot.id))
    await page.evaluate(async () => {
      await document.fonts.ready
    })
    if ((await shown.getAttribute("data-overflow")) === "true")
      overflowing.push({
        id: shot.id,
        name: shot.name ?? `scene ${String(i + 1)}`,
      })
    await page.screenshot({
      path: join(root, `${file}.png`),
      animations: "disabled",
      caret: "hide",
    })
    if (casts !== undefined) casts.set(shot.id, await castLayoutOf(shown))
    takes.push(
      shot.own !== undefined
        ? await ownTake({
            own: shot.own,
            said: shot.said,
            timed,
            file,
            ports,
          })
        : say !== null && shot.said !== ""
          ? await say({ file, text: shot.said, voice: shot.voice, timed })
          : null
    )
    console.log(`recorded ${file}`)
  }
  if (overflowing.length > 0) fail(overflowLines(overflowing))
  return takes
}

/**
 * The speaker `values` ask for: `--speaker` under `--voices kokoro`, or null
 * under `--voices none`, a silent video. Any other `--voices` is refused.
 */
export function speakerFlag(values: {
  readonly voices: string
  readonly speaker: string
}): string | null {
  if (values.voices !== "kokoro" && values.voices !== "none")
    fail(["--voices is kokoro or none"])
  return values.voices === "kokoro" ? values.speaker : null
}

/**
 * Renders a recording's whole cut list, or, for a template's preview, the
 * 15–30 s cut of it (`previewOf`) into `preview.mp4`. A preview is never
 * uploaded, so it carries no chapter marks and no thumbnail; an episode's
 * thumbnail is drawn beside its video (`./thumbnail`).
 */
export async function renderCut(
  root: string,
  series: string,
  whole: CutList,
  options: {
    readonly preview: boolean
    /** The episode's file, when it isn't a preview. */
    readonly episode: string
    /** The episode's facts, which its thumbnail's genre and title come from. */
    readonly thumbnail: ThumbnailFacts
    readonly marks: () => ReadonlyArray<ChapterMark>
    readonly policy: RenderPolicy
    readonly browser: Browser
    readonly origin: string
  }
): Promise<void> {
  // The scenes are recorded; home's board now says they are being put
  // together (#2899). Read by paulgsc/server's render worker.
  console.log("assembling")
  const { preview } = options
  const cut = preview ? previewOf(whole) : { ok: true as const, value: whole }
  if (!cut.ok) fail(["The preview can't be cut:", ...cut.problems])
  if (!preview) await clearThumbnail(root)
  await renderStills(root, series, cut.value, {
    out: preview ? "preview.mp4" : options.episode,
    policy: options.policy,
    browser: options.browser,
    origin: options.origin,
    marks: preview ? [] : options.marks(),
  })
  // An episode's thumbnail, made with its video, once the video is (C1026);
  // a preview has none.
  if (!preview)
    await writeThumbnail(
      options.browser,
      root,
      thumbnailInput(options.thumbnail, whole)
    )
}

/**
 * `cutList` kept as `cut-list.json` in `root` and rendered to `out` in
 * `series`, its burn-ins (each scene's captions) drawn by the recorder page
 * of the app at `origin` (`./burn-ins`). The episode's chapters at the
 * scenes' real times (`marks`, SFEED4) go in `description.txt` beside it,
 * for the upload's YouTube description; with too few to show, it is not
 * written.
 */
async function renderStills(
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
  // From the templates' version 4 (HYPER5), the brand's open and close are
  // compositions, drawn by video-motion beside the stills; so are a
  // series' own intro and outro (#3476), which the renderer adds.
  const pinned = await readSeries(series, cutList.series.version)
  if (!pinned.ok) fail(["The series can't be read:", ...pinned.problems])
  const framed = withSeries(cutList, pinned.value)
  const draws = (framed.ok ? framed.value : cutList).shots.some(
    (s) => s.picture.kind === "composition"
  )
  // On the video's own drive: home's /tmp is a small RAM disk HyperFrames
  // can't draw on (video-motion's `pin.ts`).
  const draw = draws ? await mkdtemp(join(root, "draw-")) : null
  const compositions =
    draw === null ? null : installedCompositionPort(root, draw)
  if (compositions?.ok === false) fail([compositions.problem])
  const page = await openRecorder(browser, origin)
  try {
    const done = await renderWithBurnIns(page, root, series, {
      workDir: "cache",
      out,
      policy,
      ...STEP_CACHE,
      ...(compositions?.ok ? { compositions: compositions.port } : {}),
    })
    if (!done.ok) fail(["Nothing was rendered:", ...done.problems])
    console.log(`wrote ${join(root, done.value.video)}`)
    // A render with no chapters leaves none from an earlier one.
    const file = join(root, "description.txt")
    await rm(file, { force: true })
    const found = chaptersFound(done.value.shotTimes, marks)
    const lines = chapterLines(chaptersOf(done.value.shotTimes, marks))
    const description = UploadCopySchema.shape.description.safeParse(lines)
    // A render that marks chapters says why it wrote none (#3032).
    if (marks.length > 0 && found.length < FEWEST_CHAPTERS)
      process.stderr.write(
        `no chapters: ${String(found.length)} found, YouTube shows chapters from ${String(FEWEST_CHAPTERS)}\n`
      )
    else if (lines !== "" && !description.success)
      process.stderr.write(
        `no chapters written: ${description.error.issues.map((i) => i.message).join("; ")}\n`
      )
    else if (lines !== "") {
      await writeFile(file, lines)
      console.log(`wrote ${file}`)
    }
  } finally {
    await page.close()
    if (draw !== null) await rm(draw, { recursive: true, force: true })
  }
}
