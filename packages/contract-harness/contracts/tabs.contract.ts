/**
 * Tab capture handshakes.
 *
 * This surface is written by the browser extension and read by the dashboard,
 * so it is the one most likely to move on both sides at once — exactly the case
 * where "did I remember to update the other repo?" is not a question anyone can
 * answer by reading code.
 *
 * Shapes mirror `TabCapture` and `TabSummary` in
 * `crates/ws-events/src/tabsched/capture.rs`, and the request/response structs
 * declared at the top of `apps/servers/file_host/src/handlers/db/tab.rs`.
 *
 * `Domain` and `ContentKind` are newtypes over `String` on the server; serde
 * serialises a newtype struct as its inner value, so both arrive as plain
 * strings.
 */

import { z } from "zod"

import { defineContract } from "../src/contract"

const ExtractedContentSchema = z.object({
  kind: z.string(),
  title: z.string(),
  summary: z.string(),
  headings: z.array(z.string()),
  keywords: z.array(z.string()),
  raw_length: z.number(),
  // `HashMap<String, serde_json::Value>` — keys are data, so there is nothing
  // to declare and nothing to call undeclared.
  meta: z.record(z.string(), z.unknown()),
})

const TabCaptureSchema = z.object({
  tab_id: z.number(),
  url: z.string(),
  tab_title: z.string(),
  captured_at: z.string(),
  extractor: z.string(),
  domain: z.string(),
  content: ExtractedContentSchema,
  extraction_ok: z.boolean(),
  extraction_error: z.string().nullable(),
})

const TabSummarySchema = z.object({
  tab_id: z.number(),
  url: z.string(),
  tab_title: z.string(),
  domain: z.string(),
  last_seen_at: z.string(),
  extraction_ok: z.boolean(),
})

const ReconcileResponseSchema = z.object({
  absent_tab_ids: z.array(z.number()),
})

export const contracts = [
  defineContract({
    id: "tabs.summaries",
    module: "tabs",
    method: "GET",
    path: "/tabs/summaries",
    summary: "lightweight tab list — no content blobs",
    expect: { status: 200, schema: z.array(TabSummarySchema) },
  }),

  defineContract({
    id: "tabs.list",
    module: "tabs",
    method: "GET",
    path: "/tabs",
    summary: "full tab payloads, including extracted content",
    expect: { status: 200, schema: z.array(TabCaptureSchema) },
  }),

  defineContract({
    id: "tabs.get_by_id",
    module: "tabs",
    method: "GET",
    path: "/tabs/:tab_id",
    summary: "single tab by browser tab id",
    request: { path: { tab_id: 1 } },
    expect: { status: [200, 404], schemaFor: 200, schema: TabCaptureSchema },
  }),

  defineContract({
    id: "tabs.reconcile",
    module: "tabs",
    method: "POST",
    path: "/tabs/reconcile",
    summary:
      "extension reports active tab ids, server returns the ones it holds that were not reported",
    // Reports rather than writes, but it is a POST against a real server, so it
    // stays behind --include-mutations along with everything else that is not a
    // plain read.
    mutates: true,
    request: { body: { active_tab_ids: [] } },
    expect: { status: 200, schema: ReconcileResponseSchema },
  }),
]
