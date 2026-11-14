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
 * is not a primer (`./episode-file`'s `episodeOf` refuses it); its ids still fit a cut's, so a
 * take or a reply can name its scene. The weekly call (`call.ts`) repeats.
 */

import { SESSION_THEME_IDS } from "@some-ui/styles/theme/registry"
import type { SessionThemeId } from "@some-ui/styles/theme/registry"
import { z } from "zod"

import { problemsOf } from "./cut-list"
import type { Parsed } from "./cut-list"
import { LOOKS } from "./plans"
import { ms } from "./vocabulary"

export const FORMAT_SCHEMA = "some-ui.show-format/1"

/** One of the app's themes, by its id (`@some-ui/styles`). */
const ThemeIdSchema = z.custom<SessionThemeId>(
  (id) => SESSION_THEME_IDS.some((theme) => theme === id),
  { message: "names no theme of the app's" }
)

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

/**
 * The most items a repeated scene shows: the weekly call's from version 5
 * (`CALL_SERIES_MOST`), whose long weeks are series (#2918).
 */
export const REPEAT_MOST = 200

/** The longest a repeated scene's id is, so `<id>-<n>` is still a cut's id. */
export const REPEATED_ID_MAX = 40 - 1 - String(REPEAT_MOST).length

/** The id of item `n` (from 1) of a repeated scene: "done-3". */
export const repeatedId = (scene: string, n: number): string => `${scene}-${n}`

/** Which item of repeated scene `scene` the id `id` is (`repeatedId`'s inverse), if it is one. */
export function itemOfRepeated(scene: string, id: string): number | undefined {
  const n = id.startsWith(`${scene}-`) ? id.slice(scene.length + 1) : ""
  return /^[1-9][0-9]*$/.test(n) ? Number(n) : undefined
}

/**
 * A template's shape (SFEED2 #2670, FEED7 #2664): what every episode opens,
 * marks and closes with, set in the template and never by the fill.
 *
 * - Every episode of a template with a shape opens on its locked intro: who
 *   wrote it, what drew it, that the voices are synthetic, whose calls are
 *   inside. Code fills it from the episode's data, never the AI, and there
 *   is no setting to leave it out.
 * - `brand`: the owner's brand intro, after the locked intro, and outro,
 *   last: their mark; from a version naming `brand.motion` (HYPER5), drawn
 *   by that composition rather than the stage.
 * - `chapters`: the scenes that open with a chapter slide, which says the
 *   section's name aloud, so an episode can be listened to.
 * - `subtitles`: whether the words said are captioned (SFEED11, #2707):
 *   `line` and `word` both draw the captions burn-in, in the look the series
 *   names, and the look says whether the word being said is lit (its
 *   `highlight`, `@some-ui/burn-ins`). Versions already pinned keep the
 *   field as they wrote it.
 * - `theme` (SFEED10, #2675): the app's theme every scene is drawn in, by
 *   its id; Mochi Night is the one made for video. `brand.theme` (SFEED14,
 *   #2766): the theme the mark is drawn in on the brand intro and outro,
 *   chosen in Studio; absent, the template's. A version from before them
 *   has neither and is drawn in the page's own theme.
 * - `parts` (#2918): an episode too long for one video is a series of
 *   parts, each at most `mostMs` long by its words, broken at a chapter
 *   once a part reaches `aimMs`; every part opens on the locked intro and the
 *   brand, and says which part it is. Absent, an episode is one video.
 */
export const ShapeSchema = z.strictObject({
  brand: z.strictObject({
    intro: z.boolean(),
    outro: z.boolean(),
    theme: ThemeIdSchema.optional(),
    /**
     * The composition that draws the brand intro and outro (HYPER5, #2728),
     * one of `@some-ui/video-motion`'s, by its folder's name: the code's mark
     * in `markThemeOf`, moving. Absent, they are the stage's slides.
     */
    motion: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
      .optional(),
  }),
  chapters: z.array(sceneId),
  subtitles: z.enum(["off", "line", "word"]),
  theme: ThemeIdSchema.optional(),
  parts: z
    .strictObject({
      mostMs: z.number().int().positive(),
      aimMs: z.number().int().positive(),
    })
    .refine((parts) => parts.aimMs <= parts.mostMs, {
      message: "a part's aim is longer than its most",
    })
    .optional(),
})

export type Shape = z.infer<typeof ShapeSchema>

/** `shape`, drawn in theme `id`, its mark too. */
export const inTheme = (shape: Shape, id: SessionThemeId): Shape => ({
  ...shape,
  brand: { ...shape.brand, theme: id },
  theme: id,
})

/** The theme a shape's mark is drawn in: its own, else the template's. */
export const markThemeOf = (
  shape: Shape | undefined
): SessionThemeId | undefined => shape?.brand.theme ?? shape?.theme

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
   * (`./episode-file`'s `episodeOf` refuses to).
   */
  skip: words.optional(),
  /**
   * One scene per item of the period's data, none up to `max`; absent, the
   * scene shows once.
   */
  repeat: z
    .object({ max: z.number().int().min(1).max(REPEAT_MOST) })
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
    /** Absent in a version from before shapes: no intro, chapters or captions. */
    shape: ShapeSchema.optional(),
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
  .refine(
    (f) =>
      (f.shape?.chapters ?? []).every((id) =>
        f.scenes.some((scene) => scene.id === id)
      ),
    { message: "a chapter names no scene of the format", path: ["shape"] }
  )

export type Format = z.infer<typeof FormatSchema>
export type FormatScene = z.infer<typeof FormatSceneSchema>

/**
 * Why a stage that draws format `name` up to version `newest` can't draw
 * `version`, or null when it can (VS1, #2796): a version newer than the
 * build knows is a fill written for a later stage, which this one would draw
 * in an older look, silently.
 */
export function versionRefusal(
  name: string,
  newest: number,
  version: number
): string | null {
  if (Number.isInteger(version) && version >= 1 && version <= newest)
    return null
  return `This stage draws ${name} up to version ${String(newest)}, and was asked for version ${String(version)}: publish a newer stage first`
}

export function parseFormat(raw: unknown): Parsed<Format> {
  const parsed = FormatSchema.safeParse(raw)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, problems: problemsOf(parsed.error, "format") }
}
