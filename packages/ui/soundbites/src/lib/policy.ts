import type { Soundbite } from "./types"

/**
 * At most this many soundbites are kept on the phone. A seventh never waits
 * on a decision: it replaces one, the oldest unless the person picked another.
 */
export const SOUNDBITE_LIMIT = 6

/** A soundbite stops itself, and is kept, at one minute. */
export const SOUNDBITE_MAX_MS = 60_000

/** The recorder's target bitrate: Opus is clear for a voice at 32 kbps. */
export const SOUNDBITE_BITS_PER_SECOND = 32_000

/**
 * The most the kept soundbites hold, near enough (the bitrate is the
 * recorder's target): what an app budgeting its storage keeps free for them.
 */
export const SOUNDBITES_MAX_BYTES =
  SOUNDBITE_LIMIT * (SOUNDBITE_MAX_MS / 1000) * (SOUNDBITE_BITS_PER_SECOND / 8)

/** Shorter than this is a stray double-tap, not something said. */
export const SOUNDBITE_MIN_MS = 1_000

/** Newest first: the order the page lists them in. */
export function byNewest(bites: ReadonlyArray<Soundbite>): Array<Soundbite> {
  return [...bites].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
}

/**
 * Which kept soundbite the next one will replace, or null while there is
 * room. `choice` is the one the person picked, honoured while it is still
 * kept; otherwise the oldest.
 */
export function nextReplaced(
  kept: ReadonlyArray<Soundbite>,
  choice: string | null,
  limit = SOUNDBITE_LIMIT
): Soundbite | null {
  if (kept.length < limit) return null
  const chosen = kept.find((bite) => bite.id === choice)
  return chosen ?? byNewest(kept).at(-1) ?? null
}

/**
 * The ids a new soundbite displaces so that, with it, no more than `limit`
 * are kept: `nextReplaced` first, then the oldest of the rest for as long as
 * there are still too many (only after the limit was lowered, or a write
 * elsewhere raced this one).
 */
export function displacedBy(
  kept: ReadonlyArray<Soundbite>,
  choice: string | null,
  limit = SOUNDBITE_LIMIT
): Array<string> {
  const first = nextReplaced(kept, choice, limit)
  if (first === null) return []
  const rest = byNewest(kept.filter((bite) => bite.id !== first.id)).reverse()
  const excess = kept.length + 1 - limit
  return [first.id, ...rest.slice(0, excess - 1).map((bite) => bite.id)]
}
