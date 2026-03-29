/**
 *
 * Pure finite state machine for the popup.
 *
 * No DOM. No side effects. All state is expressed as a discriminated
 * union; all transitions are explicit functions that return a new state.
 * The render layer (view.ts) reads this and updates the DOM.
 *
 * States
 * ──────
 *
 *  INIT              Popup just opened; awaiting GET_CAPTURE_STATUS reply.
 *
 *  IDLE              Background confirmed: not capturing, no prior run.
 *                    User can trigger a capture.
 *
 *  ALREADY_CAPTURING Background confirmed: a capture is already in flight
 *                    (popup was opened mid-run). Show live progress if
 *                    CAPTURE_PROGRESS messages arrive.
 *
 *  QUERYING_TABS     Background received the capture request and is
 *                    iterating open tabs. Progress: n / total.
 *
 *  POSTING           All tabs extracted; POSTing the session to the
 *                    localhost pipeline endpoint.
 *
 *  DONE_SUCCESS      Capture and POST both completed. Shows summary.
 *
 *  DONE_POST_FAILED  Capture completed but POST to localhost failed.
 *                    Shows summary + delivery warning.
 *
 *  ERROR             Background returned CAPTURE_ERROR or the message
 *                    channel itself threw.
 *
 * Transitions (all valid edges)
 * ──────────────────────────────
 *
 *  INIT            → IDLE | ALREADY_CAPTURING | ERROR
 *  IDLE            → QUERYING_TABS
 *  ALREADY_CAPTURING → QUERYING_TABS (progress update)
 *                    → DONE_SUCCESS | DONE_POST_FAILED | ERROR (run finishes)
 *  QUERYING_TABS   → QUERYING_TABS (progress tick)
 *                  → POSTING
 *                  → ERROR
 *  POSTING         → DONE_SUCCESS | DONE_POST_FAILED | ERROR
 *  DONE_SUCCESS    → IDLE (user clicks "capture again")
 *  DONE_POST_FAILED → IDLE
 *  ERROR           → IDLE (user dismisses)
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
  | { kind: "ERROR"; message: string }

// ── Initial state ──────────────────────────────────────────────────────────

export const INIT_STATE: PopupState = { kind: "INIT" }

// ── Transitions ────────────────────────────────────────────────────────────
//
// Each function takes the current state and relevant event data,
// validates the transition is legal, and returns the next state.
// Illegal transitions return the current state unchanged and log a warning.

export function onStatusReceived(
  _prev: PopupState,
  capturing: boolean,
  last_summary: CaptureSummary | null
): PopupState {
  if (capturing) return { kind: "ALREADY_CAPTURING" }
  return { kind: "IDLE", last_summary }
}

export function onStatusError(_prev: PopupState, error: string): PopupState {
  // Background unreachable at init — treat as idle, show error briefly
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
  // Progress arriving after we transitioned away — ignore
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
  if (post_ok) {
    return { kind: "DONE_SUCCESS", summary }
  }
  return {
    kind: "DONE_POST_FAILED",
    summary,
    post_error: post_error ?? "endpoint unreachable",
  }
}

export function onCaptureError(_prev: PopupState, message: string): PopupState {
  return { kind: "ERROR", message }
}

export function onDismiss(prev: PopupState): PopupState {
  switch (prev.kind) {
    case "DONE_SUCCESS":
    case "DONE_POST_FAILED":
    case "ERROR":
      return {
        kind: "IDLE",
        last_summary: prev.kind !== "ERROR" ? prev.summary : null,
      }
    default:
      return prev
  }
}
