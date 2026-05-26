/**
 *
 * Exposes window.__BOYO_DEBUG__ so Playwright (and humans) can inspect the
 * extension's live runtime state without poking at the DOM.
 *
 * Design principle from the architecture doc:
 *   "Your tests should not care how DOM looks. They should care whether
 *    the pipeline converged."
 *
 * This module is a pure side-effect registration. It holds a weak reference
 * to VideoManager via a callback interface so it cannot prevent GC and cannot
 * couple the debug layer to VideoManager's internals.
 *
 * Only active in development builds — tree-shaken in production via the
 * BOYO_DEBUG compile-time constant (Vite defines plugin).
 */

export type BoyoDebugSnapshot = {
  /** Monotonic counter — increments on every publish() call. */
  readonly tick: number

  /** VideoManager phase */
  readonly phase: "idle" | "running"

  /** Number of fully resolved, mounted video entries */
  readonly mounted: number

  /** Number of elements in the unresolved retry queue */
  readonly unresolved: number

  /** Per-video FSM state — keyed by videoId */
  readonly entries: ReadonlyMap<string, EntryDebugInfo>

  /** Timestamp of last mutation batch processed by the observer */
  readonly lastMutationMs: number | null

  /** Number of yt-navigate-finish events received this session */
  readonly navigations: number

  /** Current session counter value (opaque but comparable) */
  readonly sessionOrdinal: number
}

export type EntryDebugInfo = {
  readonly videoId: string
  readonly channelId: string
  readonly viewKind: "masked" | "meta" | "title" | "revealed" | "whitelisted"
  readonly isConnected: boolean
}

/** Interface that VideoManager must implement to be observable. */
export type DebugSource = {
  readonly phase: "idle" | "running"
  readonly size: number
  readonly unresolvedSize: number
  readonly sessionOrdinal: number
  readonly entryInfos: () => ReadonlyArray<EntryDebugInfo>
}

/** Global debug registry — singleton, module-scoped. */
let _source: DebugSource | null = null
let _tick = 0
let _lastMutationMs: number | null = null
let _navigations = 0

/**
 * Register a DebugSource (called by VideoManager on construction).
 * Safe to call multiple times — last registration wins.
 */
export function registerDebugSource(source: DebugSource): void {
  _source = source
  _publish()
}

/** Called by the observer on every mutation batch. */
export function notifyMutation(): void {
  _lastMutationMs = Date.now()
  _publish()
}

/** Called by the yt-navigate-finish listener. */
export function notifyNavigation(): void {
  _navigations++
  _publish()
}

/** Force a snapshot publish (e.g. after upsert/prune). */
export function publish(): void {
  _publish()
}

function _publish(): void {
  if (typeof window === "undefined") return

  const snap: BoyoDebugSnapshot = _source
    ? {
        tick: ++_tick,
        phase: _source.phase,
        mounted: _source.size,
        unresolved: _source.unresolvedSize,
        entries: new Map(_source.entryInfos().map((e) => [e.videoId, e])),
        lastMutationMs: _lastMutationMs,
        navigations: _navigations,
        sessionOrdinal: _source.sessionOrdinal,
      }
    : {
        tick: ++_tick,
        phase: "idle",
        mounted: 0,
        unresolved: 0,
        entries: new Map(),
        lastMutationMs: _lastMutationMs,
        navigations: _navigations,
        sessionOrdinal: 0,
      }

  // Expose as a plain object for Playwright's page.evaluate() to JSON-serialize
  ;(window as any).__BOYO_DEBUG__ = {
    tick: snap.tick,
    phase: snap.phase,
    mounted: snap.mounted,
    unresolved: snap.unresolved,
    entries: Object.fromEntries(snap.entries),
    lastMutationMs: snap.lastMutationMs,
    navigations: snap.navigations,
    sessionOrdinal: snap.sessionOrdinal,
  }
}
