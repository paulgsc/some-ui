/**
 * The learner shelf, as an activity sees it: a host-supplied place on the
 * learner's account where something they made (a LeetType round, a pasted
 * TOPIK drama) is kept on request, to replay on another device
 * (paulgsc/server#387; adaptive-learning canon Rem. 7.3). Each activity
 * supplies its key and how a kept body is read back (`keptRoundOf` in
 * `@some-ui/leetype`, `treeOfDocument` in `@some-ui/topik`).
 *
 * `ShelfPort` is structural: the host (`apps/www`'s `lib/shelf-client`) builds
 * it over its own transport, and neither side imports the other. A host with
 * no shelf passes none and nothing offers to keep; the activity plays the
 * same, since the item is also in the learner's chat (Rem. 7.3 (e)).
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
 * comes from a name their model chose, so two items can share one, and a
 * `PUT` to a held key replaces it, even past the cap (only a *new* key is
 * refused). So the listing is read first: if `base` or any held `-N` variant
 * already holds these bytes, that is reported unchanged; otherwise the item
 * goes under the first free key, and a full shelf still answers `full`.
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
  // removals `base-5` can hold these bytes with `base` free.
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
  // Not `/(?:\.json)+$/i`, which backtracks polynomially (CodeQL), nor a loop
  // re-reading the string per suffix (quadratic): walk one end index back.

  let end = plain.length
  while (end >= 5 && plain.slice(end - 5, end).toLowerCase() === ".json") {
    end -= 5
  }
  plain = plain.slice(0, end).replace(LEADING_DOTS, "")
  if (plain === "") return noun
  return plain.startsWith("http") ? `${noun}-${plain}` : plain
}
