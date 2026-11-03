/**
 * A show's format (SHOW SH1, #2526): the ordered scenes every episode of a
 * show has, each with its name, where its picture comes from, its hold, and
 * when it is left out. A show is a series (the skin, `series.ts`) plus a
 * format; an episode is the format applied to one period's data
 * (`episode.ts`), and follows it strictly: no scene outside it.
 *
 * What each scene says (its point and the facts it keeps) comes from the
 * period's data, so the format holds only what every episode shares. The
 * show's own workspace computes it from its code, a compile-time template,
 * and pins each version as a file: a folder of `v1.json`, `v2.json`, …
 * (`versionOfFile`), never edited once an episode pins it, as a series is.
 */

import { z } from "zod"

import { problemsOf } from "./cut-list"
import type { Parsed } from "./cut-list"
import { LOOKS } from "./plans"
import { ms } from "./vocabulary"

export const FORMAT_SCHEMA = "some-ui.show-format/1"

/** A scene becomes a primer's cut, so its id is one: short and lowercase. */
export const sceneId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/)

const showId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/)

/** The longest a primer runs in cuts, and so a format in scenes. */
export const FORMAT_SCENES_MAX = 24

const FormatSceneSchema = z.object({
  id: sceneId,
  /** What the person calls it: "Our division". */
  name: z.string().min(1),
  /** Where its picture comes from: a clip recorded from `from`, or a card. */
  picture: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("capture"), from: z.string().min(1) }),
    z.object({ kind: z.literal("card") }),
  ]),
  /** How long it holds, and so the voice's target. */
  holdMs: ms.min(3_000),
  /** When an episode leaves it out, in words; absent, it is always shown. */
  skip: z.string().min(1).optional(),
})

export const FormatSchema = z
  .object({
    schema: z.literal(FORMAT_SCHEMA),
    id: showId,
    version: z.number().int().positive(),
    title: z.string().min(1),
    /** The series version its episodes are drawn in. */
    series: z.object({ id: showId, version: z.number().int().positive() }),
    /** The look every episode is drawn in: the show's, never the episode's. */
    look: z.enum(LOOKS),
    scenes: z.array(FormatSceneSchema).min(1).max(FORMAT_SCENES_MAX),
  })
  .refine((f) => new Set(f.scenes.map((s) => s.id)).size === f.scenes.length, {
    message: "two scenes share an id",
    path: ["scenes"],
  })

export type Format = z.infer<typeof FormatSchema>
export type FormatScene = z.infer<typeof FormatSceneSchema>

export function parseFormat(raw: unknown): Parsed<Format> {
  const parsed = FormatSchema.safeParse(raw)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, problems: problemsOf(parsed.error, "format") }
}
