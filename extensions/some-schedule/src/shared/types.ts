/**
 *
 * The canonical type contract for the tabsched capture pipeline.
 *
 * Everything — extension, content scripts, extractors, and the
 * downstream LLM pipeline — speaks this shape. Changing a type here
 * is the only place a breaking change should ever occur.
 *
 * Dependency direction:
 *   extractors → types
 *   content    → types
 *   background → types
 *   pipeline   → types
 *   popup      → types
 *   (types depends on nothing)
 */

// ── Domain classification ──────────────────────────────────────────────────

export type Domain =
  | "math"
  | "rust"
  | "dsa"
  | "languages"
  | "job-search"
  | "oss"
  | "unknown"

// ── Content kinds ──────────────────────────────────────────────────────────
//
// Each kind corresponds to a distinct extraction strategy. The extractor
// that runs determines the kind tag in the output.

export type ContentKind =
  | "article" // generic readable web page (Readability fallback)
  | "problem" // LeetCode / competitive programming problem
  | "repo" // GitHub repository
  | "pdf" // PDF viewer tab
  | "docs" // Documentation site (MDN, typst.app, doc.rust-lang.org, etc.)
  | "chat" // Claude / ChatGPT session tab
  | "video" // YouTube
  | "job-board" // LinkedIn, Greenhouse, Lever, etc.
  | "unknown" // extractor could not determine kind

// ── Extracted content ──────────────────────────────────────────────────────
//
// The normalised output of any extractor. This is what the LLM sees —
// never raw HTML. Fields are chosen to be cheap to embed and semantically
// informative.

export interface ExtractedContent {
  kind: ContentKind

  /** Primary title of the resource. */
  title: string

  /**
   * The most semantically dense short text we can extract.
   * For a problem: the problem statement.
   * For a repo: the first paragraph of the README.
   * For docs: the page introduction.
   * For a chat: the skill name or session topic.
   * Max 500 chars — enforced by extractors, not here.
   */
  summary: string

  /**
   * Ordered h1–h3 headings. Provide strong signal for embedding
   * without sending full body text.
   */
  headings: string[]

  /**
   * Keywords extracted from content (not meta keywords tag, which is
   * unreliable). Each extractor derives these differently:
   * - problem: constraint labels (e.g. "array", "sliding window")
   * - repo: topic tags from GitHub API response
   * - docs: section titles slugified
   * - article: noun phrases from first 3 paragraphs
   */
  keywords: string[]

  /** Byte length of the raw content before extraction, for diagnostics. */
  raw_length: number

  /** Extractor-specific metadata. Opaque to the pipeline; useful for debugging. */
  meta: Record<string, string | number | boolean>
}

// ── Tab capture ────────────────────────────────────────────────────────────
//
// One entry per captured tab. This is the unit that flows from the
// extension into the pipeline.

export interface TabCapture {
  /** Chrome/Firefox tab ID at time of capture. Not stable across sessions. */
  tab_id: number

  url: string

  /** Raw browser tab title. */
  tab_title: string

  /** ISO 8601 timestamp. */
  captured_at: string

  /** Which extractor strategy was selected. */
  extractor: string

  /** Classification — may be overridden by user in CRM. */
  domain: Domain

  /** Structured content extracted from the page. */
  content: ExtractedContent

  /**
   * Whether extraction completed successfully. If false, content will
   * be partially filled and the pipeline should treat this tab as
   * lower-confidence input.
   */
  extraction_ok: boolean

  /** Human-readable extraction error if extraction_ok = false. */
  extraction_error?: string
}

// ── Capture session ────────────────────────────────────────────────────────
//
// The full output of one capture run — what gets written to disk or
// clipboard for the pipeline to consume.

export interface CaptureSession {
  /** UUID v4, generated at capture time. */
  session_id: string

  captured_at: string

  /** tabsched-capture extension version. */
  extension_version: string

  /** Total open tabs at time of capture (including non-captured). */
  total_open_tabs: number

  /** Tabs that were captured (passed domain filter). */
  captures: TabCapture[]

  /** Tabs that were skipped and why. */
  skipped: SkippedTab[]
}

export interface SkippedTab {
  tab_id: number
  url: string
  reason: SkipReason
}

export type SkipReason =
  | "filtered_domain" // URL matched the ignore list
  | "no_url" // tab has no URL (new tab, about:blank, etc.)
  | "extraction_timeout"
  | "scripting_error" // content script could not be injected

// ── Messages ───────────────────────────────────────────────────────────────
//
// Typed message passing between background, content, and popup.
// All messages follow a discriminated union pattern. No untyped
// chrome.runtime.sendMessage calls anywhere.

export type MessageToBackground =
  | { kind: "CAPTURE_ALL_TABS" }
  | { kind: "CAPTURE_ACTIVE_TAB" }
  | { kind: "GET_CAPTURE_STATUS" }

export type MessageToContent = { kind: "EXTRACT_CONTENT" }

export type MessageFromContent =
  | { kind: "EXTRACTED"; content: ExtractedContent }
  | { kind: "EXTRACT_FAILED"; error: string }

export type MessageFromBackground =
  | { kind: "CAPTURE_COMPLETE"; session: CaptureSession }
  | { kind: "CAPTURE_PROGRESS"; completed: number; total: number }
  | { kind: "CAPTURE_ERROR"; error: string }
  | { kind: "STATUS"; last_session: CaptureSession | null; capturing: boolean }

// ── Storage ────────────────────────────────────────────────────────────────

export interface StoredState {
  last_session: CaptureSession | null
  capture_count: number
  settings: CaptureSettings
}

export interface CaptureSettings {
  /**
   * URL substrings that cause a tab to be skipped entirely.
   * Default list covers chrome:// URLs, extension pages, and common
   * noise like Google Docs, Notion, etc. that aren't learning resources.
   */
  ignore_patterns: string[]

  /**
   * How long to wait for a content script to respond before timing out.
   * Default: 5000ms.
   */
  extraction_timeout_ms: number

  /**
   * If true, emit extraction_error details in the JSON output.
   * Useful for debugging new extractors. Default: false.
   */
  verbose_errors: boolean
}

export const DEFAULT_SETTINGS: CaptureSettings = {
  ignore_patterns: [
    "chrome://",
    "chrome-extension://",
    "moz-extension://",
    "about:",
    "localhost",
    "127.0.0.1",
    "docs.google.com",
    "notion.so",
    "mail.google.com",
    "calendar.google.com",
    "twitter.com",
    "x.com",
    "reddit.com",
  ],
  extraction_timeout_ms: 5000,
  verbose_errors: false,
}
