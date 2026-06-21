/**
 *
 * The extractor registry.
 *
 * Extractors are tested in registration order. The first one whose
 * `matches(url)` returns true is used. ArticleExtractor (the fallback)
 * must always be last.
 *
 * Adding a new extractor = import it here, push it before ArticleExtractor.
 */

import { ArticleExtractor } from "./article"
import type { Extractor, ExtractResult } from "./base"
import { ChatExtractor } from "./chat"
import { DocsExtractor } from "./docs"
import { GithubExtractor } from "./github"
import { JobBoardExtractor } from "./job-board"
import { LeetcodeExtractor } from "./leetcode"

const REGISTRY: Array<Extractor> = [
  new LeetcodeExtractor(),
  new GithubExtractor(),
  new DocsExtractor(),
  new ChatExtractor(),
  new JobBoardExtractor(),
  // ArticleExtractor must be last — its matches() always returns true
  new ArticleExtractor(),
]

/**
 * Select and run the appropriate extractor for `url`.
 * Always resolves — never rejects.
 */
export async function extractForUrl(
  url: string
): Promise<ExtractResult & { extractorName: string }> {
  const extractor = REGISTRY.find((e) => e.matches(url))

  if (!extractor) {
    return {
      ok: false,
      error: "no matching extractor",
      extractorName: "none",
      content: {
        kind: "unknown",
        title: document.title,
        summary: "",
        headings: [],
        keywords: [],
        raw_length: 0,
        meta: {},
      },
    }
  }

  const result = await extractor.extract()
  return { ...result, extractorName: extractor.name }
}
