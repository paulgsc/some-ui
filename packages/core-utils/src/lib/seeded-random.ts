/**
 * The repo's one deterministic randomness: a permutation or a draw that a
 * seed replays exactly, so a run reported in a bug, pinned in a test or
 * mounted in a story produces the same screen twice. One implementation, so
 * "seed 7" means one thing everywhere.
 */

/** The substitute state for a zero seed — xorshift32 cannot leave zero. */
const NONZERO_STATE = 0x6d2b79f5

/**
 * A `() => number` yielding uniformly distributed unsigned 32-bit values.
 *
 * xorshift32: not cryptographic, and not meant to be — the property bought
 * is reproducibility. Private: callers want a permutation or one draw, and
 * exporting the raw generator would invite a subtly-biased shuffle written
 * at a call site.
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

/** A Fisher–Yates shuffle driven by `randomValues`, returning a new array. */
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

/**
 * fmix32, MurmurHash3's finalizer: an avalanche over the seed's bits, so two
 * seeds differing in one bit start xorshift32 from unrelated states. Without
 * it a small seed yields a tiny first output (seed `1` gives about `6e-5` of
 * the range), which a permutation tolerates and a single draw does not.
 */
function mixed(seed: number): number {
  let hash = seed >>> 0
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b)
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35)
  return (hash ^ (hash >>> 16)) >>> 0
}

/**
 * One uniform draw in `[0, 1)` from `seed`, for a weighted choice: reading
 * the first element of a shuffled list would be the biased shuffle the note
 * on `randomValues` warns about, in reverse. The seed is mixed first because
 * only the first output is read.
 */
export function unitIntervalBySeed(seed: number): number {
  return randomValues(mixed(seed))() / 2 ** 32
}

/**
 * FNV-1a over UTF-16 code units, 32 bits: a seed from a string key, or, from
 * another offset basis, a second independent hash of the same text.
 */
export function fnv1a(text: string, basis = 0x811c9dc5): number {
  let hash = basis >>> 0
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0
  }
  return hash
}
