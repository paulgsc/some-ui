/**
 * The canonical type contract for the tabsched capture pipeline.
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

export type ContentKind =
  | "article"
  | "problem"
  | "repo"
  | "pdf"
  | "docs"
  | "chat"
  | "video"
  | "job-board"
  | "unknown"

// ── Extracted content ──────────────────────────────────────────────────────

export type ExtractedContent = {
  kind: ContentKind
  title: string
  summary: string
  headings: Array<string>
  keywords: Array<string>
  raw_length: number
  meta: Record<string, string | number | boolean>
}

// ── Tab capture ────────────────────────────────────────────────────────────

export type TabCapture = {
  tab_id: number
  url: string
  tab_title: string
  captured_at: string
  extractor: string
  domain: Domain
  content: ExtractedContent
  extraction_ok: boolean
  extraction_error?: string
}

// ── Capture session ────────────────────────────────────────────────────────

export type CaptureSession = {
  session_id: string
  captured_at: string
  extension_version: string
  total_open_tabs: number
  captures: Array<TabCapture>
  skipped: Array<SkippedTab>
}

export type SkippedTab = {
  tab_id: number
  url: string
  reason: SkipReason
}

export type SkipReason =
  | "filtered_domain"
  | "no_url"
  | "extraction_timeout"
  | "scripting_error"

// ── Summary ────────────────────────────────────────────────────────────────

export type CaptureSummary = {
  session_id: string
  captured_at: string
  total_tabs: number
  captured_ok: number
  captured_fail: number
  skipped: number
  // Pipeline state tracked client-side in StoredState, not sent by the server.
  pipeline_status?: PipelineStatus
}

export type PipelineStatus = "pending" | "running" | "done" | "failed"

export function summarise(session: CaptureSession): CaptureSummary {
  return {
    session_id: session.session_id,
    captured_at: session.captured_at,
    total_tabs: session.total_open_tabs,
    captured_ok: session.captures.filter((c) => c.extraction_ok).length,
    captured_fail: session.captures.filter((c) => !c.extraction_ok).length,
    skipped: session.skipped.length,
  }
}

// ── Messages ───────────────────────────────────────────────────────────────

export type MessageToBackground =
  | { kind: "CAPTURE_ALL_TABS" }
  | { kind: "CAPTURE_ACTIVE_TAB" }
  | { kind: "GET_CAPTURE_STATUS" }
  | { kind: "GET_SESSIONS" }
  | { kind: "DELETE_SESSION"; session_id: string }
  | { kind: "TRIGGER_PIPELINE"; session_id: string }
  | { kind: "TRIGGER_ALL_PIPELINE" }

export type MessageToContent = { kind: "EXTRACT_CONTENT" }

export type MessageFromContent =
  | { kind: "EXTRACTED"; content: ExtractedContent; extractorName: string }
  | { kind: "EXTRACT_FAILED"; error: string }

export type MessageFromBackground =
  | {
      kind: "CAPTURE_COMPLETE"
      summary: CaptureSummary
      post_ok: boolean
      post_error?: string
    }
  | { kind: "CAPTURE_PROGRESS"; completed: number; total: number }
  | { kind: "CAPTURE_ERROR"; error: string }
  | { kind: "STATUS"; last_summary: CaptureSummary | null; capturing: boolean }
  | { kind: "SESSIONS_LIST"; summaries: Array<CaptureSummary> }
  | { kind: "SESSIONS_ERROR"; error: string }
  | { kind: "SESSION_DELETED"; session_id: string }
  | { kind: "DELETE_ERROR"; session_id: string; error: string }
  | { kind: "PIPELINE_TRIGGERED"; session_id: string }
  | { kind: "PIPELINE_TRIGGER_ERROR"; session_id: string; error: string }
  | { kind: "PIPELINE_ALL_TRIGGERED"; count: number }
  | { kind: "PIPELINE_ALL_ERROR"; error: string }

// ── Storage ────────────────────────────────────────────────────────────────

export type StoredState = {
  last_summary: CaptureSummary | null
  capture_count: number
  settings: CaptureSettings
  // Lightweight map of session_id → pipeline status, persisted across popups.
  pipeline_statuses: Record<string, PipelineStatus>
}

export type CaptureSettings = {
  ignore_patterns: Array<string>
  extraction_timeout_ms: number
  /** SQLite write endpoint. */
  pipeline_endpoint: string
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
  // POST /captures — SQLite write path
  pipeline_endpoint: "http://nixos.local:3000/captures",
  verbose_errors: false,
}

// ── Pipeline API helpers ───────────────────────────────────────────────────
// Base URL for the Ferrum server. Used by background.ts for pipeline triggers.

export const FERRUM_BASE = "http://nixos.local:3000"
