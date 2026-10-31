import { z } from "zod"

import {
  HttpsUrlSchema,
  IdSchema,
  NoteIdsSchema,
  parseWith,
  text,
  TrackedSchema,
  VoiceFileSchema,
  type Parsed,
} from "./shared"

/**
 * `some-ui.job-scouts/1`: postings I found myself, shared to Drive's
 * `some-ui jobs/Scout/` as `scouts-<stamp>.json` for the routine's second
 * opinion, which comes back in the next digest's `scouts`.
 *
 * How the routine reads a scout's link, and when `postingText`, the
 * description as I pasted it, stands in: ROUTINE.md §3.
 */
/** The longest posting text a scout may carry. */
export const MAX_POSTING_TEXT = 20_000

export const ScoutsSchema = z.object({
  schema: z.literal("some-ui.job-scouts/1"),
  sharedAt: z.iso.datetime(),
  scouts: z
    .array(
      z
        .object({
          id: IdSchema,
          url: HttpsUrlSchema,
          /** Title and company as I saw them. */
          title: text,
          why: z.string(),
          postingText: z.string().max(MAX_POSTING_TEXT).nullable(),
          voice: z.array(VoiceFileSchema),
          addedAt: z.iso.datetime(),
        })
        .and(TrackedSchema)
    )
    .min(1),
  notes: NoteIdsSchema,
})

export type Scouts = z.infer<typeof ScoutsSchema>

export function parseScouts(raw: string): Parsed<Scouts> {
  return parseWith(ScoutsSchema, "a scouts file", raw)
}

/** `scouts-<stamp>.json`, the stamp in local time (`20261018T145200`). */
export function scoutsFileName(stamp: string): string {
  return `scouts-${stamp}.json`
}

/** The day a `scoutsFileName` name is for, or `null` for any other name. */
export function scoutsFileDay(name: string): string | null {
  const [, y, m, d] =
    /^scouts-(\d{4})(\d{2})(\d{2})T\d{6}\.json$/.exec(name) ?? []
  return y === undefined ? null : `${y}-${m ?? ""}-${d ?? ""}`
}
