/**
 * A deterministic shuffle: the order the drama's options (`core/probe`) and
 * the read-aloud sets are shown in, the same on every render.
 */

/** FNV-1a: a small, stable string hash for seeding. */
function hashSeed(key: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** mulberry32 */
function random(seed: number): () => number {
  let state = seed
  return (): number => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: Array<T>, next: () => number): Array<T> {
  // Decorate-sort-undecorate: a shuffle with no index juggling to type.
  return items
    .map((item) => ({ item, key: next() }))
    .sort((a, b) => a.key - b.key)
    .map(({ item }) => item)
}

/** A deterministic shuffle: the same key always yields the same order. */
export function seededShuffle<T>(items: Array<T>, seedKey: string): Array<T> {
  return shuffle(items, random(hashSeed(seedKey)))
}
