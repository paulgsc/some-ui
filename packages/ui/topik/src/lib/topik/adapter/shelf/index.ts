/**
 * The learner shelf, as this applet sees it: a host-supplied place on the
 * learner's account where a lesson they pasted is kept because they asked,
 * so they can replay it on another device (paulgsc/server#387; canon
 * Rem. 7.3).
 *
 * `ShelfPort` is structural on purpose. The host (`apps/www`'s
 * `lib/shelf-client`) builds it over its own transport, and neither side
 * imports the other. A host with no shelf (a static build, no session)
 * passes none, and the applet offers no shelf: everything else plays
 * exactly as it does with one, since a lesson on the shelf is also in the
 * learner's chat with their model (Rem. 7.3 (e)).
 *
 * What this module holds to, for every caller:
 *
 * - **Only on request.** `keep` is called from one place, the learner's tap
 *   on "Keep on this account" for the lesson in the pasted slot. Nothing
 *   keeps or removes in the background; the listing is read when a screen
 *   that shows the shelf opens, and a body only on a tap to replay it.
 * - **Content only.** The body kept is the pasted slot's own document
 *   (`serializePastedLesson`): the lesson and its manifest entry. Never a
 *   survey, a resume point, a flag or an outcome.
 * - **Never trusted.** A kept body is read back through the same intake a
 *   paste goes through (`intakeLesson`) before it is played; one that fails
 *   it is shown as unreadable, never played.
 * - **Never evicted.** A full shelf is the host's `409`, reported as
 *   `full`; the learner removes something, the applet never does.
 */

import type { PastedLesson } from "@topik/lib/topik/adapter/pasted-lesson"
import {
  intakeLesson,
  LOCAL_LESSON_PREFIX,
} from "@topik/lib/topik/generation/intake"
import { z } from "zod"

/** One kept item, as the shelf's listing describes it: never its body. */
export type ShelfItem = { key: string; contentHash: string; savedAt: string }

export type ShelfPort = {
  /** This learner's kept lessons, and how many the shelf holds at most. */
  list(): Promise<{ items: Array<ShelfItem>; cap: number }>
  /** A kept body, parsed but unchecked. */
  read(key: string): Promise<unknown>
  /**
   * Keeps `body` under `key`. Rejects with an error whose `reason` is
   * `"full"` when the shelf is at its cap and `key` is new, or
   * `"signed-out"` without a session.
   */
  keep(
    key: string,
    body: string
  ): Promise<{ change: "kept" | "replaced" | "unchanged"; item: ShelfItem }>
  remove(key: string): Promise<void>
}

/** Why a shelf call failed, as far as the learner can do something about it. */
export type ShelfFailure = "full" | "signed-out" | "invalid" | "failed"

export function shelfFailureOf(error: unknown): ShelfFailure {
  const reason =
    typeof error === "object" && error !== null && "reason" in error
      ? error.reason
      : undefined
  return reason === "full" || reason === "signed-out" || reason === "invalid"
    ? reason
    : "failed"
}

/** Hex SHA-256 of `body`'s UTF-8 bytes, which is the server's `content_hash`; null where Web Crypto is not available. */
async function contentHashOf(body: string): Promise<string | null> {
  // `crypto.subtle` is not exposed outside a secure context.
  if (typeof crypto === "undefined" || !("subtle" in crypto)) return null
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(body)
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}

/** Whether `key` on the shelf holds exactly `body`. */
async function holdsSame(
  shelf: ShelfPort,
  key: string,
  heldHash: string,
  body: string
): Promise<boolean> {
  const hash = await contentHashOf(body)
  if (hash !== null) return hash === heldHash
  // No Web Crypto (not a secure context): compare what is kept instead.
  try {
    const kept: unknown = await shelf.read(key)
    const mine: unknown = JSON.parse(body)
    return JSON.stringify(kept) === JSON.stringify(mine)
  } catch {
    return false
  }
}

