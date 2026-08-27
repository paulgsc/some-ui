/**
 * The package's one deterministic permutation.
 *
 * Extracted from `exercises/scheduling.ts` (LTY-PICKER, `docs/leetype
 * /README.md`, removed once the picker replaced the random schedule it drove),
 * which held this privately until a second caller needed the same guarantee —
 * `reading-probe`, whose distractor ordering has to be replayable from a
 * session seed for the same reason a session's old exercise order did: a run
 * reported in a bug, pinned in a test or mounted in a story must produce the
 * same screen twice. `reading-probe` is this module's one caller now.
 *
 * Specified here rather than delegated to `Math.random` for that replay
 * property, and kept as one implementation rather than two because two
 * xorshift32s in one package is two things that can silently disagree about
 * what "seed 7" means.
 */

/** The substitute state for a zero seed — xorshift32 cannot leave zero. */
const NONZERO_STATE = 0x6d2b79f5

/**
 * A `() => number` yielding uniformly distributed unsigned 32-bit values.
 *
 * xorshift32: three shifts and three xors, no multiply, no table. It is not
 * cryptographic and is not meant to be — the property being bought is
 * reproducibility, not unpredictability.
 *
 * Private to this module. Every caller so far wants a permutation rather than
 * a stream, and `shuffledBySeed` below is the one correct way to get one from
 * this; exporting the raw generator would invite a second, subtly-biased
 * shuffle written at a call site. Export it when something genuinely needs a
 * stream, and not before.
 */
function randomValues(seed: number): () => number {
  let state = seed | 0 || NONZERO_STATE
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return state >>> 0
  }
}

/**
 * A Fisher–Yates shuffle driven by `randomValues`, returning a new array.
 *
 * Kept as a named export rather than folded back into its one remaining
 * caller: `exercises/scheduling.ts` used to want "this list, deterministically
 * permuted" too, and a shuffle inlined into `reading-probe` alone would have
 * to be un-inlined again the day a second caller needs the same guarantee —
 * exactly what happened once already.
 */
export function shuffledBySeed<T>(
  items: ReadonlyArray<T>,
  seed: number
): Array<T> {
  const order = [...items]
  const random = randomValues(seed)
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swapWith = random() % (index + 1)
    const current = order[index]!
    order[index] = order[swapWith]!
    order[swapWith] = current
  }
  return order
}
