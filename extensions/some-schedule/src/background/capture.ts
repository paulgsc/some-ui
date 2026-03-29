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

import { classifyDomain, shouldCapture } from "../shared/domain-classifier"
import { isoNow, uuid } from "../shared/id"
import type {
  CaptureSession,
  CaptureSettings,
  MessageFromContent,
  MessageToContent,
  SkippedTab,
  TabCapture,
} from "../shared/types"

export type ProgressCallback = (completed: number, total: number) => void

/**
 * Capture all open tabs.
 *
 * @param settings  User-configured capture settings
 * @param onProgress  Called after each tab completes (for popup progress bar)
 */
export async function captureAllTabs(
  settings: CaptureSettings,
  onProgress?: ProgressCallback
): Promise<CaptureSession> {
  const allTabs = await chrome.tabs.query({})
  const capturedAt = isoNow()

  const captures: TabCapture[] = []
  const skipped: SkippedTab[] = []

  // Partition tabs into capturable and skipped before starting
  const capturable = allTabs.filter((tab) => {
    if (!tab.url || !tab.id) {
      if (tab.id) {
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

  // Process tabs sequentially to avoid flooding the content script
  // message bus. A tab that is slow to respond would block the queue,
  // but the timeout prevents indefinite blocking.
  for (const tab of capturable) {
    const tabId = tab.id!
    const url = tab.url!

    const capture = await captureTab(tab, settings)
    captures.push(capture)

    completed++
    onProgress?.(completed, total)
  }

  return {
    session_id: uuid(),
    captured_at: capturedAt,
    extension_version: chrome.runtime.getManifest().version,
    total_open_tabs: allTabs.length,
    captures,
    skipped,
  }
}

/**
 * Capture a single tab.
 * Always resolves — failure is encoded in the TabCapture result.
 */
async function captureTab(
  tab: chrome.tabs.Tab,
  settings: CaptureSettings
): Promise<TabCapture> {
  const tabId = tab.id!
  const url = tab.url!
  const domain = classifyDomain(url)

  const base = {
    tab_id: tabId,
    url,
    tab_title: tab.title ?? "",
    captured_at: isoNow(),
    domain,
  }

  try {
    const content = await extractWithTimeout(
      tabId,
      settings.extraction_timeout_ms
    )
    return {
      ...base,
      extractor: content.extractorName ?? "unknown",
      content: content.content,
      extraction_ok: content.ok,
      extraction_error: content.ok ? undefined : content.error,
    }
  } catch (e) {
    const error = String(e)
    const reason = error.includes("timeout")
      ? "extraction_timeout"
      : "scripting_error"

    // Add to a local skipped list — we don't have access to the outer
    // skipped array here, so we encode failure in the capture itself.
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

/**
 * Send EXTRACT_CONTENT to tab `tabId` and wait for response,
 * with a hard timeout.
 */
async function extractWithTimeout(
  tabId: number,
  timeoutMs: number
): Promise<{
  ok: boolean
  content: any
  extractorName?: string
  error?: string
}> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`timeout after ${timeoutMs}ms`))
    }, timeoutMs)

    const message: MessageToContent = { kind: "EXTRACT_CONTENT" }

    chrome.tabs.sendMessage(
      tabId,
      message,
      (response: MessageFromContent | undefined) => {
        clearTimeout(timer)

        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }

        if (!response) {
          reject(new Error("no response from content script"))
          return
        }

        if (response.kind === "EXTRACTED") {
          resolve({ ok: true, content: response.content })
        } else {
          resolve({ ok: false, content: null, error: response.error })
        }
      }
    )
  })
}
