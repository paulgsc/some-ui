/**
 * What home keeps for good of the owner's record (MY-DATA MD2b, #2519;
 * paulgsc/server `GET /subjects/me/kept`, `storage_repo::kept`): for each
 * kind My data lists under "Kept for good", how many home holds and since
 * when. Pure: `./model` carries it beside home's count of the recordings,
 * and `./words` says it.
 *
 * - **Home's count only.** What this phone holds of these and hasn't sent
 *   home yet isn't in it: the rows say "on home".
 * - **No sizes.** Home keeps no size for these records, and adding their
 *   bodies up would read every one, so the charts stay the recordings'.
 * - **A kind home doesn't name is left out,** so a newer home that counts
 *   one more kind still reads.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { readAs } from "@some-ui/core-utils"
import { z } from "zod"

/** Every kind of record kept for good, as home names it, in the page's order. */
export const RECORD_KINDS = [
  "sessions",
  "reflections",
  "ideas",
  "practice",
  "korean",
  "jobs",
  "self",
  "leetype",
  "rust-rounds",
  "rust-weeks",
  "rust-round-log",
  "scene-asks",
  "studio-log",
] as const

export type RecordKind = (typeof RECORD_KINDS)[number]

const isRecordKind = (name: string): name is RecordKind =>
  RECORD_KINDS.some((kind) => kind === name)

const Kept = z.object({
  kinds: z.array(
    z.object({
      kind: z.string(),
      count: z.number().int().nonnegative(),
      since: z.string().refine((at) => !Number.isNaN(Date.parse(at))),
    })
  ),
})

/** One kind's count on home. */
export type RecordHeld = {
  readonly count: number
  /** The earliest time its records name, ISO 8601. */
  readonly since: string
}

/** What home said of the record, or why it said nothing. */
export type RecordReading =
  | {
      readonly kind: "read"
      /** Each kind home holds any of; one it holds none of is absent. */
      readonly held: Readonly<Partial<Record<RecordKind, RecordHeld>>>
    }
  /** Home answered, without this read: it runs an older version. */
  | { readonly kind: "older" }
  /** No answer, another answer, or one the phone can't read. */
  | { readonly kind: "unreachable" }

/** What home's answer to its count of the record says, or that there was none. */
export function readRecord(answer: HomeAnswer | "unanswered"): RecordReading {
  if (answer === "unanswered") return { kind: "unreachable" }
  if (answer.status === 404) return { kind: "older" }
  if (answer.status !== 200) return { kind: "unreachable" }
  const kept = readAs(Kept, answer.body)
  if (kept === null) return { kind: "unreachable" }
  const held: Partial<Record<RecordKind, RecordHeld>> = {}
  for (const { kind, count, since } of kept.kinds)
    if (isRecordKind(kind) && count > 0) held[kind] = { count, since }
  return { kind: "read", held }
}
