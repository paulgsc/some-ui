/**
 * A show's format (SHOW SH1, #2526): the ordered scenes every episode of a
 * show has, each with its name, where its picture comes from, its hold, and
 * when it is left out. A show is a series (the skin, `series.ts`) plus a
 * format; an episode is the format applied to one period's data
 * (`episode.ts`), and follows it strictly: no scene outside it.
 *
 * A scene's point, what a take over it makes the case for, is the same
 * every week, so the format pins it; the facts a take keeps come from the
 * period's data (`episode.ts`). The show's own workspace computes the format
 * from its code, a compile-time template, and pins each version as a file: a
 * folder of `v1.json`, `v2.json`, … (`versionOfFile`), never edited once an
 * episode pins it, as a series is.
 *
 * Each scene becomes a cut of a primer, version 2, which the phone's Studio
 * reads (soundbites' `journal/primer.ts`): the `PRIMER_*` limits below are
 * the ones it holds a primer to, kept here so both read one copy.
 *
 * A scene may repeat: one scene per item of the period's data, none up to
 * `repeat.max`, each named `<id>-<n>` (`repeatedId`). A format that repeats
 * is not a primer (`episodeOf` refuses it); its ids still fit a cut's, so a
 * take or a reply can name its scene. The weekly call (`call.ts`) repeats.
 */

import { z } from "zod"

import { problemsOf } from "./cut-list"
import type { Parsed } from "./cut-list"
import { LOOKS } from "./plans"
import { ms } from "./vocabulary"

export const FORMAT_SCHEMA = "some-ui.show-format/1"

/** A primer cut's id names its take's file: short, lowercase, unique. */
export const PRIMER_CUT_ID = /^[a-z0-9][a-z0-9-]{0,39}$/

/** The most cuts a version 2 primer has. */
export const PRIMER_V2_CUTS = 24

/** The longest a version 2 primer's takes run in all: six minutes. */
export const PRIMER_V2_BUDGET_MS = 360_000

/** A cut's target is a guide, never under this. */
export const PRIMER_CUT_TARGET_MIN_MS = 3_000

/** A scene becomes a primer's cut, so its id is one. */
export const sceneId = z.string().regex(PRIMER_CUT_ID)

/** Words someone reads: what the phone counts as text, never only spaces. */
export const words = z.string().trim().min(1)

/** A show's id, and its format's: a name the code gives it. */
export const showId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/)

/** The longest a repeated scene's id is, so `<id>-<n>` is still a cut's id. */
export const REPEATED_ID_MAX = 40 - 1 - String(PRIMER_V2_CUTS).length

/** The id of item `n` (from 1) of a repeated scene: "done-3". */
export const repeatedId = (scene: string, n: number): string => `${scene}-${n}`

const FormatSceneSchema = z.object({
  id: sceneId,
  /** What the person calls it: "Our division". */
  name: words,
  /** What a take over it makes the case for, in your own words. */
  point: words,
  /**
   * Where its picture comes from: a clip recorded from `from`, as wide as
   * `cssWidth` CSS px, or a card.
   */
  picture: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("capture"),
      from: words,
      cssWidth: z.number().int().positive(),
    }),
    z.object({ kind: z.literal("card") }),
  ]),
  /** How long it holds, and so the voice's target. */
  holdMs: ms.min(PRIMER_CUT_TARGET_MIN_MS).max(PRIMER_V2_BUDGET_MS),
  /**
   * When an episode may leave it out, in words; absent, it never is
   * (`episodeOf` refuses to).
   */
  skip: words.optional(),
  /**
   * One scene per item of the period's data, none up to `max`; absent, the
   * scene shows once.
   */
  repeat: z
    .object({ max: z.number().int().min(1).max(PRIMER_V2_CUTS) })
    .optional(),
})

export const FormatSchema = z
  .object({
    schema: z.literal(FORMAT_SCHEMA),
    id: showId,
    version: z.number().int().positive(),
    title: words,
    /** The series version its episodes are drawn in. */
    series: z.object({ id: showId, version: z.number().int().positive() }),
    /** The look every episode is drawn in: the show's, never the episode's. */
    look: z.enum(LOOKS),
    scenes: z.array(FormatSceneSchema).min(1).max(PRIMER_V2_CUTS),
  })
  .refine((f) => new Set(f.scenes.map((s) => s.id)).size === f.scenes.length, {
    message: "two scenes share an id",
    path: ["scenes"],
  })
  .refine(
    (f) =>
      f.scenes.every(
        (s) =>
          s.repeat === undefined ||
          (s.skip === undefined && s.id.length <= REPEATED_ID_MAX)
      ),
    {
      message: `a repeated scene has no skip and an id of at most ${REPEATED_ID_MAX} characters`,
      path: ["scenes"],
    }
  )
  .refine(
    (f) =>
      !f.scenes.some((scene) =>
        f.scenes.some(
          (other) =>
            other.repeat !== undefined &&
            new RegExp(`^${other.id}-[0-9]+$`).test(scene.id)
        )
      ),
    { message: "a scene takes a repeated scene's id", path: ["scenes"] }
  )

export type Format = z.infer<typeof FormatSchema>
export type FormatScene = z.infer<typeof FormatSceneSchema>

export function parseFormat(raw: unknown): Parsed<Format> {
  const parsed = FormatSchema.safeParse(raw)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, problems: problemsOf(parsed.error, "format") }
}
