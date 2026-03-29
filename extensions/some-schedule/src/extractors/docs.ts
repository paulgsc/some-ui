/**
 *
 * Extracts structured content from documentation sites.
 *
 * Targets:
 *   doc.rust-lang.org  (The Rust Book, std docs, reference)
 *   docs.rs            (crate documentation)
 *   typst.app/docs     (Typst documentation)
 *   developer.mozilla.org
 *   any other docs-shaped site (Readability fallback)
 *
 * The distinguishing feature of docs pages is that the heading
 * hierarchy IS the content structure — headings are more semantically
 * valuable here than the body text.
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

const DOCS_PATTERNS = [
  /doc\.rust-lang\.org/,
  /docs\.rs/,
  /typst\.app\/docs/,
  /developer\.mozilla\.org/,
  /docs\.python\.org/,
  /devdocs\.io/,
]

export class DocsExtractor implements Extractor {
  name = "docs"

  matches(url: string): boolean {
    return DOCS_PATTERNS.some((p) => p.test(url))
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
    // Title — most doc sites have a good <title> or <h1>
    const h1 = document.querySelector("h1")?.textContent?.trim() ?? ""
    const title = h1 || document.title

    // Main content area — try known selectors before falling back
    const mainEl =
      document.querySelector("main") ??
      document.querySelector("article") ??
      document.querySelector('[role="main"]') ??
      document.querySelector(".content") ??
      document.body

    // Introduction paragraph — first <p> in main content
    const firstPara =
      mainEl.querySelector("p")?.textContent?.trim() ?? metaSummary()

    // All headings in the main content (h1–h3), capped at 20
    // These represent the structure of what's being learned on this page.
    const headingEls = mainEl.querySelectorAll("h1, h2, h3")
    const headings = Array.from(headingEls)
      .map((el) => el.textContent?.trim() ?? "")
      .filter(Boolean)
      .slice(0, 20)

    // Keywords: slugified heading titles (they're the most informative tokens)
    const keywords = headings
      .slice(0, 10)
      .flatMap((h) => h.split(/\s+/).filter((w) => w.length > 3))
      .map(slugify)
      .filter(Boolean)
      .slice(0, 30)

    // Rust-specific: extract module/struct/fn names from doc.rust-lang.org
    let rustMeta: Record<string, string | number | boolean> = {}
    if (/doc\.rust-lang\.org/.test(window.location.href)) {
      const itemNames = Array.from(
        document.querySelectorAll(".item-name, .fqn")
      )
        .map((el) => el.textContent?.trim() ?? "")
        .filter(Boolean)
        .slice(0, 10)
      if (itemNames.length > 0) {
        rustMeta = { item_names: itemNames.join(", ") }
        keywords.push(...itemNames.map(slugify))
      }
    }

    return {
      kind: "docs",
      title,
      summary: truncate(firstPara, 500),
      headings,
      keywords: [...new Set(keywords)].slice(0, 30),
      raw_length: rawLength(),
      meta: { ...rustMeta },
    }
  }
}

function fallback(): ExtractedContent {
  return {
    kind: "docs",
    title: document.title,
    summary: metaSummary(),
    headings: extractHeadings(),
    keywords: [],
    raw_length: rawLength(),
    meta: { fallback: true },
  }
}
