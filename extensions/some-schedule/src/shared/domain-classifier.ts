/**
 *
 * Classify a URL into one of the six learning domains.
 *
 * Pure function — no DOM access, no async. Runs in both background
 * service worker and content script contexts.
 *
 * Order matters: rules are tested top-to-bottom. More specific
 * patterns appear before general ones.
 */

import type { Domain } from "./types"

interface DomainRule {
  pattern: RegExp
  domain: Domain
}

const RULES: DomainRule[] = [
  // ── DSA ───────────────────────────────────────────────────────────────
  { pattern: /leetcode\.com/, domain: "dsa" },
  { pattern: /neetcode\.io/, domain: "dsa" },
  { pattern: /codeforces\.com/, domain: "dsa" },
  { pattern: /atcoder\.jp/, domain: "dsa" },
  { pattern: /algs4\.cs\.princeton\.edu/, domain: "dsa" },
  { pattern: /cp-algorithms\.com/, domain: "dsa" },

  // ── Rust ──────────────────────────────────────────────────────────────
  { pattern: /doc\.rust-lang\.org/, domain: "rust" },
  { pattern: /docs\.rs/, domain: "rust" },
  { pattern: /crates\.io/, domain: "rust" },
  { pattern: /rust-lang\.org/, domain: "rust" },

  // ── Math ──────────────────────────────────────────────────────────────
  { pattern: /typst\.app/, domain: "math" },
  { pattern: /3blue1brown\.com/, domain: "math" },
  { pattern: /brilliant\.org/, domain: "math" },
  { pattern: /math\.stackexchange\.com/, domain: "math" },
  { pattern: /arxiv\.org\/abs\/math/, domain: "math" },

  // ── Languages ─────────────────────────────────────────────────────────
  { pattern: /topik/i, domain: "languages" },
  { pattern: /koreanclass101\.com/, domain: "languages" },
  { pattern: /talktomeinkorean\.com/, domain: "languages" },
  { pattern: /anki/, domain: "languages" },
  { pattern: /hsk/i, domain: "languages" },

  // ── Job search ────────────────────────────────────────────────────────
  { pattern: /linkedin\.com\/jobs/, domain: "job-search" },
  { pattern: /greenhouse\.io/, domain: "job-search" },
  { pattern: /lever\.co/, domain: "job-search" },
  { pattern: /ashbyhq\.com/, domain: "job-search" },
  { pattern: /wellfound\.com/, domain: "job-search" },
  { pattern: /careers\./, domain: "job-search" },
  { pattern: /jobs\./, domain: "job-search" },

  // ── OSS ───────────────────────────────────────────────────────────────
  { pattern: /github\.com/, domain: "oss" },
  { pattern: /sourcegraph\.com/, domain: "oss" },

  // ── Claude sessions (domain depends on context — default unknown) ─────
  // Claude chat sessions are manually classified in the CRM since the
  // same URL hosts different skill sessions.
  { pattern: /claude\.ai\/chat/, domain: "unknown" },
  { pattern: /chatgpt\.com/, domain: "unknown" },
]

/**
 * Classify `url` into a learning domain.
 *
 * Returns `'unknown'` if no rule matches. The CRM allows the user to
 * override `'unknown'` classifications — the extension never blocks a
 * tab just because it can't classify it.
 */
export function classifyDomain(url: string): Domain {
  for (const rule of RULES) {
    if (rule.pattern.test(url)) {
      return rule.domain
    }
  }
  return "unknown"
}

/**
 * Returns true if `url` should be captured at all.
 * Tabs matching ignore patterns are skipped before any extraction.
 */
export function shouldCapture(url: string, ignorePatterns: string[]): boolean {
  if (!url || url.length === 0) return false
  for (const pattern of ignorePatterns) {
    if (url.includes(pattern)) return false
  }
  return true
}
