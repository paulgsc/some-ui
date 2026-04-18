/**
 * Firefox MV2 persistent background page.
 *
 * Data flow (revised):
 *
 *   Popup sends CAPTURE_ALL_TABS
 *     → background orchestrates capture (capture.ts)
 *     → background POSTs full CaptureSession to /captures (SQLite write)
 *     → background stores CaptureSummary in browser.storage.local
 *     → background replies with summary — pipeline NOT auto-triggered
 *
 *   Popup sends TRIGGER_PIPELINE { session_id }
 *     → background POSTs to /captures/:session_id/pipeline (JetStream signal)
 *     → background updates pipeline_status in storage
 *
 *   Popup sends GET_SESSIONS
 *     → background GETs /captures/summaries
 *     → replies with SESSIONS_LIST
 *
 *   Popup sends DELETE_SESSION { session_id }
 *     → background DELETEs /captures/:session_id
 *     → replies with SESSION_DELETED
 */

import type {
  CaptureSettings,
  CaptureSummary,
  MessageFromBackground,
  MessageToBackground,
  StoredState,
} from "@schedule/shared/types"
import {
  DEFAULT_SETTINGS,
  FERRUM_BASE,
  summarise,
} from "@schedule/shared/types"

import { captureAllTabs } from "./capture"

// ── Storage ────────────────────────────────────────────────────────────────

async function loadState(): Promise<StoredState> {
  const result = await browser.storage.local.get("tabsched_state")
  const stored = result["tabsched_state"]
  return (
    stored ?? {
      last_summary: null,
      capture_count: 0,
      settings: DEFAULT_SETTINGS,
      pipeline_statuses: {},
    }
  )
}

async function saveState(state: StoredState): Promise<void> {
  await browser.storage.local.set({ tabsched_state: state })
}

// ── HTTP helpers ───────────────────────────────────────────────────────────

async function httpPost(
  url: string,
  body: unknown
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

async function httpGet<T>(
  url: string
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      return {
        ok: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      }
    }
    const data = (await response.json()) as T
    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

async function httpDelete(
  url: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(url, { method: "DELETE" })
    // 204 No Content is success
    if (!response.ok && response.status !== 204) {
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
      case "GET_SESSIONS":
        return handleGetSessions()
      case "DELETE_SESSION":
        return handleDeleteSession(msg.session_id)
      case "TRIGGER_PIPELINE":
        return handleTriggerPipeline(msg.session_id)
      case "TRIGGER_ALL_PIPELINE":
        return handleTriggerAllPipeline()
      default:
        return true
    }
  }
)

// ── Handlers ──────────────────────────────────────────────────────────────

async function handleGetStatus(): Promise<MessageFromBackground> {
  const state = await loadState()
  return { kind: "STATUS", last_summary: state.last_summary, capturing }
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

    // ① Write to SQLite via POST /captures
    const postResult = await httpPost(state.settings.pipeline_endpoint, session)
    if (!postResult.ok) {
      console.warn("[tabsched bg] SQLite write failed:", postResult.error)
    }

    const summary = summarise(session)

    // ② Store summary + mark pipeline status as pending
    state.last_summary = summary
    state.capture_count += 1
    state.pipeline_statuses[session.session_id] = "pending"
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

async function handleCaptureActive(): Promise<MessageFromBackground> {
  const [activeTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  })
  if (activeTab == null) {
    return { kind: "CAPTURE_ERROR", error: "no active tab" }
  }

  const state = await loadState()
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

    const postResult = await httpPost(
      state.settings.pipeline_endpoint,
      filtered
    )
    if (!postResult.ok) {
      console.warn("[tabsched bg] SQLite write failed:", postResult.error)
    }

    const summary = summarise(filtered)
    state.last_summary = summary
    state.capture_count += 1
    state.pipeline_statuses[filtered.session_id] = "pending"
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

async function handleGetSessions(): Promise<MessageFromBackground> {
  const state = await loadState()
  const result = await httpGet<Array<CaptureSummary>>(
    `${FERRUM_BASE}/captures/summaries`
  )
  if (!result.ok) {
    return { kind: "SESSIONS_ERROR", error: result.error }
  }

  // Annotate summaries with locally-tracked pipeline statuses.
  const summaries = result.data.map((s) => ({
    ...s,
    pipeline_status: state.pipeline_statuses[s.session_id] ?? "pending",
  }))

  return { kind: "SESSIONS_LIST", summaries }
}

async function handleDeleteSession(
  session_id: string
): Promise<MessageFromBackground> {
  const result = await httpDelete(`${FERRUM_BASE}/captures/${session_id}`)
  if (!result.ok) {
    return {
      kind: "DELETE_ERROR",
      session_id,
      error: result.error ?? "unknown",
    }
  }

  // Clean up local pipeline status entry.
  const state = await loadState()
  delete state.pipeline_statuses[session_id]
  if (state.last_summary?.session_id === session_id) {
    state.last_summary = null
  }
  await saveState(state)

  return { kind: "SESSION_DELETED", session_id }
}

async function handleTriggerPipeline(
  session_id: string
): Promise<MessageFromBackground> {
  // POST to the pipeline trigger endpoint — Ferrum publishes to JetStream.
  const result = await httpPost(
    `${FERRUM_BASE}/captures/${session_id}/pipeline`,
    {}
  )
  if (!result.ok) {
    return {
      kind: "PIPELINE_TRIGGER_ERROR",
      session_id,
      error: result.error ?? "unknown",
    }
  }

  const state = await loadState()
  state.pipeline_statuses[session_id] = "running"
  await saveState(state)

  return { kind: "PIPELINE_TRIGGERED", session_id }
}

async function handleTriggerAllPipeline(): Promise<MessageFromBackground> {
  const state = await loadState()

  // Fetch all summaries, fire pipeline for any that are pending.
  const listResult = await httpGet<Array<CaptureSummary>>(
    `${FERRUM_BASE}/captures/summaries`
  )
  if (!listResult.ok) {
    return { kind: "PIPELINE_ALL_ERROR", error: listResult.error }
  }

  const pending = listResult.data.filter(
    (s) => (state.pipeline_statuses[s.session_id] ?? "pending") === "pending"
  )

  await Promise.all(
    pending.map(async (s) => {
      const r = await httpPost(
        `${FERRUM_BASE}/captures/${s.session_id}/pipeline`,
        {}
      )
      state.pipeline_statuses[s.session_id] = r.ok ? "running" : "failed"
    })
  )

  await saveState(state)

  return { kind: "PIPELINE_ALL_TRIGGERED", count: pending.length }
}

console.log("[tabsched bg] loaded")
