/**
 *
 * Content script — injected into every page by the manifest.
 *
 * Listens for EXTRACT_CONTENT from the background page, runs the
 * extractor registry, and replies via the message channel.
 *
 * Firefox MV2: browser.runtime.onMessage listeners may return a Promise
 * directly. This is cleaner than the sendResponse callback and avoids
 * keeping the channel open with `return true`.
 */

import { extractForUrl } from "@schedule/extractors/registry"
import type {
  MessageFromContent,
  MessageToContent,
} from "@schedule/shared/types"

browser.runtime.onMessage.addListener(
  (message: unknown): Promise<MessageFromContent> | undefined => {
    const msg = message as MessageToContent
    if (msg.kind !== "EXTRACT_CONTENT") return undefined

    return extractForUrl(window.location.href).then(
      (result): MessageFromContent => {
        if (result.ok) {
          return { kind: "EXTRACTED", content: result.content }
        }
        return {
          kind: "EXTRACT_FAILED",
          error: result.error ?? "extraction failed",
        }
      }
    )
  }
)
