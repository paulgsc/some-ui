/**
 *
 * Firefox MV2 persistent background page.
 *
 * Data flow:
 *
 *   Popup sends CAPTURE_ALL_TABS
 *     → background orchestrates capture (capture.ts)
 *     → background POSTs full CaptureSession to localhost endpoint
 *     → background stores only CaptureSummary in browser.storage.local
 *     → background replies to popup with summary
 *
 * Nothing large (ExtractedContent payloads) is ever written to extension
 * storage. The full session lives in memory during capture and is released
 * after the POST completes.
 */

import type {
  CaptureSettings,
  MessageFromBackground,
  MessageToBackground,
  StoredState,
} from "@schedule/shared/types"
import { DEFAULT_SETTINGS, summarise } from "@schedule/shared/types"

import { captureAllTabs } from "./capture"

// ── Storage ────────────────────────────────────────────────────────────────
// Only settings + lightweight summary persisted here. No payload data.

async function loadState(): Promise<StoredState> {
  const result = await browser.storage.local.get("tabsched_state")
  const stored = result["tabsched_state"]
  return (
    stored ?? {
      last_summary: null,
      capture_count: 0,
      settings: DEFAULT_SETTINGS,
    }
  )
}

async function saveState(state: StoredState): Promise<void> {
  await browser.storage.local.set({ tabsched_state: state })
}

// ── Localhost POST ─────────────────────────────────────────────────────────

/**
 * POST the full CaptureSession JSON to the localhost pipeline endpoint.
 *
 * Uses a dummy endpoint pattern: if the fetch fails (endpoint not running),
 * we log the error and carry on — the popup still shows the summary.
 * The caller is responsible for informing the user if delivery failed.
 */
async function postToPipeline(
  session: object,
  endpoint: string
): Promise<PostResult> {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(session),
    })

    if (!response.ok) {
      return {
        ok: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      }
    }

    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

type PostResult = {
  ok: boolean
  error?: string
}

// ── In-memory capture flag ─────────────────────────────────────────────────

let capturing = false

// ── Message router ─────────────────────────────────────────────────────────

browser.runtime.onMessage.addListener(
  (
    message: unknown,
    _sender: browser.runtime.MessageSender
  ): Promise<MessageFromBackground> | boolean => {
    const msg = message as MessageToBackground

    switch (msg.kind) {
      case "GET_CAPTURE_STATUS":
        return handleGetStatus()
      case "CAPTURE_ALL_TABS":
        return handleCaptureAll()
      case "CAPTURE_ACTIVE_TAB":
        return handleCaptureActive()
      default:
        return true
    }
  }
)

// ── Handlers ──────────────────────────────────────────────────────────────

async function handleGetStatus(): Promise<MessageFromBackground> {
  const state = await loadState()
  return {
    kind: "STATUS",
    last_summary: state.last_summary,
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
      const progress: MessageFromBackground = {
        kind: "CAPTURE_PROGRESS",
        completed,
        total,
      }
      browser.runtime.sendMessage(progress).catch(() => undefined)
    })

    // POST full payload to pipeline endpoint — fire and inform.
    const postResult = await postToPipeline(
      session,
      state.settings.pipeline_endpoint
    )

    // Store only the lightweight summary.
    const summary = summarise(session)
    state.last_summary = summary
    state.capture_count += 1
    await saveState(state)

    // Surface delivery failure to popup without blocking the summary reply.
    if (!postResult.ok) {
      console.warn("[tabsched] pipeline POST failed:", postResult.error)
    }

    return {
      kind: "CAPTURE_COMPLETE",
      summary,
      post_ok: postResult.ok,
      post_error: postResult.ok ? undefined : postResult.error,
    }
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

  // Don't filter active tab — user explicitly requested it.
  const singleTabSettings: CaptureSettings = {
    ...state.settings,
    ignore_patterns: [],
  }

  capturing = true
  try {
    const session = await captureAllTabs(singleTabSettings)
    const filtered = {
      ...session,
      captures: session.captures.filter((c) => c.tab_id === activeTab.id),
    }

    const postResult = await postToPipeline(
      filtered,
      state.settings.pipeline_endpoint
    )
    if (!postResult.ok) {
      console.warn("[tabsched] pipeline POST failed:", postResult.error)
    }

    const summary = summarise(filtered)
    state.last_summary = summary
    state.capture_count += 1
    await saveState(state)

    return {
      kind: "CAPTURE_COMPLETE",
      summary,
      post_ok: postResult.ok,
      post_error: postResult.ok ? undefined : postResult.error,
    }
  } catch (e) {
    return { kind: "CAPTURE_ERROR", error: String(e) }
  } finally {
    capturing = false
  }
}

console.log("[tabsched bg] loaded")
