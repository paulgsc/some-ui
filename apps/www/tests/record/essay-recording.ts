/**
 * The Rust Rounds essay's recording (RR16, #2691), shared by `record:essay`
 * (`./essay`) and the template's preview, `record:preview` (`./preview`):
 * the stage's stills, the tutor said in its voice, each answer the owner's
 * take, and the renderer laying them together. `./essay`'s header says how.
 */
import { readdir, readFile, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import type { Route } from "@playwright/test"
import {
  ESSAY_VOICES,
  essayChapterMarks,
  essayCutList,
  essayFormat,
  essayScenes,
  essayTakeFiles,
  hasCaptions,
  parseEssay,
} from "@some-ui/video-render"
import type { Essay, TakeFiles, Voicing } from "@some-ui/video-render"

import type { CallValues } from "./call-recording"
import { CALL_OPTIONS } from "./call-recording"
import { fail, here, launchChromium } from "./command"
import type { OwnTake } from "./voiced"
import {
  placeBed,
  policyOf,
  recordStills,
  refuseLong,
  renderCut,
  shownFrame,
  siteOf,
} from "./voiced"

/** The frame the stage is recorded at: the call's series, which the essay is drawn in. */
const FRAME = { width: 1920, height: 1080 } as const

/** The call's series, sampled in the renderer's workspace. */
const SERIES = resolve(
  import.meta.dirname,
  "../../../../packages/video-render/src/sample/series/conference-call"
)

/** The stage's read of an essay named by its week (`call/feed.ts`). */
const ESSAY_READ = /\/rust-essays\/[^/?#]+\.json$/

/** The flags `record:essay` and the essay's preview share with the call's. */
export const ESSAY_OPTIONS = CALL_OPTIONS

export type EssayValues = Omit<CallValues, "week" | "week-file"> & {
  readonly "essay-file"?: string
  readonly takes?: string
}

/** An essay as home keeps it: its file's bytes, and its data. */
type Kept = { readonly bytes: Buffer; readonly essay: Essay }

async function keptEssay(path: string): Promise<Kept> {
  const bytes = await readFile(path)
  const parsed = parseEssay(JSON.parse(bytes.toString("utf8")))
  if (!parsed.ok)
    fail([`${path} isn't a Rust Rounds essay:`, ...parsed.problems])
  return { bytes, essay: parsed.value }
}

/** Each answered ticket's take in `dir`, by its key, or every reason not. */
async function takesIn(
  dir: string,
  essay: Essay
): Promise<Readonly<Record<string, OwnTake>>> {
  const files = essayTakeFiles(essay, await readdir(dir))
  if (!files.ok)
    fail([`The takes in ${dir} don't fit the essay:`, ...files.problems])
  const at = (name: string): string => join(dir, name)
  return Object.fromEntries(
    Object.entries(files.value).map(([ticket, take]: [string, TakeFiles]) => [
      ticket,
      {
        audio: at(take.audio),
        words: take.words === null ? null : at(take.words),
      },
    ])
  )
}

/** Answers the stage's read of the essay from the kept file alone. */
function answer(route: Route, kept: Kept): Promise<void> {
  const name = new URL(route.request().url()).pathname.split("/").at(-1)
  if (name !== `${kept.essay.week.id}.json`)
    return route.fulfill({ status: 404, body: "" })
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: kept.bytes,
  })
}

/**
 * Records and renders the essay of `values` into `<out>/<week>/essay.mp4`;
 * with `preview`, the template's sample essay, its answers read by a second
 * synthetic voice (C76), cut to its preview into `<out>/preview.mp4`.
 */
export async function recordEssay(
  values: EssayValues,
  { preview = false }: { readonly preview?: boolean } = {}
): Promise<void> {
  const policy = policyOf(values)
  if (values.voices !== "kokoro" && values.voices !== "none")
    fail(["--voices is kokoro or none"])
  if (
    !preview &&
    (values["essay-file"] === undefined || values.takes === undefined)
  )
    fail(["--essay-file names the essay, and --takes the folder of its takes"])
  const kept = preview
    ? null
    : await keptEssay(here(values["essay-file"] ?? ""))
  const owned =
    kept === null ? {} : await takesIn(here(values.takes ?? ""), kept.essay)
  const voicing: Voicing = kept === null ? "sample" : "owner"
  const week = kept?.essay.week.id ?? "sample"
  const site = await siteOf(values)
  const browser = await launchChromium()
  try {
    const page = await browser.newPage({
      viewport: FRAME,
      deviceScaleFactor: 1,
    })
    if (kept) await page.route(ESSAY_READ, (route) => answer(route, kept))
    const url = (scene: string): string =>
      `${site.origin}/essay?${new URLSearchParams({ week, scene, record: "true" }).toString()}`

    // The essay the stage plays, as it publishes it on the frame.
    await page.goto(url("intro"))
    const frame = await shownFrame(page, "[data-scene]")
    const published = await frame.getAttribute("data-essay")
    if (published === null) fail(["the stage published no essay"])
    const parsed = parseEssay(JSON.parse(published))
    if (!parsed.ok)
      fail(["The stage's essay can't make a video:", ...parsed.problems])
    const essay = parsed.value
    if (kept && essay.week.id !== kept.essay.week.id)
      fail([`the stage played ${essay.week.id}, not ${kept.essay.week.id}`])

    const scenes = essayScenes(essay, voicing)
    if (!preview) refuseLong(scenes, policy)
    const root = here(preview ? values.out : join(values.out, essay.week.id))
    const format = essayFormat(essay.template.version)
    const takes = await recordStills({
      page,
      root,
      shots: scenes.map((scene) => {
        const own =
          scene.section === "answer" && scene.speaker === "you" && scene.ticket
            ? owned[scene.ticket]
            : undefined
        return {
          id: scene.id,
          url: url(scene.id),
          said: scene.said,
          voice: ESSAY_VOICES[scene.speaker],
          ...(own ? { own } : {}),
        }
      }),
      frame: (id) => `[data-scene="${id}"]`,
      speaker: values.voices === "kokoro" ? values.speaker : null,
      timed: hasCaptions(format),
      policy,
    })
    // The music bed plays once the call's series names one (#2673).
    const bed = await placeBed(
      SERIES,
      format.series.version,
      values.brand,
      root
    )
    await writeFile(
      join(root, "essay.json"),
      `${JSON.stringify(essay, null, 1)}\n`
    )
    await renderCut(
      root,
      SERIES,
      essayCutList(essay, takes, { bed, voicing }),
      {
        preview,
        episode: "essay.mp4",
        marks: () => essayChapterMarks(essay),
        policy,
        browser,
        origin: site.origin,
      }
    )
  } finally {
    await browser.close()
    await site.close()
  }
}
