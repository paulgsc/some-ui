import { z } from "zod"

import { ADJACENT_FAMILIES, TRACKS } from "./policy"

export const text = z.string().trim().min(1)

/** Names a pick or a scout in every file that refers to it. */
export const IdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{2,40}$/)

/** `fingerprint()`'s output. */
export const FingerprintSchema = z.string().regex(/^[^|]+\|[^|]+\|[^|]+$/)

export const CommitSchema = z.string().regex(/^[0-9a-f]{7,40}$/)

/** A track, and on the adjacent track its family. */
export const TrackedSchema = z.discriminatedUnion("track", [
  z.object({ track: z.literal(TRACKS[0]), family: z.null() }),
  z.object({ track: z.literal(TRACKS[1]), family: z.enum(ADJACENT_FAMILIES) }),
])

export const HttpsUrlSchema = z.url({ protocol: /^https$/ })

/** A voice note shared beside a file, by its name in the same folder. */
export const VoiceFileSchema = z
  .string()
  .regex(/^[\w.-]+\.(?:webm|ogg|opus|m4a|mp4|aac|mp3|wav)$/)

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
