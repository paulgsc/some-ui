/**
 *
 * Extracts structured content from job listing pages.
 *
 * Targets: LinkedIn, Greenhouse, Lever, Ashby, Wellfound, etc.
 *
 * What we want:
 * - Company name + role title
 * - Role level / seniority (junior, senior, staff, etc.)
 * - Tech keywords from the job description
 * - Location / remote status
 *
 * Job board tabs are typically in the job-search domain, but unlike
 * most other domains they represent prospective work rather than
 * learning material. The pipeline will group these separately from
 * technical learning resources.
 */

import type { ExtractedContent } from "@schedule/shared/types"

import type { Extractor, ExtractResult } from "./base"
import { metaSummary, rawLength, slugify, truncate } from "./base"

const JOB_BOARD_PATTERNS = [
  /linkedin\.com\/jobs/,
  /greenhouse\.io\/jobs/,
  /lever\.co\/[^/]+\/[a-z0-9-]+/,
  /ashbyhq\.com/,
  /wellfound\.com\/jobs/,
  /jobs\./,
  /careers\./,
]

// Seniority signals to extract from title/description
const SENIORITY_TERMS = [
  "junior",
  "mid",
  "senior",
  "staff",
  "principal",
  "lead",
  "director",
  "manager",
  "intern",
  "associate",
  "entry",
]

// Tech keywords commonly found in engineering job descriptions
const TECH_TERMS = [
  "rust",
  "python",
  "typescript",
  "javascript",
  "go",
  "c++",
  "java",
  "aws",
  "gcp",
  "azure",
  "kubernetes",
  "docker",
  "postgres",
  "distributed",
  "backend",
  "frontend",
  "fullstack",
  "infrastructure",
  "ml",
  "llm",
  "systems",
  "embedded",
  "compiler",
]

export class JobBoardExtractor implements Extractor {
  name = "job-board"

  matches(url: string): boolean {
    return JOB_BOARD_PATTERNS.some((p) => p.test(url))
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
    // Role title — usually a prominent h1 or h2
    const titleEl =
      document.querySelector("h1") ??
      document.querySelector('[class*="job-title"]') ??
      document.querySelector('[class*="role-title"]')
    const roleTitle = titleEl?.textContent?.trim() ?? ""

    // Company name
    const companyEl =
      document.querySelector('[class*="company-name"]') ??
      document.querySelector('[data-testid="company-name"]') ??
      document.querySelector('[itemprop="hiringOrganization"]')
    const companyName = companyEl?.textContent?.trim() ?? ""

    const title =
      [companyName, roleTitle].filter(Boolean).join(" — ") || document.title

    // Job description text
    const descEl =
      document.querySelector('[class*="description"]') ??
      document.querySelector('[class*="job-desc"]') ??
      document.querySelector("article")
    const descText = descEl?.textContent?.trim() ?? metaSummary()

    // Extract seniority level
    const fullText = `${roleTitle} ${descText}`.toLowerCase()
    const seniority = SENIORITY_TERMS.filter((t) => fullText.includes(t))

    // Extract tech keywords from description
    const techKeywords = TECH_TERMS.filter((t) => fullText.includes(t))

    // Location / remote status
    const locationEl =
      document.querySelector('[class*="location"]') ??
      document.querySelector('[class*="workplace"]')
    const location = locationEl?.textContent?.trim() ?? ""
    const isRemote = /remote/i.test(fullText)

    const summary = truncate(
      [companyName, roleTitle, location, descText].filter(Boolean).join(" · "),
      500
    )

    return {
      kind: "article", // job listings are article-like
      title,
      summary,
      headings: [roleTitle, companyName].filter(Boolean),
      keywords: [
        ...seniority,
        ...techKeywords,
        isRemote ? "remote" : "onsite",
        slugify(companyName),
      ].filter(Boolean),
      raw_length: rawLength(),
      meta: {
        company: companyName,
        role: roleTitle,
        location,
        remote: isRemote,
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
