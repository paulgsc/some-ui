/**
 * Pure finite state machine for the popup.
 * No DOM. No side effects.
 *
 * States
 * ──────
 *  INIT                  Awaiting GET_CAPTURE_STATUS reply.
 *  IDLE                  Ready. User can capture or browse sessions.
 *  ALREADY_CAPTURING     Another window started a capture mid-flight.
 *  QUERYING_TABS         Capture in progress; tab extraction running.
 *  POSTING               Tabs extracted; POSTing to /captures (SQLite).
 *  DONE_SUCCESS          Capture + SQLite write OK. Pipeline NOT yet triggered.
 *  DONE_POST_FAILED      Capture done but SQLite write failed.
 *  TRIGGERING_PIPELINE   Waiting for pipeline trigger response.
 *  PIPELINE_QUEUED       Pipeline trigger acknowledged.
 *  ERROR                 Terminal error; user must dismiss.
 *
 *  (Sessions tab states are handled inline in the controller by reading
 *   a separate `sessionsState` slice — not encoded here to avoid an
 *   explosion of top-level union variants for what is essentially a
 *   sub-panel.)
 */

import type { CaptureSummary } from "@schedule/shared/types"

// ── State shapes ───────────────────────────────────────────────────────────

export type PopupState =
  | { kind: "INIT" }
  | { kind: "IDLE"; last_summary: CaptureSummary | null }
  | { kind: "ALREADY_CAPTURING" }
  | { kind: "QUERYING_TABS"; completed: number; total: number }
  | { kind: "POSTING" }
  | { kind: "DONE_SUCCESS"; summary: CaptureSummary }
  | { kind: "DONE_POST_FAILED"; summary: CaptureSummary; post_error: string }
  | { kind: "TRIGGERING_PIPELINE"; session_id: string; summary: CaptureSummary }
  | { kind: "PIPELINE_QUEUED"; session_id: string; summary: CaptureSummary }
  | { kind: "ERROR"; message: string }

// Sessions panel is a separate async slice — not part of the capture FSM.
export type SessionsState =
  | { kind: "IDLE" }
  | { kind: "LOADING" }
  | { kind: "LOADED"; summaries: Array<CaptureSummary> }
  | { kind: "ERROR"; error: string }
  // Per-session in-flight action — optimistic update pattern.
  | { kind: "DELETING"; session_id: string; prev: Array<CaptureSummary> }
  | { kind: "TRIGGERING"; session_id: string; prev: Array<CaptureSummary> }

// ── Initial states ─────────────────────────────────────────────────────────

export const INIT_STATE: PopupState = { kind: "INIT" }
export const SESSIONS_INIT: SessionsState = { kind: "IDLE" }

// ── Capture FSM transitions ────────────────────────────────────────────────

export function onStatusReceived(
  _prev: PopupState,
  capturing: boolean,
  last_summary: CaptureSummary | null
): PopupState {
  if (capturing) return { kind: "ALREADY_CAPTURING" }
  return { kind: "IDLE", last_summary }
}

export function onStatusError(_prev: PopupState, error: string): PopupState {
  return { kind: "ERROR", message: `Background unreachable: ${error}` }
}

export function onCaptureTriggered(prev: PopupState): PopupState {
  if (prev.kind !== "IDLE" && prev.kind !== "ALREADY_CAPTURING") {
    console.warn(
      "[tabsched fsm] onCaptureTriggered in unexpected state",
      prev.kind
    )
    return prev
  }
  return { kind: "QUERYING_TABS", completed: 0, total: 0 }
}

export function onProgressUpdate(
  prev: PopupState,
  completed: number,
  total: number
): PopupState {
  if (prev.kind === "QUERYING_TABS" || prev.kind === "ALREADY_CAPTURING") {
    return { kind: "QUERYING_TABS", completed, total }
  }
  return prev
}

export function onAllTabsExtracted(prev: PopupState): PopupState {
  if (prev.kind !== "QUERYING_TABS") return prev
  return { kind: "POSTING" }
}

