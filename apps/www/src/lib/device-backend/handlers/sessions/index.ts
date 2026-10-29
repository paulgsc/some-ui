/**
 * `/sessions`, as `file_host` serves it (paulgsc/server
 * `handlers/db/session.rs`, `crates/db/session`), over the `sessions` table.
 *
 * The behaviours that are easy to get subtly wrong, each copied rather than
 * re-decided:
 *
 * - every success is `200`, including create and delete;
 * - a create may name its id (`is_session_id`): one that is not a session's
 *   is a `422`, and one already held answers with that session unchanged,
 *   so the same create sent again makes one session;
 * - `DELETE /sessions/:id` answers `{ removed }` and never `404`;
 * - `layout` has three states: absent (SQL `NULL`), explicit `null` (the
 *   text `'null'`), or a tree;
 * - `startedAt`/`completedAt`/`finalElapsedMs` sent as `null` mean "leave
 *   it", never "clear it";
 * - `origin` only ever moves `system -> user`;
 * - a duplicate is a fresh `draft` with `" (copy)"` appended, and carries
 *   `finalElapsedMs` over (the server's `..source` spread does).
 *
 * Saves are budgeted (`device-backend/storage`).
 */
import { isRecord } from "@some-ui/core-utils"

import { DEVICE_SUBJECT, rfc3339 } from "@/lib/device-backend/common"
import type { DeviceRoute } from "@/lib/device-backend/router"
import {
  errorResponse,
  json,
  notFound,
  readJson,
  shapeRejected,
  unprocessable,
} from "@/lib/device-backend/router"
import type { SqlDriver, SqlRow, SqlValue } from "@/lib/device-backend/sql"
import { num, numOrNull, one, text, textOrNull } from "@/lib/device-backend/sql"
import { budgetedAnswer } from "@/lib/device-backend/storage"
import { touchedToday } from "@/lib/study-nudge"
import type { SessionRecord } from "@/lib/tenant/types"

const STATUSES = ["draft", "scheduled", "active", "paused", "completed"]
const LAYOUT_MODES = ["basic", "advanced"]

type Stored = {
  id: string
  name: string
  status: string
  origin: string
  layoutMode: string
  totalDurationMs: number
  createdAt: string
  updatedAt: string
  startedAt: string | null
  completedAt: string | null
  finalElapsedMs: number | null
  activities: string
  scenes: string
  /** `null` = absent; `"null"` = explicit null; otherwise a JSON tree. */
  layout: string | null
}

const COLUMNS =
  "id, name, status, origin, layout_mode, total_duration_ms, created_at, updated_at, started_at, completed_at, final_elapsed_ms, activities, scenes, layout"

function fromRow(row: SqlRow): Stored {
  return {
    id: text(row, "id"),
    name: text(row, "name"),
    status: text(row, "status"),
    origin: text(row, "origin"),
    layoutMode: text(row, "layout_mode"),
    totalDurationMs: num(row, "total_duration_ms"),
    createdAt: text(row, "created_at"),
    updatedAt: text(row, "updated_at"),
    startedAt: textOrNull(row, "started_at"),
    completedAt: textOrNull(row, "completed_at"),
    finalElapsedMs: numOrNull(row, "final_elapsed_ms"),
    activities: text(row, "activities"),
    scenes: text(row, "scenes"),
    layout: textOrNull(row, "layout"),
  }
}

function toWire(session: Stored): Record<string, unknown> {
  const parse = (value: string): unknown => {
    const parsed: unknown = JSON.parse(value)
    return parsed
  }
  return {
    id: session.id,
    name: session.name,
    status: session.status,
    origin: session.origin,
    activities: parse(session.activities),
    scenes: parse(session.scenes),
    // Reading the column back falls back to `basic`, as `LayoutMode` does.
    layoutMode: LAYOUT_MODES.includes(session.layoutMode)
      ? session.layoutMode
      : "basic",
    ...(session.layout === null ? {} : { layout: parse(session.layout) }),
    totalDurationMs: session.totalDurationMs,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    ...(session.startedAt === null ? {} : { startedAt: session.startedAt }),
    ...(session.completedAt === null
      ? {}
      : { completedAt: session.completedAt }),
    ...(session.finalElapsedMs === null
      ? {}
      : { finalElapsedMs: session.finalElapsedMs }),
  }
}

