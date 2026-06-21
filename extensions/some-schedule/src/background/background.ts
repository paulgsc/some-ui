/**
 *
 * Tab-centric background. No session concept.
 *
 * Data flow:
 *
 *   SYNC_TABS
 *     → capture non-suspended tabs (capture.ts)
 *     → POST /tabs/batch (upsert)
 *     → reply SYNC_COMPLETE | SYNC_FAILED
 *     → broadcasts SYNC_PROGRESS during extraction
 *
 *   RECONCILE
 *     → GET active tab_ids from browser
 *     → POST /tabs/reconcile
 *     → reply RECONCILE_RESULT
 *
 *   DELETE_TABS { tab_ids }
 *     → DELETE /tabs/batch
 *     → reply DELETE_COMPLETE | DELETE_ERROR
 *
 *   TRIGGER_PIPELINE
 *     → POST /tabs/pipeline  (Ferrum publishes NATS msg)
 *     → reply PIPELINE_QUEUED | PIPELINE_ERROR
 *
 *   PRUNE_TABS { older_than_days? }
 *     → POST /tabs/prune
 *     → reply PRUNE_COMPLETE | PRUNE_ERROR
 *
 *   GET_STATUS
 *     → browser.tabs.query + GET /tabs/summaries count
 *     → reply STATUS
 */

import { isoNow } from "@schedule/shared/id"
import type {
  MessageFromBackground,
  MessageToBackground,
  StoredState,
  SyncStats,
  TabSummary,
} from "@schedule/shared/types"
import { DEFAULT_SETTINGS } from "@schedule/shared/types"

import { captureAllTabs } from "./capture"

// ── Storage ────────────────────────────────────────────────────────────────

async function loadState(): Promise<StoredState> {
  const result = await browser.storage.local.get("tabsched_state")
  const stored = result["tabsched_state"]
  return (
    stored ?? {
      last_synced_at: null,
      sync_count: 0,
      settings: DEFAULT_SETTINGS,
    }
  )
}

async function saveState(state: StoredState): Promise<void> {
  await browser.storage.local.set({ tabsched_state: state })
}

// ── HTTP ───────────────────────────────────────────────────────────────────

async function httpPost<T = unknown>(
  url: string,
  body: unknown
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok)
      return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` }
    const data = (await res.json()) as T
    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

async function httpGet<T>(
  url: string
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url)
    if (!res.ok)
      return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` }
    return { ok: true, data: (await res.json()) as T }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

