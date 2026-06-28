import type { MetaData } from "@censor/types/states"

/**
 * Extract channel name, duration, and upload date from a renderer element.
 * All fields nullable — caller decides what to show when absent.
 */
function text(el: ParentNode, selector: string): string | null {
  return el.querySelector(selector)?.textContent.trim() ?? null
}

export function extractMeta(el: HTMLElement): MetaData {
  return {
    channelName: text(
      el,
      "ytd-channel-name yt-formatted-string, #channel-name yt-formatted-string"
    ),
    duration: text(el, "span.ytd-thumbnail-overlay-time-status-renderer"),
    uploadDate: text(el, "#metadata-line span:nth-child(2)"),
  }
}
