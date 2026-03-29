/**
 *
 * Firefox MV2 persistent background page.
 *
 * Responsibilities:
 * - Handle messages from the popup
 * - Orchestrate capture via capture.ts
 * - Persist state to browser.storage.local
 * - Broadcast progress back to popup
 *
 * MV2 note: the background page is persistent — `capturing` survives
 * across message invocations, unlike an MV3 service worker.
 */

import type {
  MessageFromBackground,
  MessageToBackground,
  StoredState,
} from "@schedule/shared/types"
import { DEFAULT_SETTINGS } from "@schedule/shared/types"

import { captureAllTabs } from "./capture"

// ── Storage helpers ────────────────────────────────────────────────────────

async function loadState(): Promise<StoredState> {
  const result = await browser.storage.local.get("tabsched_state")
  const stored = result["tabsched_state"] as StoredState | undefined
  return (
    stored ?? {
      last_session: null,
      capture_count: 0,
      settings: DEFAULT_SETTINGS,
    }
  )
}

async function saveState(state: StoredState): Promise<void> {
  await browser.storage.local.set({ tabsched_state: state })
}

// ── In-memory capture flag ─────────────────────────────────────────────────
// Persists across messages in MV2 because the background page is long-lived.

let capturing = false

// ── Message router ─────────────────────────────────────────────────────────
//
// The listener returns true for all messages that need an async response.
// For the exhaustive switch over MessageToBackground, TypeScript would
// flag `return false` after the switch as unreachable — so we handle the
// default case explicitly inside the switch instead.

browser.runtime.onMessage.addListener(
  (
    message: unknown,
    _sender: browser.runtime.MessageSender
  ): Promise<MessageFromBackground> | undefined => {
    const msg = message as MessageToBackground

    switch (msg.kind) {
      case "GET_CAPTURE_STATUS":
        return handleGetStatus()

      case "CAPTURE_ALL_TABS":
        return handleCaptureAll()

      case "CAPTURE_ACTIVE_TAB":
        return handleCaptureActive()

      default:
        // Unknown message kind — return undefined to signal no async response.
        return undefined
    }
  }
)

// ── Handlers — all return Promise<MessageFromBackground> ──────────────────
//
// Firefox MV2 supports returning a Promise directly from onMessage listeners,
// which is cleaner than the sendResponse callback pattern and avoids the
// callback-type conflicts that appear with the Chrome typings.

async function handleGetStatus(): Promise<MessageFromBackground> {
  const state = await loadState()
  return {
    kind: "STATUS",
    last_session: state.last_session,
    capturing,
  }
}

async function handleCaptureAll(): Promise<MessageFromBackground> {
  if (capturing) {
    return { kind: "CAPTURE_ERROR", error: "capture already in progress" }
  }

  capturing = true
  const state = await loadState()

  try {
    const session = await captureAllTabs(state.settings, (completed, total) => {
      // Best-effort progress broadcast to popup.
      // Popup may not be open — swallow the error.
      const progress: MessageFromBackground = {
        kind: "CAPTURE_PROGRESS",
        completed,
        total,
      }
      browser.runtime.sendMessage(progress).catch(() => undefined)
    })

    state.last_session = session
    state.capture_count += 1
    await saveState(state)

    return { kind: "CAPTURE_COMPLETE", session }
  } catch (e) {
    return { kind: "CAPTURE_ERROR", error: String(e) }
  } finally {
    capturing = false
  }
}

async function handleCaptureActive(): Promise<MessageFromBackground> {
  const [activeTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  })
  if (activeTab == null) {
    return { kind: "CAPTURE_ERROR", error: "no active tab" }
  }

  const state = await loadState()

  // Don't apply ignore_patterns for an explicitly user-requested capture.
  const singleTabSettings = { ...state.settings, ignore_patterns: [] }

  capturing = true
  try {
    const session = await captureAllTabs(singleTabSettings)
    const filtered = {
      ...session,
      captures: session.captures.filter((c) => c.tab_id === activeTab.id),
    }

    state.last_session = filtered
    await saveState(state)

    return { kind: "CAPTURE_COMPLETE", session: filtered }
  } catch (e) {
    return { kind: "CAPTURE_ERROR", error: String(e) }
  } finally {
    capturing = false
  }
}
