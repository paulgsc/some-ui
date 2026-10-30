/**
 * A series: what every video in a set shares (STUDIO ST11), versioned so a
 * video pins one and moves to a newer one on purpose. A series is a folder
 * of versions, `v1.json`, `v2.json`, …; a version is never edited once a
 * video pins it, so a newer one is a new file, and a video renders from the
 * version it pins (`readSeries` in `node.ts`). That holds for the drawn
 * layers too: a version names each burn-in kind's design, and a design is
 * frozen once a published video used it (`@some-ui/burn-ins`).
 *
 * Its content (music, the sound kit, brand files) lives in Drive,
 * `Build Journal/template/`; the repo keeps this schema and a sample of
 * each series in `sample/series/`.
 *
 * A version may carry an intro and an outro: scenes the renderer adds to
 * every video that pins it (`withSeries`). They sit just inside the
 * authorship mark's bare cards when the video carries the mark, so the mark
 * still opens and closes the video, and its record counts them as scenes:
 * an agent's idea and wording, drawn by code (`authorship.ts` reads that
 * from the scene, with no case of its own). They are the series', not the
 * video's: a video never writes them, and `review.json` leaves them out, so
 * a note is never pinned to one (`render.ts`).
 */

import { z } from "zod"

import {
  BurnInDesignSchema,
  BurnInKindSchema,
  BurnInSchema,
  isAuthorship,
  problemsOf,
} from "./cut-list"
import type { CutList, Parsed, Shot } from "./cut-list"
import { LOOKS } from "./plans"
import { CheckedFileSchema, ms, SOUNDS, TRANSITIONS } from "./vocabulary"

export const SERIES_SCHEMA = "some-ui.video-series/1"

const even = z
  .number()
  .int()
  .positive()
  .refine((n) => n % 2 === 0, { message: "an even number of pixels" })

/**
 * A scene the series adds to every video: the ground for a card burn-in to
 * draw on, or a still from the series' content, checked by its sum so a
 * pinned version draws the same picture until a new version names another.
 */
const SeriesSceneSchema = z.object({
  picture: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("card") }),
    z.object({ kind: z.literal("still"), image: CheckedFileSchema }),
  ]),
  durationMs: ms.min(100),
  transitionIn: z.enum(TRANSITIONS).optional(),
  burnIns: z.array(BurnInSchema).default([]),
})

export type SeriesScene = z.infer<typeof SeriesSceneSchema>

export const SeriesSchema = z
  .object({
    schema: z.literal(SERIES_SCHEMA),
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
    version: z.number().int().positive(),
    title: z.string().min(1),
    frame: z.object({
      width: even,
      height: even,
      fps: z.number().int().min(12).max(60),
    }),
    /** The colour behind the picture, as `#rrggbb`. */
    ground: z.string().regex(/^#[0-9a-f]{6}$/),
    /** Where the picture sits in the frame, in the frame's pixels. */
    window: z.object({
      x: z.number().int().nonnegative(),
      y: z.number().int().nonnegative(),
      width: even,
      height: even,
    }),
    /** The look a new video in the series starts on. */
    defaultLook: z.enum(LOOKS),
    music: z
      .object({
        bed: CheckedFileSchema,
        /** The bed's level with no voice over it, in dB. */
        gainDb: z.number().max(0).default(-14),
      })
      .optional(),
    /** The CC0 sound kit, by the vocabulary's names. */
    sounds: z.partialRecord(z.enum(SOUNDS), CheckedFileSchema).default({}),
    soundGainDb: z.number().max(0).default(-8),
    /** The design each burn-in kind is drawn in, where a video names none. */
    designs: z.record(BurnInKindSchema, BurnInDesignSchema).default({}),
    /** The scene every video opens on, inside the authorship mark's intro. */
    intro: SeriesSceneSchema.optional(),
    /** The scene every video closes on, inside the authorship mark's end card. */
    outro: SeriesSceneSchema.optional(),
  })
  .refine(
    (s) =>
      ![s.intro, s.outro].some((scene) => scene?.burnIns.some(isAuthorship)),
    {
      message: "the authorship mark covers the whole video, not one scene",
      path: ["intro"],
    }
  )
  .refine(
    (s) =>
      s.window.x + s.window.width <= s.frame.width &&
      s.window.y + s.window.height <= s.frame.height,
    { message: "the window doesn't fit inside the frame", path: ["window"] }
  )

export type Series = z.infer<typeof SeriesSchema>

export function parseSeries(raw: unknown): Parsed<Series> {
  const parsed = SeriesSchema.safeParse(raw)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, problems: problemsOf(parsed.error, "series") }
}

/** A version's file in its series' folder. */
export const seriesFile = (version: number): string => `v${version}.json`

/** The version a file in a series' folder holds, or null for any other file. */
export function versionOfFile(name: string): number | null {
  const n = /^v([1-9][0-9]*)\.json$/.exec(name)?.[1]
  return n === undefined ? null : Number(n)
}

/** The ids the series' scenes take in the video, which none of its own may. */
export const SERIES_INTRO = "series-intro"
export const SERIES_OUTRO = "series-outro"

const sceneOf = (id: string, scene: SeriesScene): Shot => ({
  id,
  picture:
    scene.picture.kind === "card"
      ? { kind: "card" }
      : { kind: "still", source: scene.picture.image.file },
  durationMs: scene.durationMs,
  voiceInMs: 0,
  overrides: scene.transitionIn ? { transitionIn: scene.transitionIn } : {},
  burnIns: scene.burnIns,
  idea: { origin: "agent" },
})

/**
 * The video as rendered under `series`: its own scenes with the series'
 * intro and outro added, just inside the bare cards the authorship mark
 * opens and closes on when the video carries it, and first and last when
 * it doesn't. Refuses a video whose own scene takes a series scene's id.
 */
export function withSeries(cut: CutList, series: Series): Parsed<CutList> {
  const added = [
    ...(series.intro ? [SERIES_INTRO] : []),
    ...(series.outro ? [SERIES_OUTRO] : []),
  ]
  const taken = cut.shots.filter((s) => added.includes(s.id))
  if (taken.length > 0) {
    return {
      ok: false,
      problems: taken.map(
        (s) => `${s.id}: the series' own scene takes this id`
      ),
    }
  }
  const intro = series.intro ? [sceneOf(SERIES_INTRO, series.intro)] : []
  const outro = series.outro ? [sceneOf(SERIES_OUTRO, series.outro)] : []
  // `parseCutList` holds a video with the mark to a bare card at each end.
  const inside = cut.burnIns.some(isAuthorship) ? 1 : 0
  const shots = cut.shots
  const head = shots.slice(0, inside)
  const body = shots.slice(inside, shots.length - inside)
  const tail = shots.slice(shots.length - inside)
  return {
    ok: true,
    value: { ...cut, shots: [...head, ...intro, ...body, ...outro, ...tail] },
  }
}
