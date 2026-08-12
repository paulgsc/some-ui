import type { MetaData } from "@censor/types/states"

/**
 * Extract channel name, duration, and upload date from a renderer element.
 * All fields nullable — caller decides what to show when absent.
 *
 * Each field is tried against the Polymer renderers first and the Lit-era
 * lockups second (#973). The two generations share no markup, and the lockup
 * side is deliberately matched on class *substrings* and element *kind* rather
 * than on position: YouTube versions these class names (`…__metadata-row` gains
 * modifiers) and reorders the rows between surfaces, so `:first-child` /
 * `:nth-child()` selectors written against one shelf silently return the wrong
 * row on another. What is stable is that the channel is the row rendered as a
 * link and the upload date is the last text run of the row that is not.
 */

const LOCKUP_TEXT = '[class*="yt-content-metadata-view-model__metadata-text"]'

function text(el: ParentNode, selector: string): string | null {
  return el.querySelector(selector)?.textContent.trim() ?? null
}

/** First non-empty match, in selector order. */
function firstText(
  el: ParentNode,
  selectors: ReadonlyArray<string>
): string | null {
  for (const selector of selectors) {
    const value = text(el, selector)
    if (value) return value
  }
  return null
}

export function extractMeta(el: HTMLElement): MetaData {
  return {
    channelName: firstText(el, [
      "ytd-channel-name yt-formatted-string",
      "#channel-name yt-formatted-string",
      // The channel is the metadata run that is a link; view counts and dates
      // are plain text.
      `a${LOCKUP_TEXT}`,
    ]),
    duration: firstText(el, [
      "span.ytd-thumbnail-overlay-time-status-renderer",
      '[class*="ThumbnailOverlayBadgeViewModel"] [class*="badge-shape"]',
    ]),
    uploadDate:
      text(el, "#metadata-line span:nth-child(2)") ?? lockupUploadDate(el),
  }
}

/**
 * A lockup's second metadata row reads "1.2M views · 3 days ago" as separate
 * text runs. The age is the last of them; the count is not worth showing on a
 * card whose entire purpose is to withhold signal about how popular it is.
 */
function lockupUploadDate(el: HTMLElement): string | null {
  const runs = el.querySelectorAll(`span${LOCKUP_TEXT}`)
  const last = runs[runs.length - 1]
  return last?.textContent.trim() || null
}
