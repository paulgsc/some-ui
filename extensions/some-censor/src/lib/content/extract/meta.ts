import {
  FIELD_SELECTORS,
  LOCKUP_DATE_RUNS,
  PLAIN_CHANNEL_RUN,
} from "@censor/lib/content/layout/fields"
import type { MetaData } from "@censor/types/states"

/**
 * Extract channel name and duration from a renderer element.
 * All fields nullable — caller decides what to show when absent.
 *
 * The selectors live in `layout/fields.ts`, shared with the layout crawler's
 * fingerprint so the checked-in table describes what this actually reads.
 * Each field is tried against the Polymer renderers first and the Lit-era
 * lockups second; see that module for why the lockup side matches on
 * class substrings rather than position.
 */

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

/**
 * The raw upload-date run, exactly as YouTube rendered it.
 *
 * Kept apart from {@link extractMeta} because it is evidence, not
 * presentation: it goes into the observation and the maturity estimate, and
 * never into anything a veil renders (QD4). Still pure (E1).
 */
export function extractUploadDate(el: HTMLElement): string | null {
  const [polymer] = FIELD_SELECTORS.uploadDate
  return (
    (polymer === undefined ? null : text(el, polymer)) ?? lockupUploadDate(el)
  )
}

export function extractMeta(el: HTMLElement): MetaData {
  return {
    channelName: channelName(el),
    duration: firstText(el, FIELD_SELECTORS.duration),
  }
}

/** The channel's display name. Also `channel-id.ts`'s last resort. */
export function channelName(el: HTMLElement): string | null {
  return firstText(
    el,
    isCollection(el)
      ? FIELD_SELECTORS.channelName.filter((s) => s !== PLAIN_CHANNEL_RUN)
      : FIELD_SELECTORS.channelName
  )
}

/**
 * A lockup's second metadata row reads "1.2M views · 3 days ago" as separate
 * runs, and the age is usually the last of them. Positional, so low
 * confidence: on a row with no date the last run is the view count, which the
 * estimator does not recognize and holds as unverified (#1384).
 *
 * A run holding a link, or held by one, is never read: that is the channel,
 * and YouTube places its row before or after the date's. Read as a date, a
 * channel named like an age ("10 years ago") would admit a fresh video.
 *
 * The camelCase run is read by its `aria-label` ("8 days ago"), not its compact
 * text ("8d ago"): the estimator knows the long form, and a compact "5m"
 * cannot say whether it means minutes or months.
 */
function lockupUploadDate(el: HTMLElement): string | null {
  const runs = [...el.querySelectorAll(LOCKUP_DATE_RUNS.join(", "))].filter(
    (run) => run.querySelector("a") === null && run.closest("a") === null
  )
  const last = runs[runs.length - 1]
  if (last === undefined) return null
  return (last.getAttribute("aria-label") ?? last.textContent).trim() || null
}

/** The catalogue tags that only ever render a Short. */
const SHORTS_TAGS = new Set([
  "ytd-reel-item-renderer",
  "ytm-shorts-lockup-view-model",
  "ytm-shorts-lockup-view-model-v2",
])

/**
 * Is `el` a Short? A Shorts renderer, or any card linking to `/shorts/`: a
 * search result renders a Short in the ordinary video renderer. Over-holding
 * is the safe direction (QD3), so one Shorts link is enough.
 */
export function extractIsShort(el: HTMLElement): boolean {
  return (
    SHORTS_TAGS.has(el.tagName.toLowerCase()) ||
    el.querySelector('a[href*="/shorts/"]') !== null
  )
}

/**
 * A lockup for a list rather than one video. Every one in the 2026-10-17
 * captures is a Mix, whose metadata run is an artist list ("A, B and more"),
 * not a channel. Its "Mix" badge is kept out of the duration by `fields.ts`.
 */
function isCollection(el: HTMLElement): boolean {
  return el.querySelector("yt-collection-thumbnail-view-model") !== null
}

/**
 * Can `el`'s markup hold a channel at all? A Shorts lockup has none, and
 * neither does a Mix, so a channel backfill on either waits for nothing
 * (#1848).
 */
export function extractCarriesChannel(el: HTMLElement): boolean {
  return !SHORTS_TAGS.has(el.tagName.toLowerCase()) && !isCollection(el)
}