export function onCaptureComplete(
  prev: PopupState,
  summary: CaptureSummary,
  post_ok: boolean,
  post_error?: string
): PopupState {
  if (
    prev.kind !== "QUERYING_TABS" &&
    prev.kind !== "POSTING" &&
    prev.kind !== "ALREADY_CAPTURING"
  ) {
    return prev
  }
  if (post_ok) return { kind: "DONE_SUCCESS", summary }
  return {
    kind: "DONE_POST_FAILED",
    summary,
    post_error: post_error ?? "endpoint unreachable",
  }
}

export function onCaptureError(_prev: PopupState, message: string): PopupState {
  return { kind: "ERROR", message }
}

export function onTriggerPipeline(prev: PopupState): PopupState {
  if (prev.kind !== "DONE_SUCCESS" && prev.kind !== "DONE_POST_FAILED")
    return prev
  return {
    kind: "TRIGGERING_PIPELINE",
    session_id: prev.summary.session_id,
    summary: prev.summary,
  }
}

export function onPipelineTriggered(prev: PopupState): PopupState {
  if (prev.kind !== "TRIGGERING_PIPELINE") return prev
  return {
    kind: "PIPELINE_QUEUED",
    session_id: prev.session_id,
    summary: prev.summary,
  }
}

export function onPipelineTriggerError(
  prev: PopupState,
  error: string
): PopupState {
  console.error("pipeline trigger error: ", error)
  if (prev.kind !== "TRIGGERING_PIPELINE") return prev
  // Roll back to DONE_SUCCESS so the user can retry.
  return { kind: "DONE_SUCCESS", summary: prev.summary }
}

export function onDismiss(prev: PopupState): PopupState {
  switch (prev.kind) {
    case "DONE_SUCCESS":
    case "DONE_POST_FAILED":
    case "PIPELINE_QUEUED":
      return { kind: "IDLE", last_summary: prev.summary }
    case "ERROR":
      return { kind: "IDLE", last_summary: null }
    default:
      return prev
  }
}

// ── Sessions FSM transitions ───────────────────────────────────────────────

export function sessionsOnLoad(_prev: SessionsState): SessionsState {
  return { kind: "LOADING" }
}

export function sessionsOnLoaded(
  _prev: SessionsState,
  summaries: Array<CaptureSummary>
): SessionsState {
  return { kind: "LOADED", summaries }
}

export function sessionsOnError(
  _prev: SessionsState,
  error: string
): SessionsState {
  return { kind: "ERROR", error }
}

export function sessionsOnDelete(
  prev: SessionsState,
  session_id: string
): SessionsState {
  if (prev.kind !== "LOADED") return prev
  return { kind: "DELETING", session_id, prev: prev.summaries }
}

export function sessionsOnDeleted(
  prev: SessionsState,
  session_id: string
): SessionsState {
  const list =
    prev.kind === "DELETING" || prev.kind === "LOADED"
      ? prev.kind === "DELETING"
        ? prev.prev
        : prev.summaries
      : []
  return {
    kind: "LOADED",
    summaries: list.filter((s) => s.session_id !== session_id),
  }
}

export function sessionsOnDeleteError(
  prev: SessionsState,
  _session_id: string,
  error: string
): SessionsState {
  // Roll back to previous list.
  if (prev.kind === "DELETING") {
    return { kind: "LOADED", summaries: prev.prev }
  }
  return { kind: "ERROR", error }
}

export function sessionsOnTrigger(
  prev: SessionsState,
  session_id: string
): SessionsState {
  if (prev.kind !== "LOADED") return prev
  return { kind: "TRIGGERING", session_id, prev: prev.summaries }
}

export function sessionsOnTriggered(
  prev: SessionsState,
  session_id: string
): SessionsState {
  // Update the pipeline_status badge optimistically.
  const list =
    prev.kind === "TRIGGERING"
      ? prev.prev
      : prev.kind === "LOADED"
        ? prev.summaries
        : []
  const updated = list.map((s) =>
    s.session_id === session_id
      ? { ...s, pipeline_status: "running" as const }
      : s
  )
  return { kind: "LOADED", summaries: updated }
}

export function sessionsOnTriggerError(
  prev: SessionsState,
  _session_id: string
): SessionsState {
  if (prev.kind === "TRIGGERING") {
    return { kind: "LOADED", summaries: prev.prev }
  }
  return prev
}
