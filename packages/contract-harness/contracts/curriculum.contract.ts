/**
 * The lessons `@some-ui/topik` reads: `GET /curriculum/manifest` (and its
 * `.json` spelling) and `GET /curriculum/:key` (paulgsc/server
 * `routes::db::curriculum` and `handlers/db/curriculum.rs`), served by the
 * phone's own copy too (`apps/www/src/lib/device-backend`).
 *
 * Hand-written, like every contract here: `ManifestEntrySchema` is
 * transcribed from `TopikMetadataSchema` and cross-checked by hand against
 * the server's `ManifestEntry`. A lesson body is not pinned: the server
 * serves it verbatim and never parses it, and topik's intake is what holds
 * it. Read-only and public, so no contract here needs a session or writes.
 */

import { z } from "zod"

import { defineContract } from "../src/contract"

/** `TopikMetadataSchema` (`@some-ui/topik`), field for field. */
export const ManifestEntrySchema = z.object({
  key: z.string(),
  displayName: z.string(),
  description: z.string(),
  batchCount: z.number(),
  totalQuestions: z.number(),
  totalMessages: z.number(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  tags: z.array(z.string()).optional(),
})

/**
 * `Manifest`: `version` is the listing's own content hash, a string the
 * client never interprets.
 */
const ManifestSchema = z.object({
  version: z.string().regex(/^[0-9a-f]{64}$/),
  topiks: z.array(ManifestEntrySchema),
})

/** A key no environment holds, so the miss below is a real miss. */
const ABSENT_KEY = "contract-harness-does-not-exist"

export const contracts = [
  defineContract({
    id: "curriculum.manifest",
    module: "curriculum",
    method: "GET",
    path: "/curriculum/manifest",
    summary:
      "topik's listed lessons and the hash that names the listing; an empty corpus is an empty manifest",
    expect: { status: 200, schema: ManifestSchema },
  }),

  defineContract({
    id: "curriculum.manifest_json",
    module: "curriculum",
    method: "GET",
    path: "/curriculum/manifest.json",
    summary: "the same manifest under the file name the client once fetched",
    expect: { status: 200, schema: ManifestSchema },
  }),

  defineContract({
    id: "curriculum.lesson_not_found",
    module: "curriculum",
    method: "GET",
    path: "/curriculum/:key",
    summary:
      "a key no one published is a JSON 404, the answer a static file fallback cannot give",
    request: { path: { key: `${ABSENT_KEY}.json` } },
    expect: { status: 404 },
  }),
]
