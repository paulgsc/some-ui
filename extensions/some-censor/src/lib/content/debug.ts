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

import type { BoyoDebugSnapshot, BoyoDebugSnapshotWire, EntryDebugInfo } from "@censor/types/debug"

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

  const entriesArray =
    _source?.entryInfos().map((e) => [e.videoId, e] as const) ?? []
  const map = new Map(entriesArray)
  const wireEntries = Object.fromEntries(entriesArray)

  const snap: BoyoDebugSnapshot = _source
    ? {
        tick: ++_tick,
        phase: _source.phase,
        mounted: _source.size,
        unresolved: _source.unresolvedSize,
        entries: map,
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

  const snapObj: BoyoDebugSnapshotWire = {
    tick: snap.tick,
    phase: snap.phase,
    mounted: snap.mounted,
    unresolved: snap.unresolved,
    entries: wireEntries,
    lastMutationMs: snap.lastMutationMs,
    navigations: snap.navigations,
    sessionOrdinal: snap.sessionOrdinal,
  }
  // Expose as a plain object for Playwright's page.evaluate() to JSON-serialize
  window.__BOYO_DEBUG__ = snapObj

  // Bridge to main world so page.evaluate() can read it
  document.dispatchEvent(
    new CustomEvent("__boyo_debug_update__", {
      detail: JSON.stringify(snapObj),
    })
  )
}
