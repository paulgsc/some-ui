/**
 *
 * Tab-centric FSM. Each state is the complete render specification —
 * the view is a pure function of PopupState with zero implicit state.
 *
 * Invariants:
 *   - No state holds data that isn't needed to render it.
 *   - Transitions never mutate; they return new state.
 *   - Error states always carry a message. Partial errors carry both
 *     the partial result and the error so the view can show both.
 */

import type { TabSummary } from "@schedule/shared/types"

// ── State ─────────────────────────────────────────────────────────────────

export type SyncResult = {
  upserted: number
  failed: number
  // tab_ids that errored during extraction (not network failures)
  error_tab_ids: Array<number>
}

export type ReconcileResult = {
  absent_tab_ids: Array<number>
  absent_summaries: Array<TabSummary> // resolved from absent ids
}

export type PopupState =
  // Startup: waiting for background status reply.
  | { kind: "INIT" }

  // Nominal idle. Exposes lightweight DB state for ambient awareness.
  | {
      kind: "IDLE"
      tab_count: number // total tabs currently open in browser
      db_count: number // rows currently in tabs table
      last_synced_at: string | null
    }

  // Batch upsert in flight. Progress is per-tab, not per-request.
  | {
      kind: "SYNCING"
      completed: number
      total: number
    }

  // Upsert settled. May have partial failures (extraction errors on
  // individual tabs are not fatal — they are recorded, not thrown).
  | {
      kind: "SYNC_DONE"
      result: SyncResult
      db_count: number
    }

  // Network / server error during the POST /tabs/batch call itself.
  | {
      kind: "SYNC_FAILED"
      error: string
      // Preserve what we know so the user isn't flying blind.
      completed_before_failure: number
    }

  // Reconcile: asking server for tab_ids in DB not seen in current session.
  | { kind: "RECONCILING" }

  // Server returned absent ids. User reviews before confirming delete.
  | {
      kind: "RECONCILE_REVIEW"
      result: ReconcileResult
    }

  // Batch delete of absent tabs in flight.
  | {
      kind: "RECONCILE_DELETING"
      tab_ids: Array<number>
    }

  // Pipeline trigger in flight.
  | { kind: "TRIGGERING_PIPELINE" }

  // Pipeline trigger acknowledged by server.
  | {
      kind: "PIPELINE_QUEUED"
      // How many tabs were in the DB when we triggered.
      db_count: number
    }

  // Pipeline trigger failed.
  | {
      kind: "PIPELINE_TRIGGER_FAILED"
      error: string
    }

  // Pruning stale tabs (maintenance).
  | { kind: "PRUNING" }
  | {
      kind: "PRUNE_DONE"
      pruned_count: number
      db_count: number
    }

  // Terminal error requiring dismiss.
  | { kind: "ERROR"; message: string }

// ── Initial ───────────────────────────────────────────────────────────────

export const INIT_STATE: PopupState = { kind: "INIT" }

// ── Transitions ───────────────────────────────────────────────────────────

export function onStatusReceived(
  _prev: PopupState,
  tab_count: number,
  db_count: number,
  last_synced_at: string | null
): PopupState {
  return { kind: "IDLE", tab_count, db_count, last_synced_at }
}

export function onStatusError(_prev: PopupState, error: string): PopupState {
  return { kind: "ERROR", message: `background unreachable: ${error}` }
}

// Sync flow
export function onSyncTriggered(_prev: PopupState): PopupState {
  return { kind: "SYNCING", completed: 0, total: 0 }
}

export function onSyncProgress(
  prev: PopupState,
  completed: number,
  total: number
): PopupState {
  if (prev.kind !== "SYNCING") return prev
  return { kind: "SYNCING", completed, total }
}

export function onSyncDone(
  _prev: PopupState,
  result: SyncResult,
  db_count: number
): PopupState {
  return { kind: "SYNC_DONE", result, db_count }
}

export function onSyncFailed(prev: PopupState, error: string): PopupState {
  const completed_before_failure = prev.kind === "SYNCING" ? prev.completed : 0
  return { kind: "SYNC_FAILED", error, completed_before_failure }
}

// Reconcile flow
export function onReconcileTriggered(_prev: PopupState): PopupState {
  return { kind: "RECONCILING" }
}

export function onReconcileResult(
  _prev: PopupState,
  result: ReconcileResult
): PopupState {
  // If nothing is absent, skip review and go back to IDLE.
  if (result.absent_tab_ids.length === 0) {
    return { kind: "RECONCILE_REVIEW", result }
  }
  return { kind: "RECONCILE_REVIEW", result }
}

export function onReconcileDeleteConfirmed(
  prev: PopupState,
  tab_ids: Array<number>
): PopupState {
  if (prev.kind !== "RECONCILE_REVIEW") return prev
  return { kind: "RECONCILE_DELETING", tab_ids }
}

export function onReconcileDeleteDone(
  _prev: PopupState,
  tab_count: number,
  db_count: number,
  last_synced_at: string | null
): PopupState {
  return { kind: "IDLE", tab_count, db_count, last_synced_at }
}

export function onReconcileError(_prev: PopupState, error: string): PopupState {
  return { kind: "ERROR", message: `reconcile failed: ${error}` }
}

// Pipeline flow
export function onPipelineTriggered(_prev: PopupState): PopupState {
  return { kind: "TRIGGERING_PIPELINE" }
}

export function onPipelineQueued(
  _prev: PopupState,
  db_count: number
): PopupState {
  return { kind: "PIPELINE_QUEUED", db_count }
}

export function onPipelineFailed(_prev: PopupState, error: string): PopupState {
  return { kind: "PIPELINE_TRIGGER_FAILED", error }
}

// Prune flow
export function onPruneTriggered(_prev: PopupState): PopupState {
  return { kind: "PRUNING" }
}

export function onPruneDone(
  _prev: PopupState,
  pruned_count: number,
  db_count: number
): PopupState {
  return { kind: "PRUNE_DONE", pruned_count, db_count }
}

// Dismiss / reset back to IDLE from terminal/done states
export function onDismiss(
  prev: PopupState,
  tab_count: number,
  db_count: number,
  last_synced_at: string | null
): PopupState {
  switch (prev.kind) {
    case "SYNC_DONE":
    case "SYNC_FAILED":
    case "PIPELINE_QUEUED":
    case "PIPELINE_TRIGGER_FAILED":
    case "PRUNE_DONE":
    case "RECONCILE_REVIEW":
    case "ERROR": {
      return { kind: "IDLE", tab_count, db_count, last_synced_at }
    }
    default: {
      return prev
    }
  }
}
