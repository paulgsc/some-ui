/**
 * A pool's draw (#3473, C1440): which of an episode's snacks a visit shows,
 * drawn fresh with Fisher-Yates from a set fixed when the site was built.
 * Pure, its random source the caller's: `Math.random` in the landing's
 * script (`enhance.ts`), a seeded one in a test.
 */

/**
 * `items` in an order drawn by `random` (Fisher-Yates): every order equally
 * likely when `random` is uniform on [0, 1). `random` is the caller's
 * (`Math.random` on the page, a seeded one in a test), so the draw is pure.
 */
export function shuffle<T>(
  items: ReadonlyArray<T>,
  random: () => number
): Array<T> {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    // A random() of 1, outside its range, still lands inside the array.
    const j = Math.min(i, Math.floor(random() * (i + 1)))
    const a = out[i]
    const b = out[j]
    if (a === undefined || b === undefined) continue
    out[i] = b
    out[j] = a
  }
  return out
}

/**
 * A visit's draw from a pool of `size` snacks (#3473): which `draw` of them
 * the page shows, by their places in the pool, in the order shown. Fresh
 * each visit, from a set fixed when the site was built.
 */
export function drawSnacks(
  size: number,
  draw: number,
  random: () => number
): ReadonlyArray<number> {
  return shuffle(
    Array.from({ length: size }, (_, i) => i),
    random
  ).slice(0, draw)
}
