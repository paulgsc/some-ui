/**
 * `@some-extension/common/observability` — the workspace's shared flight
 * recorder.
 *
 * ## Why this is a shared package rather than one extension's module
 *
 * Every extension in this repo has the same reliability question ("is it
 * actually doing the thing, months into real-world use?") and the same two
 * constraints: it must answer that question **without shipping data off the
 * machine** (AMO's privacy posture, and ours), and **without unbounded storage
 * growth**. Those constraints are identical everywhere, so the machinery is
 * hoisted here and each extension supplies only what is genuinely its own:
 *
 *     Extension-specific (the adapter)      Shared (this package)
 *     ────────────────────────────────      ─────────────────────
 *     event-kind union                      RingBuffer
 *     counter / aggregate names             MetricsStore
 *     invariants + their context            invariant runner, health scoring
 *     what to record, and where             Recorder, persistence ports
 *
 * An adapter is a few dozen lines: declare the unions, list the invariants,
 * construct a {@link Recorder}. See `suspender-ledger/src/worker/core/
 * observability.ts` for the reference implementation.
 *
 * ## Observability, not telemetry
 *
 * Telemetry implies data leaving the machine. Nothing here has a network path.
 * The extension explains itself locally; the user exports a bundle by hand if
 * and when they choose to file a bug.
 */

export { RingBuffer } from "./ring-buffer"
export { MetricsStore } from "./metrics"
export { runInvariants, scoreHealth } from "./invariants"
export {
  extensionStoragePersistence,
  memoryPersistence,
  type ExtensionPersistenceOptions,
  type StorageAreaLike,
} from "./persistence"
export { Recorder, type RecordInput, type RecorderOptions } from "./recorder"
export type {
  Aggregate,
  DiagnosticsBundle,
  HealthReport,
  Invariant,
  InvariantOutcome,
  InvariantResult,
  JsonValue,
  MetricsSnapshot,
  ObservabilityEvent,
  ObservabilityPersistence,
  PersistedState,
  Severity,
} from "./types"
