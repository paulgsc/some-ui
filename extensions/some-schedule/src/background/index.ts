/**
 *
 * MV3 service worker.
 *
 * Responsibilities:
 * - Handle messages from the popup (CAPTURE_ALL_TABS, GET_CAPTURE_STATUS)
 * - Orchestrate the capture via capture.ts
 * - Persist the last CaptureSession to chrome.storage.local
 * - Broadcast progress back to popup
 *
 * The service worker is stateless across invocations (MV3 constraint).
 * All state is stored in chrome.storage.local and reloaded on demand.
 */

import type {
  CaptureSettings,
  MessageFromBackground,
  MessageToBackground,
  StoredState,
} from "../shared/types"
import { DEFAULT_SETTINGS } from "../shared/types"
import { captureAllTabs } from "./capture"

// ── Storage helpers ────────────────────────────────────────────────────────

async function loadState(): Promise<StoredState> {
  const result = await chrome.storage.local.get("tabsched_state")
  return (
    result["tabsched_state"] ?? {
      last_session: null,
      capture_count: 0,
      settings: DEFAULT_SETTINGS,
    }
  )
}

async function saveState(state: StoredState): Promise<void> {
  await chrome.storage.local.set({ tabsched_state: state })
}

// ── Capture state (in-memory, resets on service worker restart) ───────────

let capturing = false

// ── Message handler ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    message: MessageToBackground,
    _sender,
    sendResponse: (response: MessageFromBackground) => void
  ) => {
    switch (message.kind) {
      case "GET_CAPTURE_STATUS":
        handleGetStatus(sendResponse)
        return true

      case "CAPTURE_ALL_TABS":
        handleCaptureAll(sendResponse)
        return true

      case "CAPTURE_ACTIVE_TAB":
        handleCaptureActive(sendResponse)
        return true
    }

    return false
  }
)

async function handleGetStatus(
  sendResponse: (r: MessageFromBackground) => void
): Promise<void> {
  const state = await loadState()
  sendResponse({
    kind: "STATUS",
    last_session: state.last_session,
    capturing,
  })
}

async function handleCaptureAll(
  sendResponse: (r: MessageFromBackground) => void
): Promise<void> {
  if (capturing) {
    sendResponse({
      kind: "CAPTURE_ERROR",
      error: "capture already in progress",
    })
    return
  }

  capturing = true
  const state = await loadState()

  try {
    const session = await captureAllTabs(state.settings, (completed, total) => {
      // Broadcast progress to all extension pages (popup may be open)
      const progress: MessageFromBackground = {
        kind: "CAPTURE_PROGRESS",
        completed,
        total,
      }
      chrome.runtime.sendMessage(progress).catch(() => {
        // Popup may not be open — ignore "no receiver" errors
      })
    })

    state.last_session = session
    state.capture_count += 1
    await saveState(state)

    sendResponse({ kind: "CAPTURE_COMPLETE", session })
  } catch (e) {
    sendResponse({ kind: "CAPTURE_ERROR", error: String(e) })
  } finally {
    capturing = false
  }
}

async function handleCaptureActive(
  sendResponse: (r: MessageFromBackground) => void
): Promise<void> {
  // Capture only the currently active tab — useful for testing extractors
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  })
  if (!activeTab) {
    sendResponse({ kind: "CAPTURE_ERROR", error: "no active tab" })
    return
  }

  const state = await loadState()

  // Re-use captureAllTabs with a filtered tab list by temporarily
  // restricting to active tab only — achieved by querying differently.
  // Simpler than duplicating the single-tab path.
  const singleTabSettings: CaptureSettings = {
    ...state.settings,
    ignore_patterns: [], // don't filter active tab — user explicitly asked for it
  }

  capturing = true
  try {
    const session = await captureAllTabs(singleTabSettings)
    // Filter to only the active tab
    const filtered = {
      ...session,
      captures: session.captures.filter((c) => c.tab_id === activeTab.id),
    }

    state.last_session = filtered
    await saveState(state)

    sendResponse({ kind: "CAPTURE_COMPLETE", session: filtered })
  } catch (e) {
    sendResponse({ kind: "CAPTURE_ERROR", error: String(e) })
  } finally {
    capturing = false
  }
}
