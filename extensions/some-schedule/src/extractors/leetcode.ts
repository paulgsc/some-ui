/**
 *
 * Extracts structured content from a LeetCode problem page.
 *
 * Target: leetcode.com/problems/{slug}/
 *
 * What we want:
 * - Problem title
 * - Difficulty + topic tags (keywords)
 * - Problem description text (first 500 chars)
 * - Constraints block (important for DSA pattern recognition)
 */

import type { ExtractedContent } from "@schedule/shared/types"

import type { Extractor, ExtractResult } from "./base"
import { extractHeadings, metaSummary, rawLength, truncate } from "./base"

export class LeetcodeExtractor implements Extractor {
  name = "leetcode"

  matches(url: string): boolean {
    return /leetcode\.com\/problems\//.test(url)
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
    // Title — LeetCode renders it as the first h1 or in the tab title.
    const h1 = document.querySelector("h1")?.textContent?.trim() ?? ""
    const title = h1 || document.title.replace(" - LeetCode", "").trim()

    // Difficulty badge
    const difficulty =
      document.querySelector('[class*="difficulty"]')?.textContent?.trim() ?? ""

    // Topic tags — rendered as pill badges in the sidebar
    const tagEls = document.querySelectorAll('[class*="topic-tag"]')
    const tags = Array.from(tagEls)
      .map((el) => el.textContent?.trim() ?? "")
      .filter(Boolean)
      .slice(0, 15)

    // Problem description — LeetCode renders it inside a specific div.
    // The class name is obfuscated but the content is inside a div that
    // follows the difficulty section and contains <p> tags.
    const descEl =
      document.querySelector('[data-track-load="description_content"]') ??
      document.querySelector(".question-content") ??
      document.querySelector('[class*="description"]')

    const descText = descEl?.textContent?.trim() ?? metaSummary()

    // Constraints section — usually a <ul> near the bottom of the description
    const constraintsEl = descEl?.querySelector("ul:last-of-type")
    const constraints = constraintsEl?.textContent?.trim() ?? ""

    const summaryParts = [
      descText,
      constraints ? `Constraints: ${constraints}` : "",
    ]
      .filter(Boolean)
      .join(" ")

    return {
      kind: "problem",
      title,
      summary: truncate(summaryParts, 500),
      headings: extractHeadings(5),
      keywords: [difficulty.toLowerCase(), ...tags].filter(Boolean),
      raw_length: rawLength(),
      meta: { difficulty, tag_count: tags.length },
    }
  }
}

function fallback(): ExtractedContent {
  return {
    kind: "problem",
    title: document.title,
    summary: metaSummary(),
    headings: [],
    keywords: [],
    raw_length: rawLength(),
    meta: { fallback: true },
  }
}
