/**
 *
 * Extracts structured content from a GitHub repository page.
 *
 * Target: github.com/{owner}/{repo}
 *
 * What we want:
 * - Repo name + description
 * - Topic tags (GitHub renders these on the repo page)
 * - First 500 chars of README
 * - Top-level directory listing (signals project structure)
 * - Language badge
 */

import type { ExtractedContent } from "@schedule/shared/types"

import type { Extractor, ExtractResult } from "./base"
import { metaSummary, rawLength, truncate } from "./base"

export class GithubExtractor implements Extractor {
  name = "github"

  matches(url: string): boolean {
    // Match repo root — not issues, PRs, or sub-paths
    return /github\.com\/[^/]+\/[^/]+\/?$/.test(url)
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
    // Repo name
    const titleEl = document.querySelector('[itemprop="name"]')
    const repoName = titleEl?.textContent?.trim() ?? ""
    const owner =
      document
        .querySelector('[itemprop="author"] [itemprop="name"]')
        ?.textContent?.trim() ?? ""
    const title = owner && repoName ? `${owner}/${repoName}` : document.title

    // Description
    const descEl =
      document.querySelector('[data-testid="repository-description"]') ??
      document.querySelector('p[itemprop="description"]')
    const description = descEl?.textContent?.trim() ?? metaSummary()

    // Topic tags
    const topicEls = document.querySelectorAll(
      '[data-testid="topic"] a, .topic-tag'
    )
    const topics = Array.from(topicEls)
      .map((el) => el.textContent?.trim() ?? "")
      .filter(Boolean)
      .slice(0, 20)

    // README content (first 500 chars of rendered text)
    const readmeEl =
      document.querySelector('[data-testid="readme"] article') ??
      document.querySelector("#readme article")
    const readmeText = readmeEl?.textContent?.trim() ?? ""

    // Top-level directory names (signals what kind of project this is)
    const fileRows = document.querySelectorAll(
      '[aria-label="Files"] .react-directory-row, .js-navigation-item'
    )
    const topLevelDirs = Array.from(fileRows)
      .map((el) => el.querySelector("a")?.textContent?.trim() ?? "")
      .filter(Boolean)
      .slice(0, 12)

    // Primary language
    const langEl = document.querySelector('[itemprop="programmingLanguage"]')
    const language = langEl?.textContent?.trim() ?? ""

    const summaryParts = [
      description,
      readmeText ? `README: ${readmeText}` : "",
    ]
      .filter(Boolean)
      .join(" ")

    return {
      kind: "repo",
      title,
      summary: truncate(summaryParts, 500),
      headings: topLevelDirs, // directory structure as "headings"
      keywords: [language.toLowerCase(), ...topics].filter(Boolean),
      raw_length: rawLength(),
      meta: {
        owner,
        repo: repoName,
        language,
        topic_count: topics.length,
      },
    }
  }
}

function fallback(): ExtractedContent {
  return {
    kind: "repo",
    title: document.title,
    summary: metaSummary(),
    headings: [],
    keywords: [],
    raw_length: rawLength(),
    meta: { fallback: true },
  }
}
