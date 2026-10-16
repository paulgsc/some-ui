import { FIELD_SELECTORS, LOCKUP_TEXT } from "@censor/lib/content/layout/fields"
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
    channelName: firstText(el, FIELD_SELECTORS.channelName),
    duration: firstText(el, FIELD_SELECTORS.duration),
  }
}

/**
 * A lockup's second metadata row reads "1.2M views · 3 days ago" as separate
 * text runs, and the age is usually the last of them. Positional, so low
 * confidence: on a row with no date the last run is the view count, which the
 * estimator does not recognize and holds as unverified (#1384).
 */
function lockupUploadDate(el: HTMLElement): string | null {
  const runs = el.querySelectorAll(`span${LOCKUP_TEXT}`)
  const last = runs[runs.length - 1]
  return last?.textContent.trim() || null
}
