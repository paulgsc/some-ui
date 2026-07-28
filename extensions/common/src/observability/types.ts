/**
 * Shared observability vocabulary — tier-0 (pure types, no browser globals).
 *
 * This subsystem is deliberately **observability**, not telemetry: nothing here
 * ever leaves the machine. Every primitive is bounded (ring buffer, fixed
 * counter set, capped snapshot map) so a long-lived extension cannot grow its
 * `storage.local` footprint without limit — the constraint that makes this
 * pattern safe to ship on an AMO-signed extension.
 *
 * Extensions do not use these types directly; they instantiate a
 * {@link "./recorder".Recorder} with their own event-kind union, counter names
 * and invariants. That is the whole adapter seam: the core knows about
 * *shapes*, the extension knows about *meanings*.
 */

/** JSON the recorder is willing to persist. Structurally serializable only. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | Array<JsonValue>
  | { [key: string]: JsonValue }

/** How loud an event is. `error` forces an immediate persistence flush. */
export type Severity = "debug" | "info" | "warn" | "error"

/**
 * One recorded event. `TKind` is supplied by the adapting extension as a string
 * union, which is what makes the timeline greppable and the debug page able to
 * filter without stringly-typed guesswork.
 */
export type ObservabilityEvent<TKind extends string = string> = {
  /** Monotonic within one worker generation; resets when the worker respawns. */
  seq: number
  /** Epoch milliseconds. */
  t: number
  kind: TKind
  severity: Severity
  /**
   * What the event is about — a tab id, a request id, an alarm name. Optional
   * because plenty of events are about the extension as a whole.
   */
  subject?: number | string
  /** Bounded, JSON-serializable payload. Large values are clamped on record. */
  detail?: JsonValue
}

/** Aggregated form of an observed numeric series (no buckets — storage creep). */
export type Aggregate = {
  count: number
  sum: number
  min: number
  max: number
  /** Most recent observation, which is usually the one being debugged. */
  last: number
}

/**
 * Point-in-time metric readout.
 *
 * Keys are plain strings rather than the store's name unions on purpose: a
 * snapshot is a serialization artifact — it round-trips through storage and is
 * rendered by a debug page that iterates it — so a union here would buy nothing
 * and force a cast at every boundary. The typing that matters is on
 * `MetricsStore`'s write and read methods, where a typo is a real bug.
 */
export type MetricsSnapshot = {
  counters: Record<string, number>
  aggregates: Record<string, Aggregate>
}

/** The result of evaluating one invariant. */
export type InvariantOutcome =
  | { ok: true }
  | { ok: false; details: JsonValue }
  /**
   * The invariant could not be evaluated (a browser API was unavailable, state
   * had not hydrated yet). Distinct from a violation on purpose: an unknown
   * must never be reported to the user as a failure.
   */
  | { ok: "unknown"; details?: JsonValue }

/**
 * A consistency check over some caller-supplied context. Invariants are pure
 * with respect to `Ctx` — gathering the context is the caller's job, so the
 * checks themselves stay testable without any browser mock.
 */
export type Invariant<Ctx> = {
  name: string
  /** Human-readable statement of what must hold, shown on the debug page. */
  description: string
  check(ctx: Ctx): InvariantOutcome | Promise<InvariantOutcome>
}

/** One invariant's evaluation, as rendered on the debug page. */
export type InvariantResult = {
  name: string
  description: string
  status: "ok" | "violated" | "unknown"
  details?: JsonValue
  /** Epoch ms the check ran. */
  t: number
}

/**
 * The extension's own answer to "am I working?" — computed locally from
 * invariants and recent error events, never from a remote service.
 */
export type HealthReport = {
  /** 0–100. 100 = every invariant holds and nothing recently errored. */
  score: number
  status: "healthy" | "degraded" | "unhealthy"
  invariants: Array<InvariantResult>
  /** Count of `error`-severity events still inside the ring buffer. */
  recentErrors: number
  generatedAt: number
}

/**
 * Everything the recorder persists. Kept flat and versioned so a schema change
 * can be detected and discarded rather than mis-parsed.
 */
export type PersistedState<TKind extends string = string> = {
  version: 1
  namespace: string
  events: Array<ObservabilityEvent<TKind>>
  metrics: MetricsSnapshot
  snapshots: Record<string, JsonValue>
  /** Events evicted by the ring buffer since install — the creep counter. */
  dropped: number
  updatedAt: number
}

/**
 * The user-exportable diagnostics bundle: what someone attaches to a GitHub
 * issue instead of describing the bug in prose. Contains no browsing content
 * beyond what the adapter chose to record.
 */
export type DiagnosticsBundle<TKind extends string = string> = {
  version: 1
  namespace: string
  generatedAt: number
  extension: { name: string; version: string }
  runtime: { userAgent: string; platform?: string }
  health: HealthReport
  metrics: MetricsSnapshot
  snapshots: Record<string, JsonValue>
  events: Array<ObservabilityEvent<TKind>>
  dropped: number
}

/**
 * Where persisted state lives. The core never touches `browser.storage`
 * itself — an extension can back this with session storage, IndexedDB, or a
 * plain in-memory object under test.
 */
export type ObservabilityPersistence = {
  load(): Promise<PersistedState | undefined>
  save(state: PersistedState): Promise<void>
  clear(): Promise<void>
}
