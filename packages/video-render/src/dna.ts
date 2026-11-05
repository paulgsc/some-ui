/**
 * A video's DNA (STUDIO ST33, the owner's decision 3 of 2026-11-04): what a
 * video is made from, so it can always be made again. The template it goes
 * through, the shape the owner built (the cut list), the takes each scene
 * says, and the data that fills it. The rendered file is never what is kept.
 *
 * The phone's Finish queues one per revision on home, which stores it as
 * sent (paulgsc/server, `PUT /studio/videos/:video/queued/:rev`, at most
 * `VIDEO_DNA_MAX_BYTES`). `parseVideoDna` holds every rule home holds a DNA
 * to, and reads the shape and data, which home keeps unread, besides. Home's
 * routine then fills it and renders it (ST33's slices 2 and 3).
 *
 * Version 1 has one kind of template, a show's format: an episode's
 * (`episode.ts`), whose data is its pins and each scene's point and the
 * facts it keeps. ST29 adds the templates a video of your own goes through,
 * and `shape` becomes ST30's shape; `takes` stays as it is.
 */

import { z } from "zod"

import { CutListSchema, once, parseCutList, problemsOf } from "./cut-list"
import type { CutList, Parsed } from "./cut-list"
import { EpisodePinSchema } from "./episode"
import { showId, words } from "./format"

export const VIDEO_DNA_SCHEMA = "some-ui.video-dna/1"

/** The most bytes of UTF-8 a DNA may take, as home stores it: 256 KiB. */
export const VIDEO_DNA_MAX_BYTES = 256 * 1024

/** The most characters a DNA's title has, as JavaScript counts code points. */
export const VIDEO_DNA_TITLE_MAX_CHARS = 200

/** The most takes a DNA names, as home holds it to. */
export const VIDEO_DNA_MAX_TAKES = 200

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/)

/**
 * A name the code gives a template or a scene, as home holds both to
 * (`is_name`): lowercase letters, digits and `-`, at most 64 characters.
 * A show's id is one.
 */
const name = showId

/**
 * The names under home's `/voice-notes/` that are routes of their own, so
 * never a note's id (paulgsc/server `voice_repo`'s `ROUTE_NAMES`).
 */
const NOTE_ROUTES: ReadonlySet<string> = new Set([
  "on-drive",
  "kept",
  "deleted",
  "takes",
])

/** A voice note's id, as home reads one in a take. */
const noteId = id.refine((note) => !NOTE_ROUTES.has(note), {
  message: "a voice note's id is never one of home's routes",
})

/** A control character (Unicode's `Cc`), which home refuses in a title. */
const CONTROL = /\p{Cc}/u

/** The template a video goes through: for now, a show's format and its version. */
const TemplateSchema = z.strictObject({
  kind: z.literal("show-format"),
  id: name,
  version: z.number().int().positive(),
})

/** Scene `scene` says the take home holds as voice note `note`. */
const TakeSchema = z.strictObject({ scene: name, note: noteId })

/** What fills an episode: its pins, and each scene's point and facts. */
const EpisodeDataSchema = z.object({
  episode: EpisodePinSchema,
  scenes: z.array(
    z.object({
      scene: id,
      /** What to make the case for, in your own words. */
      point: words,
      /** Facts a take may neither drop nor contradict. */
      keep: z.array(words),
    })
  ),
})

/**
 * A DNA as home reads one (paulgsc/server `studio_video_repo`'s `model.rs`):
 * no field it doesn't name, a title of 1 to 200 characters once trimmed on
 * one line, and at most `VIDEO_DNA_MAX_TAKES` takes.
 */
export const VideoDnaSchema = z.strictObject({
  schema: z.literal(VIDEO_DNA_SCHEMA),
  /** The phone's project id: the path's `:video`. */
  video: id,
  /** The revision queued: the path's `:rev`. */
  rev: z.number().int().positive(),
  title: words
    .refine((title) => [...title].length <= VIDEO_DNA_TITLE_MAX_CHARS, {
      message: `a title has at most ${VIDEO_DNA_TITLE_MAX_CHARS} characters`,
    })
    .refine((title) => !CONTROL.test(title), {
      message: "a title is one line, with no control characters",
    }),
  /** When the owner finished it, ISO 8601. */
  queuedAt: z.iso.datetime(),
  template: TemplateSchema,
  takes: z.array(TakeSchema).max(VIDEO_DNA_MAX_TAKES),
  /** The revision's cut list: its scenes in order, their pictures and holds. */
  shape: CutListSchema,
  data: EpisodeDataSchema,
})

export type VideoDna = z.infer<typeof VideoDnaSchema> & {
  readonly shape: CutList
}

/** The DNA, or every reason home would not keep it as written. */
export function parseVideoDna(raw: unknown): Parsed<VideoDna> {
  const parsed = VideoDnaSchema.safeParse(raw)
  if (!parsed.success)
    return { ok: false, problems: problemsOf(parsed.error, "video DNA") }
  const shape = parseCutList(parsed.data.shape)
  if (!shape.ok)
    return {
      ok: false,
      problems: shape.problems.map((line) => `shape: ${line}`),
    }
  const dna: VideoDna = { ...parsed.data, shape: shape.value }
  const problems = once(crossProblems(dna))
  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, value: dna }
}

/** What the parts say of each other: the scenes, the template and its pins. */
function crossProblems(dna: VideoDna): Array<string> {
  const problems: Array<string> = []
  const scenes = new Set(dna.shape.shots.map((shot) => shot.id))
  const taken = new Set<string>()
  for (const take of dna.takes) {
    if (!scenes.has(take.scene))
      problems.push(`takes: the shape has no scene ${take.scene}`)
    if (taken.has(take.scene))
      problems.push(`takes: scene ${take.scene} has two takes`)
    taken.add(take.scene)
  }
  for (const each of dna.data.scenes) {
    if (!scenes.has(each.scene))
      problems.push(`data.scenes: the shape has no scene ${each.scene}`)
  }
  const { format } = dna.data.episode
  if (format.id !== dna.template.id || format.version !== dna.template.version)
    problems.push("template: it isn't the format the episode pins")
  return problems
}
