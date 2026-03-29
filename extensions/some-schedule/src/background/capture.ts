/**
 *
 * Capture orchestration.
 *
 * Responsibilities:
 * - Query all open tabs
 * - Apply ignore filter and domain classifier
 * - Send EXTRACT_CONTENT to each tab's content script
 * - Enforce per-tab timeout
 * - Collect results into a CaptureSession
 *
 * This module has no UI concerns — it returns a CaptureSession and
 * emits progress notifications. The background service worker calls
 * it; the popup triggers it via the background.
 */

import {
  classifyDomain,
  shouldCapture,
} from "@schedule/shared/domain-classifier"
import { isoNow, uuid } from "@schedule/shared/id"
import type {
  CaptureSession,
  CaptureSettings,
  MessageFromContent,
  MessageToContent,
  SkippedTab,
  TabCapture,
} from "@schedule/shared/types"

export type ProgressCallback = (completed: number, total: number) => void

/**
 * Capture all open tabs.
 *
 * @param settings    User-configured capture settings
 * @param onProgress  Called after each tab completes (for popup progress bar)
 */
export async function captureAllTabs(
  settings: CaptureSettings,
  onProgress?: ProgressCallback
): Promise<CaptureSession> {
  const allTabs = await browser.tabs.query({})
  const capturedAt = isoNow()

  const captures: Array<TabCapture> = []
  const skipped: Array<SkippedTab> = []

  // Partition tabs into capturable and skipped before starting.
  const capturable = allTabs.filter((tab) => {
    if (!tab.url || tab.id == null) {
      if (tab.id != null) {
        skipped.push({ tab_id: tab.id, url: tab.url ?? "", reason: "no_url" })
      }
      return false
    }
    if (!shouldCapture(tab.url, settings.ignore_patterns)) {
      skipped.push({ tab_id: tab.id, url: tab.url, reason: "filtered_domain" })
      return false
    }
    return true
  })

  const total = capturable.length
  let completed = 0

  // Process tabs sequentially — avoids flooding the content script message bus.
  // The per-tab timeout prevents a slow tab from blocking the queue indefinitely.
  for (const tab of capturable) {
    const capture = await captureTab(tab, settings)
    captures.push(capture)

    completed += 1
    if (onProgress !== undefined) {
      onProgress(completed, total)
    }
  }

  return {
    session_id: uuid(),
    captured_at: capturedAt,
    extension_version: browser.runtime.getManifest().version,
    total_open_tabs: allTabs.length,
    captures,
    skipped,
  }
}

/**
 * Capture a single tab.
 * Always resolves — failure is encoded in the returned TabCapture.
 */
async function captureTab(
  tab: browser.tabs.Tab,
  settings: CaptureSettings
): Promise<TabCapture> {
  // Both id and url are guaranteed non-null here — captureAllTabs filters
  // before calling this function.
  const tabId = tab.id as number
  const url = tab.url as string
  const domain = classifyDomain(url)

  const base = {
    tab_id: tabId,
    url,
    tab_title: tab.title ?? "",
    captured_at: isoNow(),
    domain,
  }

  try {
    const result = await extractWithTimeout(
      tabId,
      settings.extraction_timeout_ms
    )
    return {
      ...base,
      extractor: result.extractorName ?? "unknown",
      content: result.content,
      extraction_ok: result.ok,
      extraction_error: result.ok ? undefined : result.error,
    }
  } catch (e) {
    const error = String(e)
    const reason = error.includes("timeout")
      ? "extraction_timeout"
      : "scripting_error"

    return {
      ...base,
      extractor: "none",
      content: {
        kind: "unknown",
        title: tab.title ?? "",
        summary: "",
        headings: [],
        keywords: [],
        raw_length: 0,
        meta: { error, reason },
      },
      extraction_ok: false,
      extraction_error: error,
    }
  }
}

// ── Type for extractWithTimeout result ─────────────────────────────────────

type ExtractResult = {
  ok: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any
  extractorName?: string
  error?: string
}

/**
 * Send EXTRACT_CONTENT to `tabId` and resolve with the content script's
 * response, or reject after `timeoutMs`.
 *
 * Firefox MV2: browser.tabs.sendMessage returns a Promise<any>.
 * We wrap it in our own timeout race rather than using a callback,
 * which avoids the MV2 callback-signature type incompatibility.
 */
async function extractWithTimeout(
  tabId: number,
  timeoutMs: number
): Promise<ExtractResult> {
  const message: MessageToContent = { kind: "EXTRACT_CONTENT" }

  const sendPromise = browser.tabs.sendMessage(
    tabId,
    message
  ) as Promise<MessageFromContent>

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error(`timeout after ${timeoutMs}ms`)),
      timeoutMs
    )
  })

  const response = await Promise.race([sendPromise, timeoutPromise])

  if (response.kind === "EXTRACTED") {
    return { ok: true, content: response.content }
  }
  return { ok: false, content: null, error: response.error }
}
