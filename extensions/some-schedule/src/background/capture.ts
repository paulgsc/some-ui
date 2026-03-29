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
 *
 * Optimized for: Parallel execution, Tab Suspension, and Timeout Resilience.
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
  SkippedTab,
  TabCapture,
} from "@schedule/shared/types"

export type ProgressCallback = (completed: number, total: number) => void

const LOAD_WAIT_MS = 3_000
const LOAD_POLL_MS = 200
const DEFAULT_EXTRACTION_TIMEOUT = 8_000
const CONCURRENCY_LIMIT = 7 // Process 7 tabs at a time

// ── Utilities ──────────────────────────────────────────────────────────────

/**
 * Ensures a promise settles within a timeframe.
 * Clears timeout immediately on resolution to prevent memory leaks.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  errorMessage: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), ms)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    // @ts-ignore
    clearTimeout(timeoutId)
  })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ── Public Entry Point ─────────────────────────────────────────────────────

export async function captureAllTabs(
  settings: CaptureSettings,
  onProgress?: ProgressCallback
): Promise<CaptureSession> {
  const allTabs = await browser.tabs.query({})
  const capturedAt = isoNow()
  const skipped: Array<SkippedTab> = []

  // 1. Filter tabs early
  const capturableTabs = allTabs.filter((tab) => {
    if (!tab.url || tab.id == null) {
      if (tab.id != null)
        skipped.push({ tab_id: tab.id, url: tab.url ?? "", reason: "no_url" })
      return false
    }
    if (!shouldCapture(tab.url, settings.ignore_patterns)) {
      skipped.push({ tab_id: tab.id, url: tab.url, reason: "filtered_domain" })
      return false
    }
    return true
  })

  const total = capturableTabs.length
  let completedCount = 0

  // 2. Parallel Execution with Concurrency Limit
  // This prevents the extension from choking on 100+ concurrent messages
  const captures: Array<TabCapture> = []
  const queue = [...capturableTabs]

  const workers = Array(Math.min(CONCURRENCY_LIMIT, total))
    .fill(null)
    .map(async () => {
      while (queue.length > 0) {
        const tab = queue.shift()
        if (!tab) break

        try {
          const result = await captureTab(tab, settings)
          captures.push(result)
        } catch (e) {
          captures.push(createErrorCapture(tab, String(e)))
        } finally {
          completedCount++
          onProgress?.(completedCount, total)
        }
      }
    })

  await Promise.all(workers)

  return {
    session_id: uuid(),
    captured_at: capturedAt,
    extension_version: browser.runtime.getManifest().version,
    total_open_tabs: allTabs.length,
    captures,
    skipped,
  }
}

// ── Per-Tab Logic ──────────────────────────────────────────────────────────

async function captureTab(
  tab: browser.tabs.Tab,
  settings: CaptureSettings
): Promise<TabCapture> {
  const tabId = tab.id as number
  const url = tab.url as string
  const timeoutMs = settings.extraction_timeout_ms ?? DEFAULT_EXTRACTION_TIMEOUT

  const base = {
    tab_id: tabId,
    url,
    tab_title: tab.title ?? "",
    captured_at: isoNow(),
    domain: classifyDomain(url),
  }

  try {
    // Check if tab is discarded (suspended)
    // In MV2, discarded tabs won't run content scripts until reloaded
    if ((tab as any).discarded) {
      throw new Error("tab_suspended")
    }

    await waitForTabComplete(tabId, LOAD_WAIT_MS)
    const result = await extractWithFallbackInject(tabId, timeoutMs)

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

// ── Extraction Logic ───────────────────────────────────────────────────────

async function extractWithFallbackInject(
  tabId: number,
  timeoutMs: number
): Promise<{
  ok: boolean
  content: ExtractedContent
  extractorName: string
  error?: string
}> {
  try {
    return await sendExtractMessage(tabId, timeoutMs)
  } catch (err) {
    const msg = String(err)
    if (!isNoReceiverError(msg)) throw err

    // Fallback: Manually inject if script is missing
    try {
      await browser.tabs.executeScript(tabId, { file: "/dist/content.js" })
      await sleep(150) // Wait for listener to mount
      return await sendExtractMessage(tabId, timeoutMs)
    } catch (injectErr) {
      throw new Error(`Injection failed: ${String(injectErr)}`)
    }
  }
}

async function sendExtractMessage(tabId: number, timeoutMs: number) {
  const response = await withTimeout(
    browser.tabs.sendMessage(tabId, {
      kind: "EXTRACT_CONTENT",
    }) as Promise<MessageFromContent>,
    timeoutMs,
    "timeout"
  )

  if (response.kind === "EXTRACTED") {
    return {
      ok: true,
      content: response.content,
      extractorName: response.extractorName ?? "unknown",
    }
  }
  throw new Error(response.error ?? "extraction_failed")
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function waitForTabComplete(tabId: number, maxWaitMs: number) {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    try {
      const tab = await browser.tabs.get(tabId)
      if (tab.status === "complete") return
    } catch {
      return
    }
    await sleep(LOAD_POLL_MS)
  }
}

function isNoReceiverError(msg: string): boolean {
  return /Receiving end does not exist|Could not establish connection|no response/.test(
    msg
  )
}

function createErrorCapture(tab: browser.tabs.Tab, error: string): TabCapture {
  return {
    tab_id: tab.id as number,
    url: tab.url as string,
    tab_title: tab.title ?? "",
    captured_at: isoNow(),
    domain: classifyDomain(tab.url ?? ""),
    extractor: "none",
    content: emptyContent(tab.title ?? "", error, "scripting_error"),
    extraction_ok: false,
    extraction_error: error,
  }
}

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
