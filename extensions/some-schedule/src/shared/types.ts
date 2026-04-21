/**
 *
 * Tab-centric contract. CaptureSession is gone.
 * The atomic unit is TabCapture; the DB key is tab_id.
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

// ── Tab (primary entity) ───────────────────────────────────────────────────

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

export type TabSummary = {
  tab_id: number
  url: string
  tab_title: string
  domain: string
  last_seen_at: string
  extraction_ok: boolean
}

export type SkippedTab = {
  tab_id: number
  url: string
  reason: SkipReason
}

export type SkipReason =
  | "filtered_domain"
  | "no_url"
  | "tab_suspended"
  | "extraction_timeout"
  | "scripting_error"

// ── DB state summary (returned by background on status) ────────────────────

export type DbStatus = {
  db_count: number
  last_synced_at: string | null
}

// ── Messages ───────────────────────────────────────────────────────────────

export type MessageToBackground =
  | { kind: "GET_STATUS" }
  | { kind: "SYNC_TABS" } // capture active (non-suspended) tabs → batch upsert
  | { kind: "GET_DB_STATUS" } // db_count + last_synced_at
  | { kind: "RECONCILE" } // send active tab_ids → get absent back
  | { kind: "DELETE_TABS"; tab_ids: Array<number> }
  | { kind: "TRIGGER_PIPELINE" } // POST to pipeline endpoint (no session_id needed)
  | { kind: "PRUNE_TABS"; older_than_days?: number }

export type MessageToContent = { kind: "EXTRACT_CONTENT" }

export type MessageFromContent =
  | { kind: "EXTRACTED"; content: ExtractedContent; extractorName: string }
  | { kind: "EXTRACT_FAILED"; error: string }

export type SyncStats = {
  upserted: number
  failed: number
  error_tab_ids: Array<number>
  db_count: number
}

export type MessageFromBackground =
  | {
      kind: "STATUS"
      tab_count: number
      db_count: number
      last_synced_at: string | null
    }
  | { kind: "SYNC_PROGRESS"; completed: number; total: number }
  | { kind: "SYNC_COMPLETE"; stats: SyncStats }
  | { kind: "SYNC_FAILED"; error: string }
  | {
      kind: "RECONCILE_RESULT"
      absent_tab_ids: Array<number>
      absent_summaries: Array<TabSummary>
    }
  | { kind: "RECONCILE_ERROR"; error: string }
  | { kind: "DELETE_COMPLETE"; deleted_count: number }
  | { kind: "DELETE_ERROR"; error: string }
  | { kind: "PIPELINE_QUEUED"; db_count: number }
  | { kind: "PIPELINE_ERROR"; error: string }
  | { kind: "PRUNE_COMPLETE"; pruned_count: number; db_count: number }
  | { kind: "PRUNE_ERROR"; error: string }
  | { kind: "ERROR"; message: string }

// ── Storage ────────────────────────────────────────────────────────────────

export type StoredState = {
  last_synced_at: string | null
  sync_count: number
  settings: CaptureSettings
}

export type CaptureSettings = {
  ignore_patterns: Array<string>
  extraction_timeout_ms: number
  ferrum_base: string
  verbose_errors: boolean
  prune_days: number
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
  ferrum_base: "http://nixos.local:3000",
  verbose_errors: false,
  prune_days: 30,
}

export const FERRUM_BASE = "http://nixos.local:3000"
