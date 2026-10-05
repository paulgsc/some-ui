/**
 * The read-only content routes: TOPIK's `/curriculum/*` and Leetype's
 * `/leetype/rounds*`, as `file_host` serves them (paulgsc/server
 * `handlers/db/{curriculum,leetype}.rs`).
 *
 * What fills the tables differs from the server - the device seeds its
 * bundled Leetype corpus and copies whatever the home server has when it
 * syncs (`device-backend/content-store`) - but what comes out does not:
 * manifests list unretired rows ordered by key, a manifest's `version` is
 * the SHA-256 of its compact JSON in the server's field order, and a body is
 * answered verbatim with its content hash as the ETag.
 */
import { sha256Hex } from "@/lib/device-backend/common"
import type { DeviceRoute } from "@/lib/device-backend/router"
import {
  errorResponse,
  json,
  notFound,
  verbatim,
} from "@/lib/device-backend/router"
import type { SqlRow } from "@/lib/device-backend/sql"
import { num, one, text, textOrNull } from "@/lib/device-backend/sql"

/** The most rows either manifest lists; one more is a `400`. */
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

const curriculumManifest: DeviceRoute["handler"] = async (_request, { db }) => {
  const rows = await db.all(
    `SELECT key, display_name, description, batch_count, total_questions, total_messages, level, tags
     FROM curriculum WHERE retired_at IS NULL ORDER BY key LIMIT ?`,
    [MANIFEST_CEILING + 1]
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
  {
    method: "GET",
    path: "/leetype/rounds",
    handler: async (_request, { db }): Promise<Response> => {
      const rows = await db.all(
        `SELECT id, version, published_at, content_hash FROM leetype_round
         WHERE retired_at IS NULL ORDER BY id LIMIT ?`,
        [MANIFEST_CEILING + 1]
      )
      if (rows.length > MANIFEST_CEILING) {
        return errorResponse(400, "max_record_limit_exceeded")
      }
      const witnessRows = await db.all(
        `SELECT round_id, proposition_id, admissible FROM leetype_round_witness
         ORDER BY round_id, member_index`
      )
      const witnesses = new Map<string, Array<Record<string, unknown>>>()
      for (const row of witnessRows) {
        const roundId = text(row, "round_id")
        const list = witnesses.get(roundId) ?? []
        list.push({
          propositionId: text(row, "proposition_id"),
          admissible: num(row, "admissible") === 1,
        })
        witnesses.set(roundId, list)
      }
      const rounds = rows.map((row) => ({
        id: text(row, "id"),
        version: num(row, "version"),
        publishedAt: text(row, "published_at"),
        contentHash: text(row, "content_hash"),
        witnesses: witnesses.get(text(row, "id")) ?? [],
      }))
      const version = await sha256Hex(JSON.stringify(rounds))
      return withEtag({ version, rounds }, version)
    },
  },
  {
    method: "GET",
    path: "/leetype/rounds/:id",
    handler: async ({ params }, { db }): Promise<Response> => {
      const row = await one(
        db,
        "SELECT body, content_hash FROM leetype_round WHERE id = ?",
        [params.id ?? ""]
      )
      return row === null
        ? notFound()
        : verbatim(text(row, "body"), text(row, "content_hash"))
    },
  },
  {
    method: "GET",
    path: "/leetype/rounds/:id/runs",
    handler: async ({ params }, { db }): Promise<Response> => {
      const roundId = params.id ?? ""
      const round = await one(
        db,
        "SELECT content_hash FROM leetype_round WHERE id = ?",
        [roundId]
      )
      if (round === null) return notFound()
      const contentHash = text(round, "content_hash")
      // Only runs recorded against the round's current bytes; A before
      // d0..d9, then `before` before `after`.
      const rows = await db.all(
        `SELECT variant, bounds, sizes, result FROM leetype_round_run
         WHERE round_id = ? AND content_hash = ?
         ORDER BY CASE WHEN variant = 'A' THEN 0 ELSE 1 END, variant,
                  CASE WHEN bounds = 'before' THEN 0 ELSE 1 END`,
        [roundId, contentHash]
      )
      const runs = rows.map((row) => {
        const sizes: unknown = JSON.parse(text(row, "sizes"))
        const result: unknown = JSON.parse(text(row, "result"))
        return {
          variant: text(row, "variant"),
          bounds: text(row, "bounds"),
          sizes,
          result,
        }
      })
      const body = { roundId, contentHash, runs }
      return withEtag(body, await sha256Hex(JSON.stringify(body)))
    },
  },
]
