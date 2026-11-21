/**
 * An essay's recording, the Rust Rounds essay's (RR16, #2691) or the
 * interview essay's (IW6, #2937), shared by `record:essay` (`./essay`) and
 * the Rust essay template's preview, `record:preview` (`./preview`): the
 * stage's stills, the tutor said in its voice, each answer the owner's take,
 * and the renderer laying them together. `./essay`'s header says how.
 */
import { readdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { captionSpace, LANDSCAPE } from "@some-ui/burn-ins"
import {
  ESSAY_SCHEMA,
  essayChapterMarks,
  essayCutList,
  essayFormat,
  essayScenes,
  essaySceneVoices,
  essayTakeFiles,
  essayTakeOf,
  hasCaptions,
  INTERVIEW_ESSAY_SCHEMA,
  interviewEssayChapterMarks,
  interviewEssayCutList,
  interviewEssayFormat,
  interviewEssayScenes,
  interviewEssayTakeFiles,
  interviewTakeOf,
  parseEssay,
  parseInterviewEssay,
} from "@some-ui/video-render"
import type {
  ChapterMark,
  CutList,
  Essay,
  Format,
  InterviewEssay,
  Parsed,
  Screens,
  Speaker,
  StillTake,
  TakeFiles,
  Voicing,
} from "@some-ui/video-render"

import type { CallValues } from "./call-recording"
import { FRAME, SERIES } from "./call-recording"
import { answerFile, fail, here, launchChromium } from "./command"
import { captureScreens } from "./screens"
import {
  placeBed,
  policyOf,
  recordStills,
  refuseLong,
  renderCut,
  shownFrame,
  siteOf,
} from "./voiced"

export type EssayValues = Omit<CallValues, "week" | "week-file"> & {
  readonly "essay-file"?: string
  readonly takes?: string
  /**
   * The essay's week as home serves it (`GET /rust-weeks/<id>`, with its
   * rustc runs), from which the phone's own cards are photographed
   * (`./screens`, RR31). A Rust Rounds essay's only; with none, none are.
   */
  readonly "week-file"?: string
}

/**
 * A scene as the recorder reads it: its id, its section (a chapter slide
 * opens a chapter, so its voices move on: C840), who says it and what.
 */
type Said = {
  readonly id: string
  readonly section: string
  readonly speaker: Speaker
  readonly said: string
}

/**
 * One kind of essay the recorder plays, all it needs of it: the Rust Rounds
 * essay (RR16) and the interview essay (IW6). Each kind's file names itself
 * by its `schema`, so `record:essay` takes either.
 */
type EssayKind<E extends { readonly week: { readonly id: string } }> = {
  readonly name: string
  /** The stage's read of an essay of this kind, by its week (`call/feed.ts`). */
  readonly read: RegExp
  /** The stage's `kind`, when it isn't the default. */
  readonly stage: string | null
  readonly parse: (raw: unknown) => Parsed<E>
  readonly takeFiles: (
    essay: E,
    names: ReadonlyArray<string>
  ) => Parsed<Readonly<Record<string, TakeFiles>>>
  /** Each scene, and the name of the owner's take it plays, if any. */
  readonly scenes: (
    essay: E,
    voicing: Voicing
  ) => ReadonlyArray<Said & { readonly take: string | null }>
  readonly format: (essay: E) => Format
  readonly cutList: (
    essay: E,
    takes: ReadonlyArray<StillTake | null>,
    options: {
      readonly bed: boolean
      readonly voicing: Voicing
      /** The phone's cards of its week (`./screens`), for its scenes to zoom into. */
      readonly screens?: Screens
      /** The share of the frame's height the stage keeps for captions. */
      readonly foot?: number
    }
  ) => CutList
  readonly marks: (essay: E) => Array<ChapterMark>
  /** Whether the phone's cards of its week can be photographed (`./screens`). */
  readonly screens: boolean
}

const RUST: EssayKind<Essay> = {
  name: "a Rust Rounds essay",
  read: /\/rust-essays\/[^/?#]+\.json$/,
  stage: null,
  parse: parseEssay,
  takeFiles: essayTakeFiles,
  scenes: (essay, voicing) =>
    essayScenes(essay, voicing).map((scene) => ({
      ...scene,
      take: essayTakeOf(scene),
    })),
  format: (essay) => essayFormat(essay.template.version),
  cutList: essayCutList,
  marks: essayChapterMarks,
  screens: true,
}

const INTERVIEW: EssayKind<InterviewEssay> = {
  name: "an interview essay",
  read: /\/interview-essays\/[^/?#]+\.json$/,
  stage: "interview",
  parse: parseInterviewEssay,
  takeFiles: interviewEssayTakeFiles,
  scenes: (essay, voicing) =>
    interviewEssayScenes(essay, voicing).map((scene) => ({
      ...scene,
      take: interviewTakeOf(scene),
    })),
  format: (essay) => interviewEssayFormat(essay.template.version),
  cutList: interviewEssayCutList,
  marks: interviewEssayChapterMarks,
  screens: false,
}

/** An essay as home keeps it: its file's bytes, and its data. */
type Kept<E> = { readonly bytes: Buffer; readonly essay: E }

/** Each answered take in `dir`, by its name there, or every reason not. */
async function takesIn<E extends { readonly week: { readonly id: string } }>(
  dir: string,
  kind: EssayKind<E>,
  essay: E
): Promise<Readonly<Record<string, TakeFiles>>> {
  const files = kind.takeFiles(essay, await readdir(dir))
  if (!files.ok)
    fail([`The takes in ${dir} don't fit the essay:`, ...files.problems])
  const at = (name: string): string => join(dir, name)
  return Object.fromEntries(
    Object.entries(files.value).map(([id, take]) => [
      id,
      {
        audio: at(take.audio),
        words: take.words === null ? null : at(take.words),
      },
    ])
  )
}

/**
 * Records and renders the essay of `values`, of either kind, into
 * `<out>/<week>/essay.mp4`; with `preview`, the Rust Rounds essay's sample
 * (`Voicing`), cut to its preview into `<out>/preview.mp4`.
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
  if (preview) return recordKind(RUST, null, values, policy, true)
  const path = here(values["essay-file"] ?? "")
  const bytes = await readFile(path)
  const raw: unknown = JSON.parse(bytes.toString("utf8"))
  const schema =
    typeof raw === "object" && raw !== null && "schema" in raw
      ? raw.schema
      : undefined
  if (schema === ESSAY_SCHEMA)
    return recordKind(RUST, { path, bytes, raw }, values, policy, false)
  if (schema === INTERVIEW_ESSAY_SCHEMA)
    return recordKind(INTERVIEW, { path, bytes, raw }, values, policy, false)
  fail([
    `${path} is no essay: its schema is neither ${ESSAY_SCHEMA} nor ${INTERVIEW_ESSAY_SCHEMA}`,
  ])
}

/** Records and renders an essay of `kind`: the file read, or with none its sample. */
async function recordKind<E extends { readonly week: { readonly id: string } }>(
  kind: EssayKind<E>,
  file: {
    readonly path: string
    readonly bytes: Buffer
    readonly raw: unknown
  } | null,
  values: EssayValues,
  policy: ReturnType<typeof policyOf>,
  preview: boolean
): Promise<void> {
  const weekFile = values["week-file"]
  if (weekFile !== undefined && (preview || !kind.screens))
    fail([`--week-file is a Rust Rounds essay's, not ${kind.name}'s`])
  let kept: Kept<E> | null = null
  if (file !== null) {
    const parsed = kind.parse(file.raw)
    if (!parsed.ok)
      fail([`${file.path} isn't ${kind.name}:`, ...parsed.problems])
    kept = { bytes: file.bytes, essay: parsed.value }
  }
  const owned =
    kept === null
      ? {}
      : await takesIn(here(values.takes ?? ""), kind, kept.essay)
  const voicing: Voicing = kept === null ? "sample" : "owner"
  const week = kept === null ? "sample" : kept.essay.week.id
  const site = await siteOf(values)
  const browser = await launchChromium()
  try {
    const page = await browser.newPage({
      viewport: FRAME,
      deviceScaleFactor: 1,
    })
    const bytes = kept?.bytes
    if (bytes !== undefined)
      await page.route(kind.read, (route) => answerFile(route, bytes, week))
    const url = (scene: string): string =>
      `${site.origin}/essay?${new URLSearchParams({
        ...(kind.stage === null ? {} : { kind: kind.stage }),
        week,
        scene,
        record: "true",
      }).toString()}`

    await page.goto(url("intro"))
    const frame = await shownFrame(page, "[data-scene]")
    const published = await frame.getAttribute("data-essay")
    if (published === null) fail(["the stage published no essay"])
    const parsed = kind.parse(JSON.parse(published))
    if (!parsed.ok)
      fail(["The stage's essay can't make a video:", ...parsed.problems])
    const essay = parsed.value
    if (kept && essay.week.id !== week)
      fail([`the stage played ${essay.week.id}, not ${week}`])

    const scenes = kind.scenes(essay, voicing)
    if (!preview) refuseLong(scenes, policy)
    const root = here(preview ? values.out : join(values.out, essay.week.id))
    const format = kind.format(essay)
    // The phone's own cards of the week, before any still (RR31).
    const screens =
      weekFile === undefined
        ? undefined
        : await captureScreens({
            browser,
            origin: site.origin,
            weekFile: here(weekFile),
            week: essay.week.id,
            root,
          })
    // Each scene in its speaker's voice for its chapter, as the essay's
    // version says (C840).
    const voices = essaySceneVoices(format.shape, scenes)
    const takes = await recordStills({
      page,
      root,
      shots: scenes.map((scene, i) => {
        const own = scene.take === null ? undefined : owned[scene.take]
        return {
          id: scene.id,
          url: url(scene.id),
          said: scene.said,
          voice: voices[i] ?? fail([`${scene.id}: no voice for it`]),
          ...(own ? { own } : {}),
        }
      }),
      frame: (id) => `[data-scene="${id}"]`,
      speaker: values.voices === "kokoro" ? values.speaker : null,
      timed: hasCaptions(format),
      policy,
    })
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
      kind.cutList(essay, takes, {
        bed,
        voicing,
        ...(screens === undefined
          ? {}
          : {
              screens,
              // A zoomed card stays above the band the stage keeps for captions.
              foot: captionSpace(LANDSCAPE) / LANDSCAPE.height,
            }),
      }),
      {
        preview,
        episode: "essay.mp4",
        marks: () => kind.marks(essay),
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
