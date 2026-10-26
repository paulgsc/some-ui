import { z } from "zod"

import { ADJACENT_FAMILIES, TRACKS } from "./policy"

export const text = z.string().trim().min(1)

/** Names a pick or a scout in every file that refers to it. */
export const IdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{2,40}$/)

/** `fingerprint()`'s output. */
export const FingerprintSchema = z.string().regex(/^[^|]+\|[^|]+\|[^|]+$/)

/** The phone's id for the event an entry came from. */
export const EventIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)

export const CommitSchema = z.string().regex(/^[0-9a-f]{7,40}$/)

/** A track, and on the adjacent track its family. */
export const TrackedSchema = z.discriminatedUnion("track", [
  z.object({ track: z.literal(TRACKS[0]), family: z.null() }),
  z.object({ track: z.literal(TRACKS[1]), family: z.enum(ADJACENT_FAMILIES) }),
])

/**
 * Home's limits on what the phone keeps there (paulgsc/server
 * `crates/db/jobs/src/model.rs`): a note (a pass's, an outcome's, a
 * disagreement's, a debrief's `what`, a scout's `why`), a scout's title, and
 * its link. The phone holds each new event to them; the files don't, so a
 * record kept before they existed still shares.
 */
export const MAX_NOTE = 2_000
export const MAX_SCOUT_TITLE = 300
export const MAX_URL = 2_048

export const HttpsUrlSchema = z.url({ protocol: /^https$/ })

/** A voice note shared beside a file, by its name in the same folder. */
export const VoiceFileSchema = z
  .string()
  .regex(/^[\w.-]+\.(?:webm|ogg|opus|m4a|mp4|aac|mp3|wav)$/)

/**
 * The phone's own id for a voice note: what home keeps it under, and what
 * the mailbox names home's transcript of it by (`transcript-<id>-<n>.json`,
 * ROUTINE.md §2, "Home's transcripts"). Home's rule for a note id
 * (paulgsc/server `voice_repo::is_name`).
 */
const NoteIdSchema = z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/)

/**
 * Each voice note a file names, by its file name, to the phone's id for it.
 * Files before it had none.
 */
export const NoteIdsSchema = z.record(VoiceFileSchema, NoteIdSchema).default({})

export type Parsed<T> = { ok: true; value: T } | { ok: false; problem: string }

/** A file's text against `schema`, or what is wrong with it, in words. */
export function parseWith<T>(
  schema: z.ZodType<T>,
  what: string,
  raw: string
): Parsed<T> {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { ok: false, problem: "That file isn’t JSON." }
  }
  const parsed = schema.safeParse(json)
  if (parsed.success) return { ok: true, value: parsed.data }
  const issue = parsed.error.issues.at(0)
  return {
    ok: false,
    problem: issue
      ? `Not ${what}: ${issue.path.join(".") || "file"}: ${issue.message}`
      : `Not ${what}.`,
  }
}
