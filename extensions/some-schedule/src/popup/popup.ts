/**
 *
 * Controller — the only file that imports both fsm.ts and view.ts.
 *
 * Responsibilities:
 * 1. Maintain current PopupState
 * 2. On any state change: call render(state)
 * 3. Translate background messages → FSM transitions
 * 4. Translate button clicks → FSM transitions
 *
 * Rules:
 * - Never touches the DOM directly (view.ts owns that)
 * - Never contains state logic (fsm.ts owns that)
 * - Never calls browser API directly (messages.ts owns that)
 */

import {
  INIT_STATE,
  onCaptureComplete,
  onCaptureError,
  onCaptureTriggered,
  onDismiss,
  onProgressUpdate,
  onStatusError,
  onStatusReceived,
} from "./fsm"
import type { PopupState } from "./fsm"
import { onProgressMessage, sendToBackground } from "./messages"
import { buttons, render } from "./view"

// ── State ──────────────────────────────────────────────────────────────────

let state: PopupState = INIT_STATE

function transition(next: PopupState): void {
  state = next
  render(state)
}

// ── Init ───────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  console.log("[popup] init start")

  render(state)

  const unsubscribeProgress = onProgressMessage((completed, total) => {
    console.log("[popup] progress event", { completed, total })
    transition(onProgressUpdate(state, completed, total))
  })

  try {
    console.log("[popup] requesting status")

    const response = await sendToBackground({ kind: "GET_CAPTURE_STATUS" })

    console.log("[popup] status response", response)

    if (response.kind === "STATUS") {
      transition(
        onStatusReceived(state, response.capturing, response.last_summary)
      )
    } else {
      console.warn("[popup] unexpected status response", response)
    }
  } catch (e) {
    console.error("[popup] status failed", e)
    unsubscribeProgress()
    transition(onStatusError(state, String(e)))
  }
}

// ── Button wiring ──────────────────────────────────────────────────────────

buttons.captureAll.addEventListener("click", () => {
  transition(onCaptureTriggered(state))
  triggerCapture("CAPTURE_ALL_TABS")
})

buttons.captureActive.addEventListener("click", () => {
  transition(onCaptureTriggered(state))
  triggerCapture("CAPTURE_ACTIVE_TAB")
})

buttons.again.addEventListener("click", () => {
  transition(onDismiss(state))
})

buttons.dismiss.addEventListener("click", () => {
  transition(onDismiss(state))
})

// ── Capture flow ───────────────────────────────────────────────────────────

async function triggerCapture(
  kind: "CAPTURE_ALL_TABS" | "CAPTURE_ACTIVE_TAB"
): Promise<void> {
  try {
    const response = await sendToBackground({ kind })

    if (response.kind === "CAPTURE_COMPLETE") {
      transition(
        onCaptureComplete(
          state,
          response.summary,
          response.post_ok,
          response.post_error
        )
      )
    } else if (response.kind === "CAPTURE_ERROR") {
      transition(onCaptureError(state, response.error))
    } else {
      transition(onCaptureError(state, `unexpected response: ${response.kind}`))
    }
  } catch (e) {
    transition(onCaptureError(state, String(e)))
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────

init()
