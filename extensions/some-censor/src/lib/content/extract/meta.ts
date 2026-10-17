import { FIELD_SELECTORS } from "@censor/lib/content/layout/fields"
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
  const [polymer, bem, camel] = FIELD_SELECTORS.uploadDate
  return (
    (polymer === undefined ? null : text(el, polymer)) ??
    lastRun(el, camel, (run) => run.getAttribute("aria-label")) ??
    lastRun(el, bem, (run) => run.textContent)
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
 * runs, and the age is usually the last of them. Positional, so low
 * confidence: on a row with no date the last run is the view count, which the
 * estimator does not recognize and holds as unverified (#1384).
 *
 * The camelCase run shows a compact age ("8d ago") and is read by its
 * `aria-label` ("8 days ago") instead: the estimator knows the long form, and
 * a compact "5m" cannot say whether it means minutes or months.
 */
function lastRun(
  el: HTMLElement,
  selector: string | undefined,
  read: (run: Element) => string | null
): string | null {
  if (selector === undefined) return null
  const runs = el.querySelectorAll(selector)
  const last = runs[runs.length - 1]
  return (last === undefined ? null : read(last)?.trim()) || null
}
