/**
 * A video's DNA (STUDIO ST33, the owner's decision 3 of 2026-11-04): what a
 * video is made from, so it can always be made again. The template it goes
 * through, the shape the owner built (the cut list), the takes each scene
 * says, and the data that fills it. The rendered file is never what is kept.
 *
 * The phone's Finish queues one per revision on home, which stores it as
 * sent and checks only what this schema says (paulgsc/server, `PUT
 * /studio/videos/:video/queued/:rev`, at most `VIDEO_DNA_MAX_BYTES`). Home's
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
import { words } from "./format"

export const VIDEO_DNA_SCHEMA = "some-ui.video-dna/1"

/** The most bytes of UTF-8 a DNA may take, as home stores it: 256 KiB. */
export const VIDEO_DNA_MAX_BYTES = 256 * 1024

/** The most characters a DNA's title has, as JavaScript counts code points. */
export const VIDEO_DNA_TITLE_MAX_CHARS = 200

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/)

/** The template a video goes through: for now, a show's format and its version. */
const TemplateSchema = z.object({
  kind: z.literal("show-format"),
  id: words,
  version: z.number().int(),
})

/** Scene `scene` says the take home holds as voice note `note`. */
const TakeSchema = z.object({ scene: id, note: id })

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

export const VideoDnaSchema = z.object({
  schema: z.literal(VIDEO_DNA_SCHEMA),
  /** The phone's project id: the path's `:video`. */
  video: id,
  /** The revision queued: the path's `:rev`. */
  rev: z.number().int().positive(),
  title: words.refine(
    (title) => [...title].length <= VIDEO_DNA_TITLE_MAX_CHARS,
    { message: `a title has at most ${VIDEO_DNA_TITLE_MAX_CHARS} characters` }
  ),
  /** When the owner finished it, ISO 8601. */
  queuedAt: z.iso.datetime(),
  template: TemplateSchema,
  takes: z.array(TakeSchema),
  /** The revision's cut list: its scenes in order, their pictures and holds. */
  shape: CutListSchema,
  data: EpisodeDataSchema,
})

export type VideoDna = z.infer<typeof VideoDnaSchema> & {
  readonly shape: CutList
}

/** The bytes `dna` takes as sent: its JSON, in UTF-8. */
export const videoDnaBytes = (dna: VideoDna): number =>
  new TextEncoder().encode(JSON.stringify(dna)).length

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
