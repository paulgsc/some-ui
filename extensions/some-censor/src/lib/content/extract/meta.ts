import type { MetaData } from "@censor/types/states"

/**
 * Extract channel name, duration, and upload date from a renderer element.
 * All fields nullable — caller decides what to show when absent.
 */
export function extractMeta(el: HTMLElement): MetaData {
  /* eslint-disable @typescript-eslint/no-unnecessary-condition */
  const channelName =
    el
      .querySelector(
        "ytd-channel-name yt-formatted-string, #channel-name yt-formatted-string"
      )
      ?.textContent?.trim() ?? null

  const duration =
    el
      .querySelector("span.ytd-thumbnail-overlay-time-status-renderer")
      ?.textContent?.trim() ?? null

  const uploadDate =
    el.querySelector("#metadata-line span:nth-child(2)")?.textContent?.trim() ??
    null
  /* eslint-enable @typescript-eslint/no-unnecessary-condition */

  return { channelName, duration, uploadDate }
}
