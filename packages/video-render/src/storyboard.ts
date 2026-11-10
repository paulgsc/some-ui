/**
 * A template's storyboard (SFEED3, #2744; epic #2670 decision 3): every
 * frame of one episode, in order, drawn from the template's newest version
 * and its sample data before anything is filled. The shape is known before
 * the fill, so the storyboard says, frame by frame, what it is, who fills it
 * (code, the fill, or nothing), the words code fills in full, and about how
 * long it holds.
 *
 * Each template's code makes its storyboard from the same scenes it makes an
 * episode from (the call's `callStoryboard`, Playoff Delta's `storyboardFor`),
 * so what Studio draws is what home makes.
 */

import { z } from "zod"

import { problemsOf } from "./cut-list"
import type { Parsed } from "./cut-list"
import { itemOfRepeated, sceneId, showId, words } from "./format"
import type { Format } from "./format"
import { BRAND_MS, unsaidMs } from "./stills"
import { ms } from "./vocabulary"

export const STORYBOARD_SCHEMA = "some-ui.storyboard/1"

/** What a frame is: a template's framing, or one of its sections. */
export const FRAME_KINDS = [
  "intro",
  "brand-in",
  "chapter",
  "section",
  "brand-out",
] as const

export type FrameKind = (typeof FRAME_KINDS)[number]

const FrameSchema = z.strictObject({
  /** The scene's id in the video: "board", "moved-2", "chapter-board". */
  id: z.string().min(1),
  kind: z.enum(FRAME_KINDS),
  /** The format's scene a section shows or a chapter opens. */
  scene: sceneId.optional(),
  /** The section it shows or opens, by the format's name for it; the template's title otherwise. */
  name: words,
  /** Which of a repeated section's items it is, from 1; absent for one shown once. */
  item: z.number().int().positive().optional(),
  /**
   * Who writes its words: code, in full, here (`said`); the fill, which the
   * storyboard draws as bars; or nobody, for a brand slide.
   */
  by: z.enum(["code", "fill", "none"]),
  said: z.string(),
  /** About how long it holds before anything is said. */
  ms: ms.positive(),
})

export const StoryboardSchema = z
  .strictObject({
    schema: z.literal(STORYBOARD_SCHEMA),
    template: z.strictObject({
      id: showId,
      version: z.number().int().positive(),
    }),
    /** The sample it was drawn from, as a person would name it. */
    sample: words,
    frames: z.array(FrameSchema).min(1),
  })
  .refine(
    (s) =>
      s.frames.every((f) => (f.by === "code") === f.said.trim().length > 0),
    {
      message: "a frame's words are code's in full, or none",
      path: ["frames"],
    }
  )
  .refine(
    (s) => s.frames.every((f) => (f.by === "fill") === (f.kind === "section")),
    {
      message: "the fill writes every section's words, and only those",
      path: ["frames"],
    }
  )
  .refine(
    (s) =>
      s.frames.every(
        (f) =>
          (f.scene !== undefined) ===
          (f.kind === "section" || f.kind === "chapter")
      ),
    {
      message: "a section or a chapter names its scene, and nothing else does",
      path: ["frames"],
    }
  )
  .refine((s) => new Set(s.frames.map((f) => f.id)).size === s.frames.length, {
    message: "two frames share an id",
    path: ["frames"],
  })

export type Storyboard = z.infer<typeof StoryboardSchema>
export type StoryFrame = Storyboard["frames"][number]

export function parseStoryboard(raw: unknown): Parsed<Storyboard> {
  const parsed = StoryboardSchema.safeParse(raw)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, problems: problemsOf(parsed.error, "storyboard") }
}

/**
 * One scene as a template's code lays it out, before the fill: its id in the
 * video, what it is, and for the framing the words code says (a chapter's
 * and the intro's; a brand slide's are empty). A section's words are the
 * fill's; a sample's, where it has them, only time the frame.
 */
export type BoardScene =
  | {
      readonly kind: Exclude<FrameKind, "section" | "chapter">
      readonly id: string
      readonly said: string
    }
  | {
      readonly kind: "chapter"
      readonly id: string
      /** The format's scene the chapter opens. */
      readonly of: string
      readonly said: string
    }
  | {
      readonly kind: "section"
      readonly id: string
      /** The format's scene it shows, once or as one of its items. */
      readonly scene: string
      /**
       * The sample's words over it, where the sample has them: what it is
       * timed by, as an episode's scene with no take is. Absent, it holds for
       * the format's hold.
       */
      readonly said?: string
    }

/**
 * A template's scene as a storyboard frame's source: a chapter slide, the
 * locked intro or a brand slide by its section, any other as a section,
 * as the call's and the essay's scenes are both laid out.
 */
export function boardSceneOf(scene: {
  readonly section: string
  readonly id: string
  readonly said: string
  readonly of?: string
}): BoardScene {
  if (scene.section === "chapter" && scene.of !== undefined)
    return { kind: "chapter", id: scene.id, of: scene.of, said: scene.said }
  if (
    scene.section === "intro" ||
    scene.section === "brand-in" ||
    scene.section === "brand-out"
  )
    return { kind: scene.section, id: scene.id, said: scene.said }
  return {
    kind: "section",
    id: scene.id,
    scene: scene.section,
    said: scene.said,
  }
}

/** The format's scene `id`. */
function formatScene(format: Format, id: string): Format["scenes"][number] {
  const scene = format.scenes.find((s) => s.id === id)
  if (scene === undefined)
    throw new Error(`${format.id}: ${id} is no scene of the format`)
  return scene
}

/** One scene's frame: a section held for its sample words' reading time or else the format's hold, code's words for theirs, a brand slide for its own. */
function frameOf(format: Format, scene: BoardScene): StoryFrame {
  if (scene.kind === "section") {
    const of = formatScene(format, scene.scene)
    const item = of.repeat ? itemOfRepeated(of.id, scene.id) : undefined
    return {
      id: scene.id,
      kind: "section",
      scene: of.id,
      name: of.name,
      ...(item === undefined ? {} : { item }),
      by: "fill",
      said: "",
      ms: scene.said === undefined ? of.holdMs : unsaidMs(scene.said),
    }
  }
  if (scene.kind === "chapter") {
    const of = formatScene(format, scene.of)
    return {
      id: scene.id,
      kind: "chapter",
      scene: of.id,
      name: of.name,
      by: "code",
      said: scene.said,
      ms: unsaidMs(scene.said),
    }
  }
  if (scene.kind === "intro")
    return {
      id: scene.id,
      kind: "intro",
      name: format.title,
      by: "code",
      said: scene.said,
      ms: unsaidMs(scene.said),
    }
  return {
    id: scene.id,
    kind: scene.kind,
    name: format.title,
    by: "none",
    said: "",
    ms: BRAND_MS,
  }
}

/** The storyboard of `format` from `scenes`, its code's layout of the sample `sample` names. */
export function storyboardOf(
  format: Format,
  sample: string,
  scenes: ReadonlyArray<BoardScene>
): Storyboard {
  return {
    schema: STORYBOARD_SCHEMA,
    template: { id: format.id, version: format.version },
    sample,
    frames: scenes.map((scene) => frameOf(format, scene)),
  }
}

/** When each frame starts, in ms from the episode's start, and the whole length. */
export function framesInTime(board: Storyboard): {
  readonly at: ReadonlyArray<number>
  readonly ms: number
} {
  const at: Array<number> = []
  let t = 0
  for (const frame of board.frames) {
    at.push(t)
    t += frame.ms
  }
  return { at, ms: t }
}
