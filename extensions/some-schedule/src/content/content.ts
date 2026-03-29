/**
 *
 * Content script — injected into every page by the manifest.
 *
 * Responsibilities:
 * 1. Listen for EXTRACT_CONTENT messages from the background
 * 2. Run the extractor registry against the current document
 * 3. Reply with EXTRACTED or EXTRACT_FAILED
 *
 * The content script is intentionally thin. All extraction logic
 * lives in the extractors/ modules. The content script is just
 * the message bridge.
 *
 * MV3 note: content scripts can use chrome.runtime.sendMessage
 * to reply to the background, but the background initiates via
 * chrome.tabs.sendMessage. We respond via the sendResponse callback
 * provided in the onMessage listener — this keeps the round-trip
 * within a single message exchange and avoids port management.
 */

import { extractForUrl } from "@schedule/extractors/registry"
import type {
  MessageFromContent,
  MessageToContent,
} from "@schedule/shared/types"

chrome.runtime.onMessage.addListener(
  (
    message: MessageToContent,
    _sender,
    sendResponse: (response: MessageFromContent) => void
  ) => {
    if (message.kind !== "EXTRACT_CONTENT") return false

    // Must return true to signal async response
    extractForUrl(window.location.href)
      .then((result) => {
        if (result.ok) {
          sendResponse({ kind: "EXTRACTED", content: result.content })
        } else {
          sendResponse({
            kind: "EXTRACT_FAILED",
            error: result.error ?? "unknown extraction error",
          })
        }
      })
      .catch((e) => {
        sendResponse({ kind: "EXTRACT_FAILED", error: String(e) })
      })

    return true // keep the message channel open for async response
  }
)
