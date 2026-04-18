/**
 * Controller — the only file that imports both fsm.ts and view.ts.
 *
 * Responsibilities:
 *   1. Maintain PopupState (capture tab) and SessionsState (sessions tab)
 *   2. On any state change: call render / renderSessions
 *   3. Translate background messages → FSM transitions
 *   4. Translate button clicks → FSM transitions
 *
 * Rules:
 *   - Never touches the DOM directly (view.ts owns that)
 *   - Never contains state logic (fsm.ts owns that)
 *   - Never calls browser API directly (messages.ts owns that)
 */

/**
 * Controller — the only file that imports both fsm.ts and view.ts.
 */

import {
  INIT_STATE,
  onCaptureComplete,
  onCaptureError,
  onCaptureTriggered,
  onDismiss,
  onPipelineTriggered,
  onPipelineTriggerError,
  onProgressUpdate,
  onStatusError,
  onStatusReceived,
  onTriggerPipeline,
  SESSIONS_INIT,
  sessionsOnDelete,
  sessionsOnDeleted,
  sessionsOnDeleteError,
  sessionsOnError,
  sessionsOnLoad,
  sessionsOnLoaded,
  sessionsOnTrigger,
  sessionsOnTriggered,
  sessionsOnTriggerError,
} from "./fsm"
import type { PopupState, SessionsState } from "./fsm"
import {
  deleteSession,
  getSessions,
  onProgressMessage,
  sendToBackground,
  triggerAllPipeline,
  triggerPipeline,
} from "./messages"
import {
  getButtons,
  init as initView,
  render,
  renderSessions,
  switchTab,
} from "./view"

// ── State ──────────────────────────────────────────────────────────────────

let state: PopupState = INIT_STATE
let sessionsState: SessionsState = SESSIONS_INIT

function transition(next: PopupState): void {
  state = next
  render(state)
}

function transitionSessions(next: SessionsState): void {
  sessionsState = next
  renderSessions(sessionsState)
}

// ── Init ───────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  // 1. Initialize View (Bind DOM elements to local references)
  const root = document.body
  initView(root)

  // 2. Resolve buttons from the newly initialized view
  const buttons = getButtons()

  // 3. Initial Render
  render(state)
  renderSessions(sessionsState)

  // 4. Button Wiring (Must happen inside init after initView)

  // Tab Switching
  buttons.tabBtns.forEach((btn: HTMLButtonElement) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab as "capture" | "sessions"
      switchTab(tab)
      if (tab === "sessions" && sessionsState.kind === "IDLE") {
        loadSessions()
      }
    })
  })

  // Capture Tab Actions
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

  buttons.triggerPipeline.addEventListener("click", async () => {
    if (state.kind !== "DONE_SUCCESS" && state.kind !== "DONE_POST_FAILED")
      return
    const session_id = state.summary.session_id

    transition(onTriggerPipeline(state))

    try {
      const response = await triggerPipeline(session_id)
      if (response.kind === "PIPELINE_TRIGGERED") {
        transition(onPipelineTriggered(state))
      } else if (response.kind === "PIPELINE_TRIGGER_ERROR") {
        transition(onPipelineTriggerError(state, response.error))
      }
    } catch (e) {
      transition(onPipelineTriggerError(state, String(e)))
    }
  })

  // Sessions Tab Actions
  buttons.refreshSessions.addEventListener("click", loadSessions)
  buttons.sessionsRetry.addEventListener("click", loadSessions)

  buttons.triggerAllPipeline.addEventListener("click", async () => {
    try {
      const response = await triggerAllPipeline()
      if (response.kind === "PIPELINE_ALL_TRIGGERED") {
        loadSessions()
      } else if (response.kind === "PIPELINE_ALL_ERROR") {
        transitionSessions(sessionsOnError(sessionsState, response.error))
      }
    } catch (e) {
      transitionSessions(sessionsOnError(sessionsState, String(e)))
    }
  })

  // Event delegation for session list (Delete/Trigger)
  buttons.sessionsList.addEventListener("click", async (e: Event) => {
    const target = e.target as HTMLElement

    const triggerBtn = target.closest<HTMLButtonElement>(".btn-trigger-session")
    if (triggerBtn) {
      const session_id = triggerBtn.dataset.sessionId!
      transitionSessions(sessionsOnTrigger(sessionsState, session_id))
      try {
        const response = await triggerPipeline(session_id)
        if (response.kind === "PIPELINE_TRIGGERED") {
          transitionSessions(sessionsOnTriggered(sessionsState, session_id))
        } else if (response.kind === "PIPELINE_TRIGGER_ERROR") {
          transitionSessions(sessionsOnTriggerError(sessionsState, session_id))
        }
      } catch {
        transitionSessions(sessionsOnTriggerError(sessionsState, session_id))
      }
      return
    }

    const deleteBtn = target.closest<HTMLButtonElement>(".btn-delete-session")
    if (deleteBtn) {
      const session_id = deleteBtn.dataset.sessionId!
      transitionSessions(sessionsOnDelete(sessionsState, session_id))
      try {
        const response = await deleteSession(session_id)
        if (response.kind === "SESSION_DELETED") {
          transitionSessions(sessionsOnDeleted(sessionsState, session_id))
        } else if (response.kind === "DELETE_ERROR") {
          transitionSessions(
            sessionsOnDeleteError(sessionsState, session_id, response.error)
          )
        }
      } catch (e) {
        transitionSessions(
          sessionsOnDeleteError(sessionsState, session_id, String(e))
        )
      }
    }
  })

  // 5. Setup Background Message Listeners
  const unsubscribeProgress = onProgressMessage((completed, total) => {
    transition(onProgressUpdate(state, completed, total))
  })

  // 6. Fetch Initial Status
  try {
    const response = await sendToBackground({ kind: "GET_CAPTURE_STATUS" })
    if (response.kind === "STATUS") {
      transition(
        onStatusReceived(state, response.capturing, response.last_summary)
      )
    }
  } catch (e) {
    unsubscribeProgress()
    transition(onStatusError(state, String(e)))
  }
}

// ── Shared Logic ───────────────────────────────────────────────────────────

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
    }
  } catch (e) {
    transition(onCaptureError(state, String(e)))
  }
}

async function loadSessions(): Promise<void> {
  transitionSessions(sessionsOnLoad(sessionsState))
  try {
    const response = await getSessions()
    if (response.kind === "SESSIONS_LIST") {
      transitionSessions(sessionsOnLoaded(sessionsState, response.summaries))
    } else if (response.kind === "SESSIONS_ERROR") {
      transitionSessions(sessionsOnError(sessionsState, response.error))
    }
  } catch (e) {
    transitionSessions(sessionsOnError(sessionsState, String(e)))
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init)
} else {
  init()
}
