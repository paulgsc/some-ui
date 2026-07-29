/**
 * The recorder — the facade every extension's observability adapter wraps.
 * Tier-1: it persists through a port, so it is safe in a background worker or
 * a page, and safe under test with {@link memoryPersistence}.
 *
 * Composition (the "flight recorder" arrangement):
 *
 *     record(event)
 *          │
 *          ├──► RingBuffer      bounded event timeline
 *          ├──► MetricsStore    counters + aggregates
 *          └──► snapshots       "what does the extension currently believe"
 *                    │
 *                    ├──► invariants ──► HealthReport
 *                    └──► export()   ──► DiagnosticsBundle (user-attachable)
 *
 * Three constraints shape every decision here:
 *
 *   1. **Nothing leaves the machine.** There is no network path in this module
 *      and none is intended. Diagnostics are exported by the user, explicitly.
 *   2. **Bounded footprint.** Fixed ring capacity, no metric labels, capped
 *      snapshot map, byte-budgeted persistence.
 *   3. **MV3 is lossy.** The worker can be killed at any instant, so state is
 *      rehydrated on construction and flushed on a short debounce, with
 *      `error`-severity events forcing an immediate write.
 */

import { runInvariants, scoreHealth } from "./invariants"
import { MetricsStore } from "./metrics"
import { memoryPersistence } from "./persistence"
import { RingBuffer } from "./ring-buffer"
import type {
  DiagnosticsBundle,
  HealthReport,
  Invariant,
  JsonValue,
  ObservabilityEvent,
  ObservabilityPersistence,
  PersistedState,
  Severity,
} from "./types"

export type RecorderOptions<Ctx> = {
  /** Workspace-scoped name; also the storage-key prefix on the debug page. */
  namespace: string
  /** Ring capacity. Default 500 — a few hours of a busy extension's decisions. */
  capacity?: number
  /** Debounce before a persistence write. Default 1000 ms. */
  flushIntervalMs?: number
  /** Cap on one event's serialized `detail`. Default 2 KB; overflow is elided. */
  maxDetailBytes?: number
  /** Cap on the snapshot map. Default 200 keys; oldest-written keys evicted. */
  maxSnapshots?: number
  /** Where to persist. Defaults to in-memory (i.e. nothing survives a restart). */
  persistence?: ObservabilityPersistence
  /** Consistency checks evaluated by {@link Recorder.health}. */
  invariants?: ReadonlyArray<Invariant<Ctx>>
  /** Injectable clock, for deterministic tests. */
  now?: () => number
  /**
   * Optional live echo, e.g. `console.debug`. Off by default: an always-on
   * console firehose is its own kind of bad citizenship. The adapter decides
   * whether a debug preference turns it on.
   */
  echo?: (event: ObservabilityEvent) => void
}

/** Fields an adapter supplies when recording. */
export type RecordInput<TKind extends string> = {
  kind: TKind
  severity?: Severity
  subject?: number | string
  detail?: JsonValue
}

export class Recorder<
  TKind extends string = string,
  TCounter extends string = string,
  TAggregate extends string = string,
  Ctx = void,
