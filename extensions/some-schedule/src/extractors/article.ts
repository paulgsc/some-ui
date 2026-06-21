/**
 *
 * Generic article extractor — the fallback for any URL that doesn't
 * match a more specific extractor.
 *
 * Strategy:
 * 1. Try to find a <main> or <article> content block
 * 2. Extract the first 500 chars of meaningful text from it
 * 3. Extract h1–h3 headings
 * 4. Extract noun-phrase keywords from the first three paragraphs
 *
 * This is intentionally simple — the specific extractors cover the
 * high-value cases. The article extractor just needs to not produce
 * noise.
 */

import type { ExtractedContent } from "@schedule/shared/types"

import type { Extractor, ExtractResult } from "./base"
import {
  extractHeadings,
  metaSummary,
  rawLength,
  slugify,
  truncate,
} from "./base"

export class ArticleExtractor implements Extractor {
  name = "article"

  // Matches everything — this is the fallback, must be registered last
  matches(_url: string): boolean {
    return true
  }

  async extract(): Promise<ExtractResult> {
    try {
      const content = this.extractContent()
      return { ok: true, content }
    } catch (e) {
      return {
        ok: false,
        error: String(e),
        content: fallback(),
      }
    }
  }

  private extractContent(): ExtractedContent {
    const title =
      document.querySelector("h1")?.textContent?.trim() ?? document.title

    // Find the most likely content container
    const mainEl =
      document.querySelector("main") ??
      document.querySelector("article") ??
      document.querySelector('[role="main"]') ??
      document.querySelector(".post-content, .entry-content, .article-body") ??
      document.body

    // First 3 paragraphs of meaningful text
    const paragraphs = Array.from(mainEl.querySelectorAll("p"))
      .map((p) => p.textContent?.trim() ?? "")
      .filter((p) => p.length > 50) // ignore nav/caption noise
      .slice(0, 3)

    const bodyText = paragraphs.join(" ")
    const summary = truncate(bodyText || metaSummary(), 500)

    const headings = extractHeadings(15)

    // Simple keyword extraction: words >5 chars from headings + first para
    const sourceText = [headings.join(" "), paragraphs[0] ?? ""].join(" ")
    const keywords = sourceText
      .split(/\W+/)
      .filter((w) => w.length > 5)
      .map((w) => slugify(w))
      .filter(Boolean)
      .slice(0, 25)

    return {
      kind: "article",
      title,
      summary,
      headings,
      keywords: [...new Set(keywords)],
      raw_length: rawLength(),
      meta: {
        paragraph_count: paragraphs.length,
        has_main: Boolean(document.querySelector("main")),
      },
    }
  }
}

function fallback(): ExtractedContent {
  return {
    kind: "article",
    title: document.title,
    summary: metaSummary(),
    headings: [],
    keywords: [],
    raw_length: rawLength(),
    meta: { fallback: true },
  }
}
