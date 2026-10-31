/**
 * The read-only content routes: TOPIK's `/curriculum/*`, as `file_host`
 * serves them (paulgsc/server `handlers/db/curriculum.rs`).
 *
 * The tables are filled by the home sync (`device-backend/content-store`),
 * and answers match: manifests list
 * unretired rows by key (the curriculum one, one activity's: topik's unless
 * `?activity=` names another), `version` is the SHA-256 of the compact JSON in the
 * server's field order, and a body is verbatim with its hash as the ETag.
 */
import { sha256Hex } from "@some-ui/core-utils"

import { DEFAULT_LESSON_ACTIVITY } from "@/lib/device-backend/content-store"
import type { DeviceRoute } from "@/lib/device-backend/router"
import {
  errorResponse,
  json,
  notFound,
  verbatim,
} from "@/lib/device-backend/router"
import type { SqlRow } from "@/lib/device-backend/sql"
import { num, one, text, textOrNull } from "@/lib/device-backend/sql"

/** The most rows the manifest lists; one more is a `400`. */
const MANIFEST_CEILING = 1000

/**
 * A `200` carrying `ETag: "<tag>"`. Never a `304`: request headers do not
 * reach a handler (the interceptor passes method, path, query and body),
 * and an in-process answer has no transfer for a conditional to save.
 */
function withEtag(body: unknown, etag: string): Response {
  return json(200, body, { etag: `"${etag}"` })
}

function manifestEntry(row: SqlRow): Record<string, unknown> {
  const level = textOrNull(row, "level")
  const tags = textOrNull(row, "tags")
  const parsedTags: unknown = tags === null ? null : JSON.parse(tags)
  // Field order is the server's struct order; `version` hashes this JSON.
  return {
    key: text(row, "key"),
    displayName: text(row, "display_name"),
    description: text(row, "description"),
    batchCount: num(row, "batch_count"),
    totalQuestions: num(row, "total_questions"),
    totalMessages: num(row, "total_messages"),
    ...(level === null ? {} : { difficulty: level }),
    ...(parsedTags === null ? {} : { tags: parsedTags }),
  }
}

const curriculumManifest: DeviceRoute["handler"] = async (
  { query },
  { db }
) => {
  const rows = await db.all(
    `SELECT key, display_name, description, batch_count, total_questions, total_messages, level, tags
     FROM curriculum WHERE retired_at IS NULL AND activity_id = ? ORDER BY key LIMIT ?`,
    [query.get("activity") ?? DEFAULT_LESSON_ACTIVITY, MANIFEST_CEILING + 1]
  )
  if (rows.length > MANIFEST_CEILING) {
    return errorResponse(400, "max_record_limit_exceeded")
  }
  const topiks = rows.map(manifestEntry)
  const version = await sha256Hex(JSON.stringify(topiks))
  return withEtag({ version, topiks }, version)
}

export const contentRoutes: ReadonlyArray<DeviceRoute> = [
  { method: "GET", path: "/curriculum/manifest", handler: curriculumManifest },
  {
    method: "GET",
    path: "/curriculum/manifest.json",
    handler: curriculumManifest,
  },
  {
    method: "GET",
    path: "/curriculum/:key",
    handler: async ({ params }, { db }): Promise<Response> => {
      const key = params.key ?? ""
      // The exact key first, then without a `.json` suffix.
      const candidates = key.toLowerCase().endsWith(".json")
        ? [key, key.slice(0, -".json".length)]
        : [key]
      for (const candidate of candidates) {
        const row = await one(
          db,
          "SELECT body, content_hash FROM curriculum WHERE key = ?",
          [candidate]
        )
        if (row !== null) {
          return verbatim(text(row, "body"), text(row, "content_hash"))
        }
      }
      return notFound()
    },
  },
]
