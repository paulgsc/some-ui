import { z } from "zod"

import {
  HttpsUrlSchema,
  IdSchema,
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
 * Indeed pages refuse agents, so a link alone cannot be read. `postingText`
 * carries the description when I paste it; without it, the routine looks the
 * posting up through the Indeed connector by title and company.
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
})

export type Scouts = z.infer<typeof ScoutsSchema>

export function parseScouts(raw: string): Parsed<Scouts> {
  return parseWith(ScoutsSchema, "a scouts file", raw)
}

/** `scouts-<stamp>.json`, the stamp in local time (`20261018T145200`). */
export function scoutsFileName(stamp: string): string {
  return `scouts-${stamp}.json`
}
