import type { PatternTake, TakePatternOptions } from "@some-ui/voice-capture"

import type { Held } from "./home-held"
import type { Soundbite } from "./types"

/**
 * At most this many soundbites are kept on the phone: an offline set (HF5,
 * #2180). A seventh replaces one home holds (one set aside first, then one a
 * Redo superseded, then the oldest listed) unless the person picked
 * another, and is refused while home holds none: nothing leaves the phone
 * before home holds it.
 */
export const SOUNDBITE_LIMIT = 6

/** A soundbite stops itself, and is kept, at one minute. */
export const SOUNDBITE_MAX_MS = 60_000

/** The recorder's target bitrate: Opus is clear for a voice at 32 kbps. */
export const SOUNDBITE_BITS_PER_SECOND = 32_000

/** One full-length take at the target bitrate, for budgeting its storage. */
export const SOUNDBITE_TAKE_MAX_BYTES =
  (SOUNDBITE_MAX_MS / 1000) * (SOUNDBITE_BITS_PER_SECOND / 8)

/**
 * The most audio the kept soundbites may hold: six full minutes at the target
 * bitrate. The store refuses a save past it (`fitsMaxBytes`), as it does one
 * past the device's room (`withRoom`).
 */
export const SOUNDBITES_MAX_BYTES = SOUNDBITE_LIMIT * SOUNDBITE_TAKE_MAX_BYTES

/** Whether `size` more bytes beside those `staying` keep within the cap. */
export function fitsMaxBytes(
  staying: ReadonlyArray<number>,
  size: number
): boolean {
  return staying.reduce((sum, each) => sum + each, size) <= SOUNDBITES_MAX_BYTES
}

/** How often a take's clock and level are read while it records. */
export const TAKE_TICK_MS = 100

/** Shorter than this is a stray double-tap, not something said. */
export const SOUNDBITE_MIN_MS = 1_000

/** A take's bounds, as the voice-capture take reads them. */
export const SOUNDBITE_TAKE_LIMITS = {
  minMs: SOUNDBITE_MIN_MS,
  maxMs: SOUNDBITE_MAX_MS,
} as const

/** What every soundbite answers: the page is one item, "why not today". */
export const SOUNDBITE_ITEM = "soundbites"

/**
 * The take pattern's options the page picks (`@some-ui/voice-capture`):
 * - many beside each other, and at `SOUNDBITE_LIMIT` the next makes room
 *   (`make-room`): the store lets go the one home holds that the person
 *   picked, or the oldest, and refuses while home holds none (`displacedBy`);
 * - each played on its own, Redo and Let go as every screen has them (D2,
 *   D3: neither removes anything);
 * - the button counts down the minute (`clock: "left"`).
 */
export const SOUNDBITE_TAKES: TakePatternOptions = {
  takes: { per: "many", max: SOUNDBITE_LIMIT, full: "make-room" },
  limits: SOUNDBITE_TAKE_LIMITS,
  redo: "supersede",
  letGo: "set-aside",
  play: "each",
  clock: "left",
}

/**
 * The kept soundbites as the take pattern lists them: on home once home
 * holds one (audio and record both, `held`), on this phone until then. The
 * phone isn't told when home took them in, so not since when.
 */
export function patternTakes(
  kept: ReadonlyArray<Soundbite>,
  held: (id: string) => boolean
): Array<PatternTake> {
  return kept.map((bite) => ({
    id: bite.id,
    answers: SOUNDBITE_ITEM,
    durationMs: bite.durationMs,
    recordedAt: bite.recordedAt,
    standing: bite.standing ?? "current",
    kept: held(bite.id) ? { place: "home", since: null } : { place: "phone" },
  }))
}

/** Newest first: the order the page lists them in. */
export function byNewest(bites: ReadonlyArray<Soundbite>): Array<Soundbite> {
  return [...bites].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
}

/** Home holds none: what a caller the home link never told assumes. */
const NONE_HELD = (): boolean => false

/** Set aside first, then earlier, then current: the order room is made in. */
const LEAVES_FIRST: Readonly<
  Record<NonNullable<Soundbite["standing"]> | "current", number>
> = { "set-aside": 0, earlier: 1, current: 2 }

/**
 * The held ones in the order they make room: a soundbite let go (D3) before
 * one a Redo superseded (D2), before one still listed, and the oldest first
 * within each. `held` is asked with each one's standing, so one set aside
 * whose mark home is not safely owed is passed over (`./home-held`).
 */
function inLeavingOrder(
  kept: ReadonlyArray<Soundbite>,
  held: Held
): Array<Soundbite> {
  const rank = (bite: Soundbite): number =>
    LEAVES_FIRST[bite.standing ?? "current"]
  return byNewest(kept.filter((bite) => held(bite.id, bite.standing)))
    .reverse()
    .sort((a, b) => rank(a) - rank(b))
}

/**
 * Which kept soundbite the next one will replace, or null while there is
 * room, or while home holds none of them. Only one `held` says home holds
 * may be replaced: `choice` is the one the person picked, honoured while it
 * is still kept and held; otherwise the first of `inLeavingOrder`: one set
 * aside, then one superseded, then the oldest still listed.
 */
export function nextReplaced(
  kept: ReadonlyArray<Soundbite>,
  choice: string | null,
  held: Held = NONE_HELD,
  limit = SOUNDBITE_LIMIT
): Soundbite | null {
  if (kept.length < limit) return null
  const leaving = inLeavingOrder(kept, held)
  const chosen = leaving.find((bite) => bite.id === choice)
  return chosen ?? leaving[0] ?? null
}

/**
 * The ids a new soundbite displaces so that, with it, no more than `limit`
 * are kept: `nextReplaced` first, then the rest home holds in the same
 * order for as long as there are still too many (only after the limit was
 * lowered, or a write elsewhere raced this one). Null when home holds too
 * few to make room: the new one is then refused, and none goes.
 */
export function displacedBy(
  kept: ReadonlyArray<Soundbite>,
  choice: string | null,
  held: Held = NONE_HELD,
  limit = SOUNDBITE_LIMIT
): Array<string> | null {
  const excess = kept.length + 1 - limit
  if (excess <= 0) return []
  const first = nextReplaced(kept, choice, held, limit)
  if (first === null) return null
  const rest = inLeavingOrder(kept, held).filter((bite) => bite.id !== first.id)
  if (rest.length < excess - 1) return null
  return [first.id, ...rest.slice(0, excess - 1).map((bite) => bite.id)]
}

/** The longest a Build Journal episode's takes may run in total: six minutes. */
export const JOURNAL_BUDGET_MAX_MS = 360_000

/**
 * The most take audio the phone keeps for the Build Journal and Studio's
 * projects together: twice a full budget at the target bitrate, since the
 * recorder's rate is a target, not a promise.
 */
export const JOURNAL_TAKES_MAX_BYTES =
  2 * (JOURNAL_BUDGET_MAX_MS / 1_000) * (SOUNDBITE_BITS_PER_SECOND / 8)
