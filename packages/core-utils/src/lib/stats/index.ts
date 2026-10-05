/**
 * Order statistics over plain numbers. Each returns `null` for no values,
 * so a caller states its own fallback (`?? 0`, a dash) instead of inheriting
 * one that reads as a real measurement.
 */

/** Linear-interpolated quantile of an already-sorted (ascending) array. */
export function quantile(
  sorted: ReadonlyArray<number>,
  fraction: number
): number | null {
  if (sorted.length === 0) return null
  const position = (sorted.length - 1) * fraction
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  const low = sorted[lower] ?? 0
  const high = sorted[upper] ?? low
  return low + (high - low) * (position - lower)
}

/** The middle value, or the mean of the middle two. */
export function median(values: ReadonlyArray<number>): number | null {
  return quantile(
    [...values].sort((a, b) => a - b),
    0.5
  )
}
