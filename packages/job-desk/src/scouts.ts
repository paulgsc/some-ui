import { z } from "zod"

import {
  HttpsUrlSchema,
  IdSchema,
  MAX_SCOUT_LOCATION,
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
 * description as I pasted it, stands in: ROUTINE.md §3. The place and posted
 * date I give a scout come before anything the run takes from that text, and
 * a scout whose page shows no posted date can still be a pick, one that says
 * it is undated (SC3, owner, 2026-10-31).
 *
 * Both are optional members, so a file from before them still parses, and
 * the schema stays `/1`: nothing that reads a scouts file today (the
 * mailbox, home's index of it) reads either.
 */
/** The longest posting text a scout may carry. */
export const MAX_POSTING_TEXT = 20_000

/** Where a scout's posting is, as its page says (`ScoutsSchema`'s `location`). */
export const ScoutLocationSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_SCOUT_LOCATION)

/**
 * The day a scout's page says it was posted, or null when the page shows
 * none: undated (`ScoutsSchema`'s `postedOn`).
 */
export const ScoutPostedOnSchema = z.iso.date().nullable()

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
          /** Absent when I gave none. */
          location: ScoutLocationSchema.optional(),
          /** Absent when I didn't say. */
          postedOn: ScoutPostedOnSchema.optional(),
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
