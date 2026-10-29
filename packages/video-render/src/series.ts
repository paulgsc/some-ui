/**
 * A series: what every video in a set shares (STUDIO ST11), versioned so a
 * video pins one and moves to a newer one on purpose. Its content (music,
 * the sound kit, brand files) lives in Drive, `Build Journal/template/`;
 * the repo keeps this schema and `sample/build-journal-short.json`.
 *
 * Intro and outro scenes, and which burn-ins every video carries, are
 * ST11's to add; this holds what the renderer needs today: the frame, the
 * ground, where the picture sits, the default look, the music bed and the
 * sound kit.
 */

import { z } from "zod"

import { CheckedFileSchema } from "./cut-list"
import type { Parsed } from "./cut-list"
import { LOOKS } from "./plans"
import { SOUNDS } from "./vocabulary"

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
  })
  .refine(
    (s) =>
      s.window.x + s.window.width <= s.frame.width &&
      s.window.y + s.window.height <= s.frame.height,
    { message: "the window fits inside the frame", path: ["window"] }
  )

export type Series = z.infer<typeof SeriesSchema>

export function parseSeries(raw: unknown): Parsed<Series> {
  const parsed = SeriesSchema.safeParse(raw)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : {
        ok: false,
        problems: parsed.error.issues.map(
          (i) => `${i.path.join(".") || "series"}: ${i.message}`
        ),
      }
}
