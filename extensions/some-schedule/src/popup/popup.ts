/**
 *
 * Controller. Owns the FSM state. Delegates rendering to view.ts.
 * No DOM manipulation here — only transitions and message dispatch.
 */

import type { MessageFromBackground } from "@schedule/shared/types"

import {
  INIT_STATE,
  onDismiss,
  onPipelineFailed,
  onPipelineQueued,
  onPipelineTriggered,
  onPruneDone,
  onPruneTriggered,
  onReconcileDeleteConfirmed,
  onReconcileDeleteDone,
  onReconcileError,
  onReconcileResult,
  onReconcileTriggered,
  onStatusError,
  onStatusReceived,
  onSyncDone,
  onSyncFailed,
  onSyncProgress,
  onSyncTriggered,
  type PopupState,
  type SyncResult,
} from "./fsm"
import { render } from "./view"

// ── State ─────────────────────────────────────────────────────────────────

let state: PopupState = INIT_STATE

// Cached ambient values so dismissals can restore IDLE correctly.
let _tab_count = 0
let _db_count = 0
let _last_synced_at: string | null = null

function setState(next: PopupState): void {
  state = next
  render(state, dispatch)
}

// ── Dispatch ──────────────────────────────────────────────────────────────

export type Action =
  | { type: "SYNC" }
  | { type: "RECONCILE" }
  | { type: "RECONCILE_CONFIRM_DELETE"; tab_ids: Array<number> }
  | { type: "TRIGGER_PIPELINE" }
  | { type: "PRUNE" }
  | { type: "DISMISS" }

async function dispatch(action: Action): Promise<void> {
  switch (action.type) {
    case "SYNC":
      return doSync()
    case "RECONCILE":
      return doReconcile()
    case "RECONCILE_CONFIRM_DELETE":
      return doReconcileDelete(action.tab_ids)
    case "TRIGGER_PIPELINE":
      return doPipelineTrigger()
    case "PRUNE":
      return doPrune()
    case "DISMISS":
      setState(onDismiss(state, _tab_count, _db_count, _last_synced_at))
      return
  }
}

// ── Message helpers ────────────────────────────────────────────────────────

function send(msg: object): Promise<MessageFromBackground> {
  return browser.runtime.sendMessage(msg) as Promise<MessageFromBackground>
}

// ── Actions ────────────────────────────────────────────────────────────────

async function doSync(): Promise<void> {
  setState(onSyncTriggered(state))

  // Subscribe to progress broadcasts.
  function progressListener(message: unknown): undefined {
    const msg = message as MessageFromBackground
    if (msg.kind === "SYNC_PROGRESS") {
      setState(onSyncProgress(state, msg.completed, msg.total))
    }
    return undefined
  }
  browser.runtime.onMessage.addListener(progressListener)

  try {
    const reply = await send({ kind: "SYNC_TABS" })

    if (reply.kind === "SYNC_COMPLETE") {
      const result: SyncResult = {
        upserted: reply.stats.upserted,
        failed: reply.stats.failed,
        error_tab_ids: reply.stats.error_tab_ids,
      }
      _db_count = reply.stats.db_count
      setState(onSyncDone(state, result, reply.stats.db_count))
    } else if (reply.kind === "SYNC_FAILED") {
      setState(onSyncFailed(state, reply.error))
    } else {
      setState(onSyncFailed(state, `unexpected reply: ${reply.kind}`))
    }
  } catch (e) {
    setState(onSyncFailed(state, String(e)))
  } finally {
    browser.runtime.onMessage.removeListener(progressListener)
  }
}

async function doReconcile(): Promise<void> {
  setState(onReconcileTriggered(state))

  try {
    const reply = await send({ kind: "RECONCILE" })

    if (reply.kind === "RECONCILE_RESULT") {
      setState(
        onReconcileResult(state, {
          absent_tab_ids: reply.absent_tab_ids,
          absent_summaries: reply.absent_summaries,
        })
      )
    } else if (reply.kind === "RECONCILE_ERROR") {
      setState(onReconcileError(state, reply.error))
    } else {
      setState(onReconcileError(state, `unexpected: ${reply.kind}`))
    }
  } catch (e) {
    setState(onReconcileError(state, String(e)))
  }
}

async function doReconcileDelete(tab_ids: Array<number>): Promise<void> {
  setState(onReconcileDeleteConfirmed(state, tab_ids))

  try {
    await send({ kind: "DELETE_TABS", tab_ids })
    // Refresh db_count after deletion.
    const statusReply = await send({ kind: "GET_STATUS" })
    if (statusReply.kind === "STATUS") {
      _tab_count = statusReply.tab_count
      _db_count = statusReply.db_count
      _last_synced_at = statusReply.last_synced_at
    }

    setState(
      onReconcileDeleteDone(state, _tab_count, _db_count, _last_synced_at)
    )
  } catch (e) {
    setState(onReconcileError(state, String(e)))
  }
}

async function doPipelineTrigger(): Promise<void> {
  setState(onPipelineTriggered(state))

  try {
    const reply = await send({ kind: "TRIGGER_PIPELINE" })

    if (reply.kind === "PIPELINE_QUEUED") {
      setState(onPipelineQueued(state, reply.db_count))
    } else if (reply.kind === "PIPELINE_ERROR") {
      setState(onPipelineFailed(state, reply.error))
    } else {
      setState(onPipelineFailed(state, `unexpected: ${reply.kind}`))
    }
  } catch (e) {
    setState(onPipelineFailed(state, String(e)))
  }
}

async function doPrune(): Promise<void> {
  setState(onPruneTriggered(state))

  try {
    const reply = await send({ kind: "PRUNE_TABS" })

    if (reply.kind === "PRUNE_COMPLETE") {
      _db_count = reply.db_count
      setState(onPruneDone(state, reply.pruned_count, reply.db_count))
    } else if (reply.kind === "PRUNE_ERROR") {
      setState({ kind: "ERROR", message: reply.error })
    } else {
      setState({ kind: "ERROR", message: `unexpected: ${reply.kind}` })
    }
  } catch (e) {
    setState({ kind: "ERROR", message: String(e) })
  }
}

// ── Bootstrap ──────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  render(state, dispatch)

  try {
    const reply = await send({ kind: "GET_STATUS" })

    if (reply.kind === "STATUS") {
      _tab_count = reply.tab_count
      _db_count = reply.db_count
      _last_synced_at = reply.last_synced_at
      setState(
        onStatusReceived(
          state,
          reply.tab_count,
          reply.db_count,
          reply.last_synced_at
        )
      )
    } else {
      setState(onStatusError(state, `unexpected reply: ${reply.kind}`))
    }
  } catch (e) {
    setState(onStatusError(state, String(e)))
  }
}

document.addEventListener("DOMContentLoaded", init)
