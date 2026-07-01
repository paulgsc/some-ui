/**
 *
 * Base interface all extractors must implement.
 *
 * Extractors run inside content scripts — they have full DOM access
 * but no Node.js APIs. Each extractor is responsible for one content
 * kind and exposes a `matches(url)` predicate so the dispatcher can
 * select the right one.
 *
 * Extractors must:
 * - Never throw (return ExtractResult with ok=false on failure)
 * - Cap summary at 500 chars
 * - Cap headings at 20 entries
 * - Cap keywords at 30 entries
 * - Complete within 2000ms (the background enforces a hard timeout)
 */

import type { ExtractedContent } from "@schedule/shared/types"

export type ExtractResult = {
  ok: boolean
  content: ExtractedContent
  error?: string
}

export type Extractor = {
  /** Unique name used in TabCapture.extractor field. */
  name: string

  /** Returns true if this extractor should handle the given URL. */
  matches(url: string): boolean

  /**
   * Extract structured content from the current document.
   * Must not throw. Must resolve within 2000ms.
   */
  extract(): Promise<ExtractResult>
}

// ── Shared utilities available to all extractors ───────────────────────────

/** Truncate a string to maxLen, appending '…' if truncated. */
export function truncate(s: string, maxLen: number): string {
  if (!s) return ""
  const clean = s.trim().replace(/\s+/g, " ")
  return clean.length <= maxLen ? clean : `${clean.slice(0, maxLen - 1)}…`
}

/** Extract h1–h3 text from the document, deduped, max 20. */
export function extractHeadings(max = 20): Array<string> {
  const seen = new Set<string>()
  const results: Array<string> = []
  const nodes = document.querySelectorAll("h1, h2, h3")
  for (const node of nodes) {
    const text = node.textContent?.trim() ?? ""
    if (text && !seen.has(text)) {
      seen.add(text)
      results.push(text)
      if (results.length >= max) break
    }
  }
  return results
}

/** Slugify a string into a keyword token. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Extract meta description or og:description as a summary fallback.
 * Returns empty string if neither exists.
 */
export function metaSummary(): string {
  const og = document.querySelector<HTMLMetaElement>(
    'meta[property="og:description"]'
  )
  if (og?.content) return og.content.trim()
  const desc = document.querySelector<HTMLMetaElement>(
    'meta[name="description"]'
  )
  return desc?.content.trim() ?? ""
}

/** Extract the raw byte length of document.body.innerHTML. */
export function rawLength(): number {
  return new Blob([document.body.innerHTML]).size
}
