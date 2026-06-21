/**
 *
 * Content script — injected into every page by the manifest.
 *
 * Listens for EXTRACT_CONTENT, runs the extractor registry, replies
 * with EXTRACTED (including extractorName) or EXTRACT_FAILED.
 *
 * Firefox MV2: returning a Promise from onMessage registers an async
 * response without needing `return true` or a sendResponse callback.
 */

import { extractForUrl } from "@schedule/extractors/registry"
import type {
  MessageFromContent,
  MessageToContent,
} from "@schedule/shared/types"

const DEBUG = true

function log(...args: Array<unknown>): void {
  if (DEBUG) console.log("[content-script]", ...args)
}

function logError(...args: Array<unknown>): void {
  console.error("[content-script]", ...args)
}

browser.runtime.onMessage.addListener(
  (message: unknown): Promise<MessageFromContent> | boolean => {
    log("received message:", message)

    const msg = message as MessageToContent

    if (msg.kind !== "EXTRACT_CONTENT") {
      log("ignored message (wrong kind):", msg.kind)
      return true
    }

    const url = window.location.href
    const start = performance.now()

    log("EXTRACT_CONTENT start", { url })

    return extractForUrl(url)
      .then((result): MessageFromContent => {
        const duration = performance.now() - start

        log("extractForUrl result:", result)

        if (result.ok) {
          log("EXTRACTION SUCCESS", {
            extractorName: result.extractorName,
            durationMs: duration.toFixed(2),
          })

          return {
            kind: "EXTRACTED",
            content: result.content,
            extractorName: result.extractorName,
          }
        }

        logError("EXTRACTION FAILED (logical failure)", {
          error: result.error,
          durationMs: duration.toFixed(2),
        })

        return {
          kind: "EXTRACT_FAILED",
          error: result.error ?? "extraction failed",
        }
      })
      .catch((err): MessageFromContent => {
        const duration = performance.now() - start

        logError("EXTRACTION THREW (exception)", {
          error: err,
          durationMs: duration.toFixed(2),
        })

        return {
          kind: "EXTRACT_FAILED",
          error: err instanceof Error ? err.message : String(err),
        }
      })
  }
)

console.log("[tabsched content] loaded")
