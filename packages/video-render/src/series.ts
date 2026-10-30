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
 */

import { z } from "zod"

import { BurnInDesignSchema, BurnInKindSchema, problemsOf } from "./cut-list"
import type { Parsed } from "./cut-list"
import { LOOKS } from "./plans"
import { CheckedFileSchema, SOUNDS } from "./vocabulary"

export const SERIES_SCHEMA = "some-ui.video-series/1"

const even = z
  .number()
  .int()
  .positive()
  .refine((n) => n % 2 === 0, { message: "an even number of pixels" })

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
  })
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