async function httpDelete<T = unknown>(
  url: string,
  body?: unknown
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method: "DELETE",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok && res.status !== 204)
      return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` }
    const data = res.status === 204 ? ({} as T) : ((await res.json()) as T)
    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

// ── Capture flag ───────────────────────────────────────────────────────────

let syncing = false

// ── Router ─────────────────────────────────────────────────────────────────

browser.runtime.onMessage.addListener(
  (
    message: unknown,
    _sender: browser.runtime.MessageSender
  ): Promise<MessageFromBackground> | boolean => {
    const msg = message as MessageToBackground

    switch (msg.kind) {
      case "GET_STATUS":
        return handleGetStatus()
      case "SYNC_TABS":
        return handleSyncTabs()
      case "RECONCILE":
        return handleReconcile()
      case "DELETE_TABS":
        return handleDeleteTabs(msg.tab_ids)
      case "TRIGGER_PIPELINE":
        return handleTriggerPipeline()
      case "PRUNE_TABS":
        return handlePruneTabs(msg.older_than_days)
      default:
        return true
    }
  }
)

// ── Handlers ──────────────────────────────────────────────────────────────

async function handleGetStatus(): Promise<MessageFromBackground> {
  const [state, allTabs] = await Promise.all([
    loadState(),
    browser.tabs.query({}),
  ])

  // Get db_count from summaries endpoint (lightweight).
  const summaryResult = await httpGet<Array<TabSummary>>(
    `${state.settings.ferrum_base}/tabs/summaries`
  )
  const db_count = summaryResult.ok ? summaryResult.data.length : 0

  return {
    kind: "STATUS",
    tab_count: allTabs.length,
    db_count,
    last_synced_at: state.last_synced_at,
  }
}

async function handleSyncTabs(): Promise<MessageFromBackground> {
  if (syncing) {
    return { kind: "ERROR", message: "sync already in progress" }
  }

  syncing = true
  const state = await loadState()

  try {
    // Capture only — suspended tabs self-exclude via captureTab's discard check.
    const { captures, skipped } = await captureAllTabs(
      state.settings,
      (completed, total) => {
        const progress: MessageFromBackground = {
          kind: "SYNC_PROGRESS",
          completed,
          total,
        }
        browser.runtime.sendMessage(progress).catch(() => undefined)
      }
    )

    if (captures.length === 0) {
      // All tabs suspended or filtered. Not a network error.
      const stats: SyncStats = {
        upserted: 0,
        failed: 0,
        error_tab_ids: skipped.map((s) => s.tab_id),
        db_count: 0,
      }
      return { kind: "SYNC_COMPLETE", stats }
    }

    // POST batch upsert.
    const result = await httpPost<{ upserted_count: number }>(
      `${state.settings.ferrum_base}/tabs/batch`,
      { tabs: captures }
    )

    if (!result.ok) {
      return { kind: "SYNC_FAILED", error: result.error }
    }

    // Fetch updated db_count.
    const summaryResult = await httpGet<Array<TabSummary>>(
      `${state.settings.ferrum_base}/tabs/summaries`
    )
    const db_count = summaryResult.ok ? summaryResult.data.length : 0

    const failedCaptures = captures.filter((c) => !c.extraction_ok)
    const stats: SyncStats = {
      upserted: result.data.upserted_count,
      failed: failedCaptures.length,
      error_tab_ids: failedCaptures.map((c) => c.tab_id),
      db_count,
    }

    state.last_synced_at = isoNow()
    state.sync_count += 1
    await saveState(state)

    return { kind: "SYNC_COMPLETE", stats }
  } catch (e) {
    return { kind: "SYNC_FAILED", error: String(e) }
  } finally {
    syncing = false
  }
}

async function handleReconcile(): Promise<MessageFromBackground> {
  const state = await loadState()

  // Collect all non-filtered browser tab_ids.
  const allTabs = await browser.tabs.query({})
  const active_tab_ids = allTabs
    .filter((t) => t.id != null && t.url != null)
    .map((t) => t.id as number)

  const result = await httpPost<{ absent_tab_ids: Array<number> }>(
    `${state.settings.ferrum_base}/tabs/reconcile`,
    { active_tab_ids }
  )

  if (!result.ok) {
    return { kind: "RECONCILE_ERROR", error: result.error }
  }

  const absent_tab_ids = result.data.absent_tab_ids

  if (absent_tab_ids.length === 0) {
    return {
      kind: "RECONCILE_RESULT",
      absent_tab_ids: [],
      absent_summaries: [],
    }
  }

  // Fetch summaries to give user context on what will be deleted.
  const summaryResult = await httpGet<Array<TabSummary>>(
    `${state.settings.ferrum_base}/tabs/summaries`
  )

  const absent_summaries = summaryResult.ok
    ? summaryResult.data.filter((s) => absent_tab_ids.includes(s.tab_id))
    : []

  return {
    kind: "RECONCILE_RESULT",
    absent_tab_ids,
    absent_summaries,
  }
}

async function handleDeleteTabs(
  tab_ids: Array<number>
): Promise<MessageFromBackground> {
  const state = await loadState()

  const result = await httpDelete<{ deleted_count: number }>(
    `${state.settings.ferrum_base}/tabs/batch`,
    { tab_ids }
  )

  if (!result.ok) {
    return { kind: "DELETE_ERROR", error: result.error }
  }

  return { kind: "DELETE_COMPLETE", deleted_count: result.data.deleted_count }
}

async function handleTriggerPipeline(): Promise<MessageFromBackground> {
  const state = await loadState()

  // GET /tabs/pipeline — Ferrum will add NATS publish logic here.
  // Background does a POST; the route handler publishes to JetStream.
  const result = await httpPost(
    `${state.settings.ferrum_base}/tabs/pipeline`,
    {}
  )

  if (!result.ok) {
    return { kind: "PIPELINE_ERROR", error: result.error }
  }

  // Return current db_count so the UI can confirm payload size.
  const summaryResult = await httpGet<Array<TabSummary>>(
    `${state.settings.ferrum_base}/tabs/summaries`
  )
  const db_count = summaryResult.ok ? summaryResult.data.length : 0

  return { kind: "PIPELINE_QUEUED", db_count }
}

async function handlePruneTabs(
  older_than_days?: number
): Promise<MessageFromBackground> {
  const state = await loadState()

  const result = await httpPost<{ pruned_count: number }>(
    `${state.settings.ferrum_base}/tabs/prune`,
    { older_than_days: older_than_days ?? state.settings.prune_days }
  )

  if (!result.ok) {
    return { kind: "PRUNE_ERROR", error: result.error }
  }

  const summaryResult = await httpGet<Array<TabSummary>>(
    `${state.settings.ferrum_base}/tabs/summaries`
  )
  const db_count = summaryResult.ok ? summaryResult.data.length : 0

  return {
    kind: "PRUNE_COMPLETE",
    pruned_count: result.data.pruned_count,
    db_count,
  }
}

console.log("[tabsched bg] loaded")
