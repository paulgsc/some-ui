/**
 * Fixed-capacity ring buffer — tier-0 (pure, no browser globals).
 *
 * The flight recorder's storage primitive. Capacity is fixed at construction
 * and never grows: once full, the oldest entry is overwritten. That is the
 * whole point — an extension that runs for months must have a *constant* upper
 * bound on what it keeps, both in memory and in `storage.local`.
 *
 * `dropped` is exposed rather than hidden because "how much history did I lose
 * before the bug reproduced?" is a real question when reading a timeline.
 */
export class RingBuffer<T> {
  readonly capacity: number

  /** Backing store. Physical order; {@link toArray} restores logical order. */
  private items: Array<T> = []
  /** Index of the next write. */
  private cursor = 0
  private evicted = 0

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(
        `RingBuffer capacity must be a positive integer, got ${String(capacity)}`
      )
    }
    this.capacity = capacity
  }

  /** Number of entries currently held (≤ capacity). */
  get size(): number {
    return this.items.length
  }

  /** Total entries overwritten since construction. */
  get dropped(): number {
    return this.evicted
  }

  /** Append one entry, evicting the oldest when at capacity. */
  push(item: T): void {
    if (this.items.length < this.capacity) {
      this.items.push(item)
      this.cursor = this.items.length % this.capacity
      return
    }
    this.items[this.cursor] = item
    this.cursor = (this.cursor + 1) % this.capacity
    this.evicted += 1
  }

  /** Append many entries in order. */
  extend(items: Iterable<T>): void {
    for (const item of items) {
      this.push(item)
    }
  }

  /** Entries in insertion order, oldest first. Always a fresh array. */
  toArray(): Array<T> {
    if (this.items.length < this.capacity) {
      return [...this.items]
    }
    return [
      ...this.items.slice(this.cursor),
      ...this.items.slice(0, this.cursor),
    ]
  }

  /** The `n` most recent entries, oldest first. */
  tail(n: number): Array<T> {
    if (n <= 0) {
      return []
    }
    const all = this.toArray()
    return all.slice(Math.max(0, all.length - n))
  }

  /** Drop every entry. The eviction counter is preserved deliberately. */
  clear(): void {
    this.items = []
    this.cursor = 0
  }

  /**
   * Rebuild a buffer from persisted entries. Entries beyond `capacity` are
   * discarded oldest-first and counted as dropped, so a capacity *reduction*
   * between versions shrinks the footprint immediately instead of on the next
   * few hundred writes.
   */
  static from<T>(
    capacity: number,
    items: ReadonlyArray<T>,
    dropped = 0
  ): RingBuffer<T> {
    const buffer = new RingBuffer<T>(capacity)
    const overflow = Math.max(0, items.length - capacity)
    buffer.extend(items.slice(overflow))
    buffer.evicted = dropped + overflow
    return buffer
  }
}
