/**
 * The learner shelf, as an activity sees it: a host-supplied place on the
 * learner's account where something they made (a LeetType round, a pasted
 * TOPIK lesson) is kept because they asked, so they can replay it on another
 * device (paulgsc/server#387; adaptive-learning canon Rem. 7.3). Each
 * activity keeps under its own name on the host and supplies what is
 * activity-specific: the key an item is kept under and how a kept body is
 * read back (`keptRoundOf` in `@some-ui/leetype`, `keptLessonOf` in
 * `@some-ui/topik`).
 *
 * `ShelfPort` is structural on purpose. The host (`apps/www`'s
 * `lib/shelf-client`) builds it over its own transport, and neither side
 * imports the other. A host with no shelf (a static build, no session)
 * passes none, and nothing offers to keep: every activity plays exactly as
 * it does with one, since an item on the shelf is also in the learner's chat
 * with their model (Rem. 7.3 (e)).
 *
 * What this module holds to, for every caller:
 *
 * - **Only on request.** `keep` is called from one place, the learner's tap
 *   on "Keep on this account" (`KeepOnShelf`). Nothing keeps or removes in
 *   the background; the listing is read when a screen that shows the shelf
 *   opens, and a body only on a tap to replay it.
 * - **Content only.** The body kept is the item itself, never a
 *   commitment, an outcome, a survey or a count of rounds played.
 * - **Never trusted.** A kept body is read back through the same intake a
 *   paste goes through before it is played; one that fails it is shown as
 *   unreadable, never played.
 * - **Never evicted.** A full shelf is the host's `409`, reported as
 *   `full`; the learner removes something, the app never does.
 */

/** One kept item, as the shelf's listing describes it: never its body. */
export type ShelfItem = { key: string; contentHash: string; savedAt: string }

export type ShelfPort = {
  /** This learner's kept items, and how many the shelf holds at most. */
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
 * tap reads the listing first. If `base` or any held `-N` variant already
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
  // Every held copy of this name too, however high its suffix: after
  // removals `base-5` can hold these bytes with `base` free (review, #1600).
  const copies = [...held.keys()].filter(
    (key) =>
      key.startsWith(`${base}-`) && /^\d+$/.test(key.slice(base.length + 1))
  )
  let free: string | undefined
  for (const key of new Set([...candidates, ...copies])) {
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
const LEADING_DOTS = /^\.+/

/**
 * `name` held to the shelf's key rule, a plain URL path segment:
 * URL-unreserved characters, not starting with `.` or `http`, no `.json`
 * suffix. A model may write any name, and the same name always maps to the
 * same key, so keeping a replayed item again finds it
 * (`keepWithoutReplacing`) rather than adding another. `noun` names the item
 * where nothing of `name` is left, and prefixes one that would start with
 * `http`.
 */
export function plainShelfKey(name: string, noun: string): string {
  let plain = name.replace(NOT_UNRESERVED, "-")
  // A loop, not `/(?:\.json)+$/i`: that regex backtracks polynomially on a
  // name of many `.json`s that does not end in one (CodeQL, #1641).
  while (plain.toLowerCase().endsWith(".json")) plain = plain.slice(0, -5)
  plain = plain.replace(LEADING_DOTS, "")
  if (plain === "") return noun
  return plain.startsWith("http") ? `${noun}-${plain}` : plain
}
