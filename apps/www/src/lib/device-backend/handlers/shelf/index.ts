/**
 * `/shelf/:activity[/:key]`, as `file_host` serves it (paulgsc/server
 * `handlers/shelf.rs`, `crates/db/learner_shelf`), over `learner_shelf`.
 *
 * The one offline write path for authored content (the packages' "Keep on
 * this account"). Copied, not re-decided: the cap (20 per activity) never
 * refuses a replace; an identical body is `unchanged` and keeps `savedAt`;
 * problems are one `422` keyed by field; `DELETE` is `204` either way. The
 * phone's own: a keep that would grow it past its budget
 * (`device-backend/storage`) gets the `409` a full shelf gets.
 */
import {
  DEVICE_SUBJECT,
  rfc3339Millis,
  sha256Hex,
} from "@/lib/device-backend/common"
import type { DeviceRoute, ErrorDetails } from "@/lib/device-backend/router"
import {
  errorResponse,
  json,
  noContent,
  notFound,
  unprocessable,
  verbatim,
} from "@/lib/device-backend/router"
import type { SqlRow } from "@/lib/device-backend/sql"
import { one, text } from "@/lib/device-backend/sql"
import { budgeted, OverBudgetError } from "@/lib/device-backend/storage"

const SHELF_CAP = 20
const SHELF_BODY_CEILING = 262_144

const ACTIVITIES = ["topik", "leetype"]

const KEY_PROBLEM =
  "must be a plain key: URL-unreserved characters, not starting with `.` or `http`, no `.json` suffix"

/** `is_plain_key` (curriculum `model.rs`). */
function isPlainKey(key: string): boolean {
  return (
    /^[A-Za-z0-9\-._~]+$/.test(key) &&
    !key.startsWith("http") &&
    !key.startsWith(".") &&
    !key.toLowerCase().endsWith(".json")
  )
}

/** The body problem `file_host` reports first, or `null`. */
function bodyProblem(body: string): string | null {
  if (new TextEncoder().encode(body).length > SHELF_BODY_CEILING) {
    return `is over the ${SHELF_BODY_CEILING}-byte ceiling`
  }
  const trimmed = body.replace(/^[ \t\r\n]+/, "")
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return "must be a JSON object or array"
  }
  try {
    JSON.parse(body)
  } catch {
    return "is not JSON"
  }
  return null
}

function entry(row: SqlRow): Record<string, string> {
  return {
    key: text(row, "key"),
    contentHash: text(row, "content_hash"),
    savedAt: text(row, "saved_at"),
  }
}

export const shelfRoutes: ReadonlyArray<DeviceRoute> = [
  {
    method: "GET",
    path: "/shelf/:activity",
    handler: async ({ params }, { db }): Promise<Response> => {
      const activity = params.activity ?? ""
      if (!ACTIVITIES.includes(activity)) return notFound()
      const rows = await db.all(
        "SELECT key, content_hash, saved_at FROM learner_shelf WHERE subject_id = ? AND activity_id = ? ORDER BY saved_at, key",
        [DEVICE_SUBJECT, activity]
      )
      return json(200, { items: rows.map(entry), cap: SHELF_CAP })
    },
  },
  {
    method: "GET",
    path: "/shelf/:activity/:key",
    handler: async ({ params }, { db }): Promise<Response> => {
      const activity = params.activity ?? ""
      const key = params.key ?? ""
      if (!ACTIVITIES.includes(activity) || !isPlainKey(key)) return notFound()
      const row = await one(
        db,
        "SELECT body FROM learner_shelf WHERE subject_id = ? AND activity_id = ? AND key = ?",
        [DEVICE_SUBJECT, activity, key]
      )
      return row === null ? notFound() : verbatim(text(row, "body"))
    },
  },
  {
    method: "PUT",
    path: "/shelf/:activity/:key",
    handler: async (
      { params, body },
      { db, now, budget }
    ): Promise<Response> => {
      const activity = params.activity ?? ""
      const key = params.key ?? ""
      const details: ErrorDetails = {}
      if (!ACTIVITIES.includes(activity)) {
        details.activity = ["must be `topik` or `leetype`"]
      }
      if (!isPlainKey(key)) details.key = [KEY_PROBLEM]
      const problem = bodyProblem(body)
      if (problem !== null) details.body = [problem]
      if (Object.keys(details).length > 0) return unprocessable(details)

      const contentHash = await sha256Hex(body)
      return budgeted(db, budget, async () => {
        const stored = await one(
          db,
          "SELECT key, content_hash, saved_at FROM learner_shelf WHERE subject_id = ? AND activity_id = ? AND key = ?",
          [DEVICE_SUBJECT, activity, key]
        )
        if (stored !== null && text(stored, "content_hash") === contentHash) {
          return json(200, { change: "unchanged", item: entry(stored) })
        }
        const savedAt = rfc3339Millis(now())
        if (stored !== null) {
          await db.run(
            "UPDATE learner_shelf SET content_hash = ?, saved_at = ?, body = ? WHERE subject_id = ? AND activity_id = ? AND key = ?",
            [contentHash, savedAt, body, DEVICE_SUBJECT, activity, key]
          )
          return json(200, {
            change: "replaced",
            item: { key, contentHash, savedAt },
          })
        }
        const { changes } = await db.run(
          `INSERT INTO learner_shelf (subject_id, activity_id, key, content_hash, saved_at, body)
           SELECT ?, ?, ?, ?, ?, ?
           WHERE (SELECT COUNT(*) FROM learner_shelf WHERE subject_id = ? AND activity_id = ?) < ?`,
          [
            DEVICE_SUBJECT,
            activity,
            key,
            contentHash,
            savedAt,
            body,
            DEVICE_SUBJECT,
            activity,
            SHELF_CAP,
          ]
        )
        if (changes === 0) {
          return errorResponse(409, "conflict", {
            message: "the shelf is full: delete an item before keeping another",
          })
        }
        return json(200, {
          change: "kept",
          item: { key, contentHash, savedAt },
        })
      }).catch((error: unknown) => {
        if (!(error instanceof OverBudgetError)) throw error
        return errorResponse(409, "conflict", { message: error.message })
      })
    },
  },
  {
    method: "DELETE",
    path: "/shelf/:activity/:key",
    handler: async ({ params }, { db }): Promise<Response> => {
      const activity = params.activity ?? ""
      const key = params.key ?? ""
      const details: ErrorDetails = {}
      if (!ACTIVITIES.includes(activity)) {
        details.activity = ["must be `topik` or `leetype`"]
      }
      if (!isPlainKey(key)) details.key = [KEY_PROBLEM]
      if (Object.keys(details).length > 0) return unprocessable(details)
      await db.transaction(() =>
        db.run(
          "DELETE FROM learner_shelf WHERE subject_id = ? AND activity_id = ? AND key = ?",
          [DEVICE_SUBJECT, activity, key]
        )
      )
      return noContent()
    },
  },
]