> {
  readonly namespace: string
  readonly metrics: MetricsStore<TCounter, TAggregate>

  // Events are written through `record`, whose input is typed to the adapter's
  // `TKind` union — that is where a typo is a real bug and where the union
  // earns its keep. On the read side they are plain string-kinded: a bundle
  // rehydrated from disk was written by some build of this extension, possibly
  // an older one, and disk cannot vouch for today's union. Widening here is
  // what lets hydration be honest instead of asserting a claim it cannot check.
  private readonly buffer: RingBuffer<ObservabilityEvent>
  private readonly persistence: ObservabilityPersistence
  private readonly invariants: ReadonlyArray<Invariant<Ctx>>
  private readonly now: () => number
  private readonly flushIntervalMs: number
  private readonly maxDetailBytes: number
  private readonly maxSnapshots: number
  private readonly echo?: (event: ObservabilityEvent) => void

  private snapshots = new Map<string, JsonValue>()
  private seq = 0
  private errorCount = 0
  private flushTimer: ReturnType<typeof setTimeout> | undefined
  private pendingFlush: Promise<void> | undefined
  private paused = false
  private disposed = false
  private hydrated = false

  constructor(options: RecorderOptions<Ctx>) {
    this.namespace = options.namespace
    this.buffer = new RingBuffer(options.capacity ?? 500)
    this.persistence = options.persistence ?? memoryPersistence()
    this.invariants = options.invariants ?? []
    this.now = options.now ?? ((): number => Date.now())
    this.flushIntervalMs = options.flushIntervalMs ?? 1000
    this.maxDetailBytes = options.maxDetailBytes ?? 2048
    this.maxSnapshots = options.maxSnapshots ?? 200
    this.echo = options.echo
    this.metrics = new MetricsStore<TCounter, TAggregate>()
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────
  //
  // Every subsystem that starts something must be able to stop it. The only
  // thing this one starts is a debounce timer, and `dispose` flushes it rather
  // than dropping the events it was holding.

  /**
   * Load persisted state. Call once, early in worker startup: an MV3 event
   * page is recycled constantly, and a recorder that starts empty on every
   * respawn measures the worker's lifetime instead of the extension's.
   *
   * ## Why this merges rather than replaces
   *
   * `hydrate` is asynchronous — it awaits a storage read — but recording is
   * not, and the worker does not wait. Module evaluation registers the event
   * listeners, and whatever those listeners fire during the read window (an
   * alarm that fired *and is what woke the page*, the startup sweep it kicks
   * off) records into a recorder that has not loaded yet.
   *
   * The previous implementation then did `buffer.clear()` and overwrote every
   * counter with the on-disk value, so all of it vanished. The visible symptom
   * was a timeline where a sweep's `tab.skipped` events appear with no
   * preceding `check.start`, and where a worker generation woken *by* an alarm
   * shows `worker.start` → `alarm.kept` and no `alarm.fired` — which then reads
   * downstream as a phantom "missed alarm" whose interval is a clean multiple
   * of the period. The scheduler was fine; the recorder was eating the proof.
   *
   * That window is the single most diagnostically valuable part of a worker's
   * life, so it is the one part that must not be dropped. Stored history is
   * folded in *underneath* what this generation has already seen: disk events
   * first, then live events re-sequenced to follow them.
   */
  async hydrate(): Promise<void> {
    if (this.hydrated || this.disposed) {
      return
    }
    this.hydrated = true
    const stored = await this.persistence.load()
    if (stored?.namespace !== this.namespace) {
      // Absent, or written by a different workspace sharing the storage area.
      return
    }

    // Everything recorded while the load above was in flight.
    const live = this.buffer.toArray()
    const liveMetrics = this.metrics.snapshot()

    const events = stored.events.filter(isEventShape)
    const restored = RingBuffer.from(
      this.buffer.capacity,
      events,
      stored.dropped
    )
    this.buffer.clear()
    this.buffer.extend(restored.toArray())

    this.metrics.reset()
    this.metrics.hydrate(stored.metrics)
    this.metrics.merge(liveMetrics)

    // Stored snapshots must not clobber a fresher value this generation already
    // published — `alarm:lastFire` written by the very alarm that woke us is
    // newer than the one on disk by definition.
    for (const [key, value] of Object.entries(stored.snapshots)) {
      if (!this.snapshots.has(key)) {
        this.snapshots.set(key, value)
      }
    }

    this.seq = events.reduce((max, e) => Math.max(max, e.seq), 0)
    for (const event of live) {
      this.seq += 1
      this.buffer.push({ ...event, seq: this.seq })
    }
    this.errorCount =
      events.filter((e) => e.severity === "error").length +
      live.filter((e) => e.severity === "error").length
  }

  /** Stop recording without losing what is already held. */
  pause(): void {
    this.paused = true
  }

  resume(): void {
    if (!this.disposed) {
      this.paused = false
    }
  }

  /** Cancel the debounce timer and write out whatever it was holding. */
  async dispose(): Promise<void> {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.paused = true
    this.cancelTimer()
    await this.flush()
  }

  // ── Recording ───────────────────────────────────────────────────────────

  /** Record one event. Never throws; observability must not break the subject. */
  record(input: RecordInput<TKind>): void {
    if (this.paused || this.disposed) {
      return
    }
    const severity = input.severity ?? "info"
    this.seq += 1
    const event: ObservabilityEvent = {
      seq: this.seq,
      t: this.now(),
      kind: input.kind,
      severity,
      ...(input.subject === undefined ? {} : { subject: input.subject }),
      ...(input.detail === undefined
        ? {}
        : { detail: clamp(input.detail, this.maxDetailBytes) }),
    }
    this.buffer.push(event)
    if (severity === "error") {
      this.errorCount += 1
    }
    this.echo?.(event)
    // An error is exactly the event most likely to be followed by the worker
    // dying, so it does not get to wait out a debounce window.
    if (severity === "error") {
      void this.flush()
    } else {
      this.scheduleFlush()
    }
  }

  /** Increment a counter. Sugar over `recorder.metrics.increment`. */
  count(name: TCounter, by = 1): void {
    if (this.paused || this.disposed) {
      return
    }
    this.metrics.increment(name, by)
    this.scheduleFlush()
  }

  /** Fold one numeric observation (a latency, a duration) into an aggregate. */
  observe(name: TAggregate, value: number): void {
    if (this.paused || this.disposed) {
      return
    }
    this.metrics.observe(name, value)
    this.scheduleFlush()
  }

  /**
   * Publish "what the extension currently believes" about one subject. Events
   * say what happened; snapshots say what state that left behind — which is
   * the question a user's "this tab never woke up" actually asks.
   */
  setSnapshot(key: string, value: JsonValue): void {
    if (this.paused || this.disposed) {
      return
    }
    // Re-insert so the map's insertion order tracks recency for eviction.
    this.snapshots.delete(key)
    this.snapshots.set(key, clamp(value, this.maxDetailBytes))
    while (this.snapshots.size > this.maxSnapshots) {
      const oldest = this.snapshots.keys().next()
      if (oldest.done === true) {
        break
      }
      this.snapshots.delete(oldest.value)
    }
    this.scheduleFlush()
  }

  deleteSnapshot(key: string): void {
    if (this.snapshots.delete(key)) {
      this.scheduleFlush()
    }
  }

  // ── Reading ─────────────────────────────────────────────────────────────

  /** The timeline, oldest first. */
  events(): Array<ObservabilityEvent> {
    return this.buffer.toArray()
  }

  /** Events evicted by the ring buffer since install. */
  get dropped(): number {
    return this.buffer.dropped
  }

  snapshotEntries(): Record<string, JsonValue> {
    return Object.fromEntries(this.snapshots)
  }

  /** Run every invariant and score the result. */
  async health(ctx: Ctx): Promise<HealthReport> {
    const t = this.now()
    const results = await runInvariants(this.invariants, ctx, t)
    const recentErrors = this.buffer
      .toArray()
      .filter((e) => e.severity === "error").length
    const { score, status } = scoreHealth(results, recentErrors)
    return {
      score,
      status,
      invariants: results,
      recentErrors,
      generatedAt: t,
    }
  }

  /**
   * The user-attachable bundle. `runtime`/`extension` are supplied by the
   * caller rather than read here, because this module must stay usable from a
   * page, a worker, and a test without branching on which globals exist.
   */
  async export(
    ctx: Ctx,
    meta: {
      extension: { name: string; version: string }
      runtime: { userAgent: string; platform?: string }
    }
  ): Promise<DiagnosticsBundle> {
    return {
      version: 1,
      namespace: this.namespace,
      generatedAt: this.now(),
      extension: meta.extension,
      runtime: meta.runtime,
      health: await this.health(ctx),
      metrics: this.metrics.snapshot(),
      snapshots: this.snapshotEntries(),
      events: this.events(),
      dropped: this.buffer.dropped,
    }
  }

  // ── Persistence ─────────────────────────────────────────────────────────

  /** Write current state through the port immediately. */
  flush(): Promise<void> {
    this.cancelTimer()
    const state: PersistedState = {
      version: 1,
      namespace: this.namespace,
      events: this.buffer.toArray(),
      metrics: this.metrics.snapshot(),
      snapshots: this.snapshotEntries(),
      dropped: this.buffer.dropped,
      updatedAt: this.now(),
    }
    this.pendingFlush = this.persistence.save(state)
    return this.pendingFlush
  }

  /** Reset everything, on disk and in memory. The debug page's "clear". */
  async clear(): Promise<void> {
    this.cancelTimer()
    this.buffer.clear()
    this.metrics.reset()
    this.snapshots.clear()
    this.errorCount = 0
    this.seq = 0
    await this.persistence.clear()
  }

  /** Total `error`-severity events recorded this generation (pre-eviction). */
  get errors(): number {
    return this.errorCount
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== undefined || this.disposed) {
      return
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined
      void this.flush()
    }, this.flushIntervalMs)
  }

  private cancelTimer(): void {
    if (this.flushTimer !== undefined) {
      clearTimeout(this.flushTimer)
      this.flushTimer = undefined
    }
  }
}

/**
 * Bound one `detail` payload's serialized size. An adapter that accidentally
 * records a whole DOM string should cost one elided event, not the buffer.
 */
function clamp(value: JsonValue, maxBytes: number): JsonValue {
  let serialized: string
  try {
    serialized = JSON.stringify(value)
  } catch {
    return "[unserializable]"
  }
  if (serialized.length <= maxBytes) {
    return value
  }
  return `${serialized.slice(0, maxBytes)}…[truncated ${serialized.length - maxBytes} chars]`
}

function isEventShape(value: unknown): value is ObservabilityEvent {
  if (value === null || typeof value !== "object") {
    return false
  }
  return (
    typeof Reflect.get(value, "seq") === "number" &&
    typeof Reflect.get(value, "t") === "number" &&
    typeof Reflect.get(value, "kind") === "string"
  )
}