/** `total_duration_of`: the latest scene end, snake_case keys, floor 0. */
function totalDurationOf(scenes: ReadonlyArray<unknown>): number {
  let latest = 0
  for (const scene of scenes) {
    if (!isRecord(scene)) continue
    const start = Number.isInteger(scene.start_time)
      ? Number(scene.start_time)
      : 0
    const duration = Number.isInteger(scene.duration)
      ? Number(scene.duration)
      : 0
    latest = Math.max(latest, start + duration)
  }
  return latest
}

async function find(db: SqlDriver, id: string): Promise<Stored | null> {
  const row = await one(
    db,
    `SELECT ${COLUMNS} FROM sessions WHERE id = ? AND subject_id = ?`,
    [id, DEVICE_SUBJECT]
  )
  return row === null ? null : fromRow(row)
}

function valuesOf(session: Stored): Array<SqlValue> {
  return [
    session.id,
    DEVICE_SUBJECT,
    session.name,
    session.status,
    session.origin,
    session.layoutMode,
    session.totalDurationMs,
    session.createdAt,
    session.updatedAt,
    session.startedAt,
    session.completedAt,
    session.finalElapsedMs,
    session.activities,
    session.scenes,
    session.layout,
  ]
}

const INSERT = `INSERT INTO sessions (id, subject_id, name, status, origin, layout_mode, total_duration_ms, created_at, updated_at, started_at, completed_at, final_elapsed_ms, activities, scenes, layout)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

async function write(db: SqlDriver, session: Stored): Promise<void> {
  await db.run(
    `${INSERT}
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       status = excluded.status,
       origin = CASE WHEN sessions.origin = 'user' THEN 'user' ELSE excluded.origin END,
       layout_mode = excluded.layout_mode,
       total_duration_ms = excluded.total_duration_ms,
       updated_at = excluded.updated_at,
       started_at = excluded.started_at,
       completed_at = excluded.completed_at,
       final_elapsed_ms = excluded.final_elapsed_ms,
       activities = excluded.activities,
       scenes = excluded.scenes,
       layout = excluded.layout`,
    valuesOf(session)
  )
}

/**
 * `insert_if_absent`: makes `session` unless its id is taken, and answers
 * with the session as it is now, or `null` when another subject holds the
 * id. Run inside the caller's transaction (`budgeted` opens it).
 */
async function insertIfAbsent(
  db: SqlDriver,
  session: Stored
): Promise<Stored | null> {
  const { changes } = await db.run(
    `${INSERT} ON CONFLICT(id) DO NOTHING`,
    valuesOf(session)
  )
  return changes > 0 ? session : find(db, session.id)
}

function newSessionId(): string {
  return `session-${crypto.randomUUID()}`
}

/** `is_session_id`: `session-`, then 16 to 56 letters, digits, `-` and `_`. */
const SESSION_ID = /^session-[A-Za-z0-9_-]{16,56}$/

/** Absent -> `undefined`; explicit `null` -> `"null"`; a tree -> its JSON. */
function layoutField(body: Record<string, unknown>): string | null | undefined {
  if (!("layout" in body)) return undefined
  return JSON.stringify(body.layout ?? null)
}

export type RemovableSession = { id: string; name: string; finishedAt: string }

/**
 * Deletes each of `asOf` that is still exactly as it was then, by `id` and
 * `updatedAt` in one statement each, all in one transaction: a session saved
 * since is kept, however late that save lands. Returns how many went.
 */
export async function removeUnchanged(
  db: SqlDriver,
  asOf: ReadonlyArray<Pick<SessionRecord, "id" | "updatedAt">>
): Promise<number> {
  return db.transaction(async () => {
    let removed = 0
    for (const { id, updatedAt } of asOf) {
      const { changes } = await db.run(
        "DELETE FROM sessions WHERE subject_id = ? AND id = ? AND updated_at = ?",
        [DEVICE_SUBJECT, id, updatedAt]
      )
      if (changes > 0) removed += 1
    }
    return removed
  })
}

/**
 * Whether the phone may let its copy of `session` go, to make room or once
 * home or an archive holds it: finished, and not one the study card and
 * nudge read as studied today. Unfinished work always stays.
 */
export function mayLeavePhone(
  session: Pick<SessionRecord, "status" | "startedAt" | "completedAt">,
  now: Date
): boolean {
  return session.status === "completed" && !touchedToday(session, now)
}

/**
 * The session the app offers to remove when the phone is full: the oldest
 * finished one that is not `spare`, and never one the study card and nudge
 * read as studied today.
 */
export async function oldestRemovable(
  db: SqlDriver,
  nowMs: number,
  spare: string | null = null
): Promise<RemovableSession | null> {
  const rows = await db.all(
    "SELECT id, name, started_at, completed_at, updated_at FROM sessions WHERE subject_id = ? AND status = 'completed'",
    [DEVICE_SUBJECT]
  )
  const removable = rows
    .map((row) => ({
      id: text(row, "id"),
      name: text(row, "name"),
      startedAt: textOrNull(row, "started_at") ?? undefined,
      completedAt: textOrNull(row, "completed_at") ?? undefined,
      finishedAt: textOrNull(row, "completed_at") ?? text(row, "updated_at"),
    }))
    .filter(
      (row) =>
        row.id !== spare &&
        mayLeavePhone({ ...row, status: "completed" }, new Date(nowMs))
    )
    .sort((a, b) => Date.parse(a.finishedAt) - Date.parse(b.finishedAt))
  const oldest = removable.at(0)
  return oldest === undefined
    ? null
    : { id: oldest.id, name: oldest.name, finishedAt: oldest.finishedAt }
}

function idsOf(value: unknown): Array<string> | null {
  if (!isRecord(value) || !Array.isArray(value.ids)) return null
  const ids = value.ids
  return ids.every((id): id is string => typeof id === "string") ? ids : null
}

export const sessionRoutes: ReadonlyArray<DeviceRoute> = [
  {
    method: "GET",
    path: "/sessions",
    handler: async (_request, { db }): Promise<Response> => {
      const rows = await db.all(
        `SELECT ${COLUMNS} FROM sessions WHERE subject_id = ? ORDER BY created_at DESC`,
        [DEVICE_SUBJECT]
      )
      return json(
        200,
        rows.map((row) => toWire(fromRow(row)))
      )
    },
  },
  {
    method: "GET",
    path: "/sessions/:id",
    handler: async ({ params }, { db }): Promise<Response> => {
      const session = await find(db, params.id ?? "")
      return session === null ? notFound() : json(200, toWire(session))
    },
  },
  {
    method: "POST",
    path: "/sessions",
    handler: async ({ body }, { db, now, budget }): Promise<Response> => {
      const read = readJson(body)
      if (!read.ok) return read.response
      const input = read.value
      if (!isRecord(input)) return shapeRejected("expected a session")
      if (typeof input.name !== "string") {
        return shapeRejected("missing field `name`")
      }
      if (
        typeof input.layoutMode !== "string" ||
        !LAYOUT_MODES.includes(input.layoutMode)
      ) {
        return shapeRejected("`layoutMode` must be `basic` or `advanced`")
      }
      const activities = input.activities ?? []
      const scenes = input.scenes ?? []
      if (!Array.isArray(activities) || !Array.isArray(scenes)) {
        return shapeRejected("`activities` and `scenes` must be arrays")
      }
      // `Option<String>` with a default: absent or `null` is the server's to mint.
      const named = input.id ?? undefined
      if (named !== undefined && typeof named !== "string") {
        return shapeRejected("invalid type for `id`, expected a string")
      }
      if (named !== undefined && !SESSION_ID.test(named)) {
        return unprocessable({
          id: ["is session- and 16 to 56 letters, digits, - and _"],
        })
      }
      const stamp = rfc3339(now())
      const layout = layoutField(input)
      const session: Stored = {
        id: named ?? newSessionId(),
        name: input.name,
        status: "draft",
        origin: "user",
        layoutMode: input.layoutMode,
        totalDurationMs: totalDurationOf(scenes),
        createdAt: stamp,
        updatedAt: stamp,
        startedAt: null,
        completedAt: null,
        finalElapsedMs: null,
        activities: JSON.stringify(activities),
        scenes: JSON.stringify(scenes),
        layout: layout ?? null,
      }
      return budgetedAnswer(db, budget, null, async () => {
        const created = await insertIfAbsent(db, session)
        return created === null
          ? errorResponse(409, "conflict", {
              message: "another session holds this id",
            })
          : json(200, toWire(created))
      })
    },
  },
  {
    method: "PATCH",
    path: "/sessions/:id",
    handler: async (
      { params, body },
      { db, now, budget }
    ): Promise<Response> => {
      const read = readJson(body)
      if (!read.ok) return read.response
      const patch = read.value
      if (!isRecord(patch)) return shapeRejected("expected a session patch")
      if (
        patch.status !== undefined &&
        (typeof patch.status !== "string" || !STATUSES.includes(patch.status))
      ) {
        return shapeRejected("unknown `status`")
      }
      if (
        patch.layoutMode !== undefined &&
        (typeof patch.layoutMode !== "string" ||
          !LAYOUT_MODES.includes(patch.layoutMode))
      ) {
        return shapeRejected("unknown `layoutMode`")
      }
      return budgetedAnswer(db, budget, params.id ?? null, async () => {
        const current = await find(db, params.id ?? "")
        if (current === null) return notFound()
        const next: Stored = { ...current, updatedAt: rfc3339(now()) }
        if (typeof patch.name === "string") next.name = patch.name
        if (typeof patch.status === "string") next.status = patch.status
        if (patch.origin === "user" || patch.origin === "system") {
          next.origin = patch.origin
        }
        if (typeof patch.layoutMode === "string") {
          next.layoutMode = patch.layoutMode
        }
        if (Array.isArray(patch.activities)) {
          next.activities = JSON.stringify(patch.activities)
        }
        if (Array.isArray(patch.scenes)) {
          next.scenes = JSON.stringify(patch.scenes)
          next.totalDurationMs = totalDurationOf(patch.scenes)
        }
        // An explicit total in the same patch wins over the recomputed one.
        if (typeof patch.totalDurationMs === "number") {
          next.totalDurationMs = patch.totalDurationMs
        }
        const layout = layoutField(patch)
        if (layout !== undefined) next.layout = layout
        if (typeof patch.startedAt === "string")
          next.startedAt = patch.startedAt
        if (typeof patch.completedAt === "string") {
          next.completedAt = patch.completedAt
        }
        if (typeof patch.finalElapsedMs === "number") {
          next.finalElapsedMs = patch.finalElapsedMs
        }
        await write(db, next)
        const stored = await find(db, next.id)
        return stored === null ? notFound() : json(200, toWire(stored))
      })
    },
  },
  {
    method: "DELETE",
    path: "/sessions/:id",
    handler: async ({ params }, { db }): Promise<Response> => {
      const { changes } = await db.transaction(() =>
        db.run("DELETE FROM sessions WHERE id = ? AND subject_id = ?", [
          params.id ?? "",
          DEVICE_SUBJECT,
        ])
      )
      return json(200, { removed: changes > 0 })
    },
  },
  {
    method: "DELETE",
    path: "/sessions",
    handler: async ({ body }, { db }): Promise<Response> => {
      const read = readJson(body)
      if (!read.ok) return read.response
      const ids = idsOf(read.value)
      if (ids === null) return shapeRejected("missing field `ids`")
      const deletedCount = await db.transaction(async () => {
        let count = 0
        for (const id of ids) {
          const { changes } = await db.run(
            "DELETE FROM sessions WHERE id = ? AND subject_id = ?",
            [id, DEVICE_SUBJECT]
          )
          count += changes
        }
        return count
      })
      return json(200, { deletedCount })
    },
  },
  {
    method: "PATCH",
    path: "/sessions/status",
    handler: async ({ body }, { db, now }): Promise<Response> => {
      const read = readJson(body)
      if (!read.ok) return read.response
      const ids = idsOf(read.value)
      const status = isRecord(read.value) ? read.value.status : undefined
      if (ids === null) return shapeRejected("missing field `ids`")
      if (typeof status !== "string" || !STATUSES.includes(status)) {
        return shapeRejected("unknown `status`")
      }
      const updated = await db.transaction(async () => {
        const stamp = rfc3339(now())
        const out: Array<Stored> = []
        for (const id of ids) {
          await db.run(
            "UPDATE sessions SET status = ?, updated_at = ? WHERE id = ? AND subject_id = ?",
            [status, stamp, id, DEVICE_SUBJECT]
          )
          const stored = await find(db, id)
          if (stored !== null) out.push(stored)
        }
        return out
      })
      return json(200, updated.map(toWire))
    },
  },
  {
    method: "POST",
    path: "/sessions/:id/duplicate",
    handler: async ({ params }, { db, now, budget }): Promise<Response> =>
      budgetedAnswer(db, budget, params.id ?? null, async () => {
        const source = await find(db, params.id ?? "")
        if (source === null) return notFound()
        const stamp = rfc3339(now())
        const copy: Stored = {
          ...source,
          id: newSessionId(),
          name: `${source.name} (copy)`,
          status: "draft",
          origin: "user",
          startedAt: null,
          completedAt: null,
          createdAt: stamp,
          updatedAt: stamp,
        }
        await write(db, copy)
        return json(200, toWire(copy))
      }),
  },
]
