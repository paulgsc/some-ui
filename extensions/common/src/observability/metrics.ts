/**
 * Counters and numeric aggregates — tier-0 (pure, no browser globals).
 *
 * Borrowed from Prometheus in spirit, not in shape. Two deliberate omissions
 * keep this bounded on a user's disk:
 *
 *   - **No labels.** A counter is a name, not a name plus a cardinality
 *     explosion. Per-tab or per-host breakdowns belong in the event timeline,
 *     which is ring-buffered; a labelled counter map is not.
 *   - **No histogram buckets.** An {@link Aggregate} is five numbers
 *     (count/sum/min/max/last). That answers "is suspend latency drifting?"
 *     without storing a distribution per metric forever.
 *
 * Names are typed by the adapting extension, so a typo is a compile error
 * rather than a silently orphaned metric.
 */

import type { Aggregate, MetricsSnapshot } from "./types"

export class MetricsStore<
  TCounter extends string = string,
  TAggregate extends string = string,
> {
  // Keyed by plain string, written and read only through the typed methods
  // below. Persisted snapshots arrive string-keyed, and narrowing them back to
  // the name unions would need a cast that proves nothing.
  private counters = new Map<string, number>()
  private aggregates = new Map<string, Aggregate>()

  /** Add to a monotonic counter (`by` may be >1 for batch outcomes). */
  increment(name: TCounter, by = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + by)
  }

  /** Read one counter without materializing the whole snapshot. */
  counter(name: TCounter): number {
    return this.counters.get(name) ?? 0
  }

  /** Fold one observation into a named aggregate. Non-finite values are ignored. */
  observe(name: TAggregate, value: number): void {
    if (!Number.isFinite(value)) {
      return
    }
    const prior = this.aggregates.get(name)
    if (!prior) {
      this.aggregates.set(name, {
        count: 1,
        sum: value,
        min: value,
        max: value,
        last: value,
      })
      return
    }
    this.aggregates.set(name, {
      count: prior.count + 1,
      sum: prior.sum + value,
      min: Math.min(prior.min, value),
      max: Math.max(prior.max, value),
      last: value,
    })
  }

  /** Read one aggregate, or undefined if nothing has been observed yet. */
  aggregate(name: TAggregate): Aggregate | undefined {
    const found = this.aggregates.get(name)
    return found ? { ...found } : undefined
  }

  /** Serializable readout of every counter and aggregate. */
  snapshot(): MetricsSnapshot {
    const counters: Record<string, number> = {}
    for (const [name, value] of this.counters) {
      counters[name] = value
    }
    const aggregates: Record<string, Aggregate> = {}
    for (const [name, value] of this.aggregates) {
      aggregates[name] = { ...value }
    }
    return { counters, aggregates }
  }

  /**
   * Restore from a persisted snapshot. Used once per worker generation: MV3
   * event pages are recycled constantly, and counters that reset on every
   * respawn would measure the worker's lifetime rather than the extension's.
   */
  hydrate(snapshot: MetricsSnapshot | undefined): void {
    if (!snapshot) {
      return
    }
    for (const [name, value] of Object.entries(snapshot.counters)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        this.counters.set(name, value)
      }
    }
    for (const [name, value] of Object.entries(snapshot.aggregates)) {
      if (isAggregate(value)) {
        this.aggregates.set(name, { ...value })
      }
    }
  }

  /**
   * Fold a snapshot into what is already held, rather than replacing it.
   *
   * The difference from {@link hydrate} is load-bearing during startup. An MV3
   * worker records before `hydrate()`'s storage read resolves — the alarm
   * listener and the startup sweep both run in that window — and those counts
   * are real. Overwriting them with the on-disk value silently deletes exactly
   * the evidence the startup window exists to produce.
   */
  merge(snapshot: MetricsSnapshot | undefined): void {
    if (!snapshot) {
      return
    }
    for (const [name, value] of Object.entries(snapshot.counters)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        this.counters.set(name, (this.counters.get(name) ?? 0) + value)
      }
    }
    for (const [name, value] of Object.entries(snapshot.aggregates)) {
      if (!isAggregate(value)) {
        continue
      }
      const prior = this.aggregates.get(name)
      if (!prior) {
        this.aggregates.set(name, { ...value })
        continue
      }
      this.aggregates.set(name, {
        count: prior.count + value.count,
        sum: prior.sum + value.sum,
        min: Math.min(prior.min, value.min),
        max: Math.max(prior.max, value.max),
        // `prior` is the newer of the two: merge folds a just-loaded historical
        // snapshot into counts taken moments ago, so the in-memory `last` is
        // the more recent observation.
        last: prior.last,
      })
    }
  }

  /** Zero everything — the debug page's "reset counters" action. */
  reset(): void {
    this.counters.clear()
    this.aggregates.clear()
  }
}

function isAggregate(value: unknown): value is Aggregate {
  if (value === null || typeof value !== "object") {
    return false
  }
  const fields: Array<keyof Aggregate> = ["count", "sum", "min", "max", "last"]
  return fields.every((f) => typeof Reflect.get(value, f) === "number")
}