/**
 * Keeps an item without replacing anything else the learner kept. The key
 * comes from a name their model chose, so two different items can share one
 * (`first-dinner`, `two-sum`), and a `PUT` to a held key replaces it: past
 * the cap, too, since only a *new* key is refused (review, #1600). So the
 * tap reads the listing first. If `base` or a `-2`, `-3`… variant already
 * holds these bytes, that is reported unchanged and nothing is written;
 * otherwise the item goes under the first of those keys the shelf does not
 * hold, and a full shelf still answers `full`.
 *
 * `body` may depend on the key it is kept under (a TOPIK lesson carries its
 * own key), so a replayed copy serializes back to exactly what was kept and
 * is found again rather than kept twice. A keep from another device between
 * the listing and the write can still replace; that is one learner racing
 * themselves.
 */
export async function keepWithoutReplacing(
  shelf: ShelfPort,
  base: string,
  body: string | ((key: string) => string)
): Promise<{ change: "kept" | "unchanged"; key: string }> {
  const bodyAt = (key: string): string =>
    typeof body === "string" ? body : body(key)
  const { items } = await shelf.list()
  const held = new Map(items.map((item) => [item.key, item.contentHash]))
  const candidates = Array.from({ length: held.size + 1 }, (_, index) =>
    index === 0 ? base : `${base}-${index + 1}`
  )
  let free: string | undefined
  for (const key of candidates) {
    const heldHash = held.get(key)
    if (heldHash === undefined) {
      free ??= key
    } else if (await holdsSame(shelf, key, heldHash, bodyAt(key))) {
      return { change: "unchanged", key }
    }
  }
  // One more candidate than held keys, so one of them is free.
  const key = free ?? `${base}-${candidates.length + 1}`
  const { change } = await shelf.keep(key, bodyAt(key))
  return { change: change === "unchanged" ? "unchanged" : "kept", key }
}

const NOT_UNRESERVED = /[^A-Za-z0-9._~-]+/g
const JSON_SUFFIX = /(?:\.json)+$/i
const LEADING_DOTS = /^\.+/

/**
 * The shelf key for a pasted lesson's key: the `local:` prefix stripped
 * (`:` is not a plain key character), then held to the shelf's key rule, a
 * plain URL path segment: URL-unreserved characters, not starting with `.`
 * or `http`, no `.json` suffix. Intake's slug already satisfies most of
 * that; `http-basics` is the case it does not.
 */
export function shelfKeyOf(lessonKey: string): string {
  const bare = lessonKey.startsWith(LOCAL_LESSON_PREFIX)
    ? lessonKey.slice(LOCAL_LESSON_PREFIX.length)
    : lessonKey
  const plain = bare
    .replace(NOT_UNRESERVED, "-")
    .replace(JSON_SUFFIX, "")
    .replace(LEADING_DOTS, "")
  if (plain === "") return "lesson"
  return plain.startsWith("http") ? `lesson-${plain}` : plain
}

const KeptDocumentSchema = z.object({
  version: z.literal(1),
  meta: z.record(z.string(), z.unknown()),
  batches: z.array(z.unknown()),
})

/**
 * A kept body as a lesson to play, or null when it is not one. Checked as a
 * paste is: `intakeLesson` holds the conversations to the schema, withholds
 * every probe the audit finds in error and derives the counts and relation
 * tags, with the kept manifest entry standing in for the one a reply
 * carries. The lesson plays under `local:<key>`, the key it was kept
 * under, so keeping it again from the pasted slot serializes to the kept
 * bytes and is found rather than kept twice (`keepWithoutReplacing`).
 */
export function keptLessonOf(body: unknown, key: string): PastedLesson | null {
  const kept = KeptDocumentSchema.safeParse(body)
  if (!kept.success) return null
  const intake = intakeLesson(JSON.stringify(kept.data.batches), kept.data.meta)
  if (!intake.ok) return null
  return {
    meta: { ...intake.meta, key: `${LOCAL_LESSON_PREFIX}${key}` },
    batches: intake.batches,
  }
}
