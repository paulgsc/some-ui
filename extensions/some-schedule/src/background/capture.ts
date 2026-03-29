/**
 *
 * Capture orchestration — Firefox MV2 background page.
 *
 * Data flow (revised):
 *
 *   background
 *     ├─ sends EXTRACT_CONTENT  →  content script
 *     ├─ receives ExtractedContent  ←  content script
 *     └─ POSTs CaptureSession  →  localhost pipeline endpoint
 *
 * Nothing large is written to browser.storage.local. The pipeline
 * endpoint receives the full payload; extension storage holds only
 * settings and lightweight run metadata.
 *
 * "Receiving end does not exist" handling:
 *
 *   The error fires when no content script is registered on the target
 *   tab. Three causes:
 *     (a) Tab is still loading — we check tab.status === 'complete' first.
 *     (b) Privileged page (moz-extension://, about:, etc.) — filtered by
 *         shouldCapture before we get here.
 *     (c) Content script failed to register (rare parse/injection error).
 *
 *   For (a) we wait up to LOAD_WAIT_MS for the tab to finish loading,
 *   then attempt injection. For (c) we use tabs.executeScript to inject
 *   the content script programmatically before re-sending, once. If that
 *   also fails the tab is recorded as scripting_error and skipped.
 */

import {
  classifyDomain,
  shouldCapture,
} from "@schedule/shared/domain-classifier"
import { isoNow, uuid } from "@schedule/shared/id"
import type {
  CaptureSession,
  CaptureSettings,
  ExtractedContent,
  MessageFromContent,
  MessageToContent,
  SkippedTab,
  TabCapture,
} from "@schedule/shared/types"

export type ProgressCallback = (completed: number, total: number) => void

/** How long to wait for a loading tab before giving up. */
const LOAD_WAIT_MS = 3_000
/** How long to poll when waiting for tab.status === 'complete'. */
const LOAD_POLL_MS = 200

// ── Public entry point ─────────────────────────────────────────────────────

/**
 * Capture all open tabs and POST the result to the pipeline endpoint.
 *
 * Returns a lightweight summary (no content payloads) for the popup to
 * display. The full CaptureSession is only ever held in memory and sent
 * to the endpoint — it is never written to browser.storage.
 */
export async function captureAllTabs(
  settings: CaptureSettings,
  onProgress?: ProgressCallback
): Promise<CaptureSession> {
  const allTabs = await browser.tabs.query({})
  const capturedAt = isoNow()

  const captures: Array<TabCapture> = []
  const skipped: Array<SkippedTab> = []

  // Partition: skip tabs we cannot or should not capture.
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

// ── Per-tab capture ────────────────────────────────────────────────────────

async function captureTab(
  tab: browser.tabs.Tab,
  settings: CaptureSettings
): Promise<TabCapture> {
  const tabId = tab.id as number
  const url = tab.url as string
  const domain = classifyDomain(url)

  const base: Omit<
    TabCapture,
    "extractor" | "content" | "extraction_ok" | "extraction_error"
  > = {
    tab_id: tabId,
    url,
    tab_title: tab.title ?? "",
    captured_at: isoNow(),
    domain,
  }

  // Wait for tab to finish loading before attempting message send.
  // Avoids "Receiving end does not exist" for tabs that are mid-load.
  await waitForTabComplete(tabId, LOAD_WAIT_MS)

  try {
    const result = await extractWithFallbackInject(
      tabId,
      settings.extraction_timeout_ms
    )
    return {
      ...base,
      extractor: result.extractorName,
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
      content: emptyContent(tab.title ?? "", error, reason),
      extraction_ok: false,
      extraction_error: error,
    }
  }
}

// ── Tab load waiting ───────────────────────────────────────────────────────

/**
 * Poll tab.status until 'complete' or until `maxWaitMs` elapses.
 * Resolves either way — a tab that never finishes loading will still
 * attempt extraction; it will fail gracefully via the timeout.
 */
async function waitForTabComplete(
  tabId: number,
  maxWaitMs: number
): Promise<void> {
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    try {
      const tab = await browser.tabs.get(tabId)
      if (tab.status === "complete") return
    } catch {
      // Tab may have been closed — stop waiting.
      return
    }
    await sleep(LOAD_POLL_MS)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── Extraction with fallback injection ────────────────────────────────────

type ExtractAttemptResult = {
  ok: boolean
  content: ExtractedContent
  extractorName: string
  error?: string
}

/**
 * Try to extract content from `tabId`.
 *
 * Strategy:
 * 1. Send EXTRACT_CONTENT message — succeeds if content script is
 *    already registered.
 * 2. If that throws "Receiving end does not exist", use
 *    tabs.executeScript to inject the content script, then retry once.
 * 3. If still failing, throw — caller records as scripting_error.
 */
async function extractWithFallbackInject(
  tabId: number,
  timeoutMs: number
): Promise<ExtractAttemptResult> {
  try {
    return await sendExtractMessage(tabId, timeoutMs)
  } catch (firstError) {
    const msg = String(firstError)

    // Only attempt injection recovery for the "no receiver" error.
    // Other errors (timeouts, etc.) are re-thrown immediately.
    if (!isNoReceiverError(msg)) throw firstError

    // Inject the content script programmatically (MV2: tabs.executeScript).
    try {
      await browser.tabs.executeScript(tabId, { file: "/dist/content.js" })
    } catch (injectError) {
      // Injection failed (e.g. privileged page) — rethrow original error.
      throw new Error(
        `injection failed: ${String(injectError)}; original: ${msg}`
      )
    }

    // Brief pause for the content script's onMessage listener to register.
    await sleep(100)

    // One retry — if this also throws, propagate to caller.
    return await sendExtractMessage(tabId, timeoutMs)
  }
}

/**
 * Returns true if the error message matches the Firefox "no receiver" pattern.
 */
function isNoReceiverError(msg: string): boolean {
  return (
    msg.includes("Could not establish connection") ||
    msg.includes("Receiving end does not exist") ||
    msg.includes("no response from")
  )
}

/**
 * Send EXTRACT_CONTENT to the content script and race against a timeout.
 */
async function sendExtractMessage(
  tabId: number,
  timeoutMs: number
): Promise<ExtractAttemptResult> {
  const message: MessageToContent = { kind: "EXTRACT_CONTENT" }

  const sendPromise = browser.tabs.sendMessage(
    tabId,
    message
  ) as Promise<MessageFromContent>

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`timeout after ${timeoutMs}ms`)),
      timeoutMs
    )
  )

  const response = await Promise.race([sendPromise, timeoutPromise])

  if (response.kind === "EXTRACTED") {
    return {
      ok: true,
      content: response.content,
      extractorName: response.extractorName ?? "unknown",
    }
  }

  return {
    ok: false,
    content: emptyContent(
      "",
      response.error ?? "extract failed",
      "scripting_error"
    ),
    extractorName: "none",
    error: response.error,
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function emptyContent(
  title: string,
  error: string,
  reason: string
): ExtractedContent {
  return {
    kind: "unknown",
    title,
    summary: "",
    headings: [],
    keywords: [],
    raw_length: 0,
    meta: { error, reason },
  }
}
