/**
 * The learner shelf, as LeetType sees it: a host-supplied place on the
 * learner's account where a round they made is kept because they asked, so
 * they can replay it on another device (paulgsc/server#387; adaptive-
 * learning canon Rem. 7.3). TOPIK's lessons use the same shelf
 * (`@some-ui/topik`, `lib/topik/adapter/shelf`), under their own activity.
 *
 * `ShelfPort` is structural on purpose. The host (`apps/www`'s
 * `lib/shelf-client`) builds it over its own transport, and neither side
 * imports the other. A host with no shelf (a static build, no session)
 * passes none, and nothing offers to keep a round: every round plays
 * exactly as it does with one, since a round on the shelf is also in the
 * learner's chat with their model (Rem. 7.3 (e)).
 *
 * What this module holds to, for every caller:
 *
 * - **Only on request.** `keep` is called from one place, the learner's tap
 *   on "Keep on this account" for their own round. Nothing keeps, lists or
 *   reads in the background.
 * - **Content only.** The body kept is the round (`serializeRound`), never
 *   a commitment, an outcome or a count of rounds played.
 * - **Never trusted.** A kept body is read back through the same intake a
 *   pasted round goes through (`intakeRound`, the corpus lint) before it is
 *   played; one that fails it is shown as unreadable, never played.
 * - **Never evicted.** A full shelf is the host's `409`, reported as
 *   `full`; the learner removes something, the app never does.
 */

import { intakeRound } from "@leetype/lib/leetype/generation/intake"
import type { Round } from "@leetype/types/authored-round"

/** One kept item, as the shelf's listing describes it: never its body. */
export type ShelfItem = { key: string; contentHash: string; savedAt: string }

export type ShelfPort = {
  /** This learner's kept rounds, and how many the shelf holds at most. */
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
export type ShelfFailure = "full" | "signed-out" | "failed"

export function shelfFailureOf(error: unknown): ShelfFailure {
  const reason =
    typeof error === "object" && error !== null && "reason" in error
      ? error.reason
      : undefined
  return reason === "full" || reason === "signed-out" ? reason : "failed"
}

const NOT_UNRESERVED = /[^A-Za-z0-9._~-]+/g
const JSON_SUFFIX = /(?:\.json)+$/i
const LEADING_DOTS = /^\.+/

/**
 * The shelf key for a round: its id, held to the shelf's key rule, a plain
 * URL path segment (URL-unreserved characters, not starting with `.` or
 * `http`, no `.json` suffix). `RoundSchema` asks only for a non-empty id,
 * and a model may write any; the same id always maps to the same key, so
 * keeping a replayed round again replaces it rather than adding another.
 */
export function shelfKeyOf(roundId: string): string {
  const plain = roundId
    .replace(NOT_UNRESERVED, "-")
    .replace(JSON_SUFFIX, "")
    .replace(LEADING_DOTS, "")
  if (plain === "") return "round"
  return plain.startsWith("http") ? `round-${plain}` : plain
}

/** A kept body as a round to play, or null when the paste's check refuses it. */
export function keptRoundOf(body: unknown): Round | null {
  const intake = intakeRound(JSON.stringify(body))
  return intake.ok ? intake.round : null
}
