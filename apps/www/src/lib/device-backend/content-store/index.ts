/**
 * Writes into the device's content tables: the one place TOPIK lessons and
 * LeetType session files get *into* the phone's database.
 *
 * Two callers: the sync from the home `file_host`
 * (`device-backend/home-sync`), the only way TOPIK lessons arrive; and a
 * session file the person picks from storage (`lib/leetype-files`).
 */
import { rfc3339, sha256Hex } from "@/lib/device-backend/common"
import type { SqlDriver, SqlValue } from "@/lib/device-backend/sql"
import { num, one, text } from "@/lib/device-backend/sql"

export type UpsertOutcome = "inserted" | "updated" | "unchanged"

/** A TOPIK manifest entry as `/curriculum/manifest.json` lists it. */
export type LessonEntry = {
  key: string
  displayName: string
  description: string
  batchCount: number
  totalQuestions: number
  totalMessages: number
  difficulty?: string
  tags?: Array<string>
}

const LEVELS = ["beginner", "intermediate", "advanced"]

/** Bytes the device holds, and their digest. */
export type HeldBody = { body: string; hash: string }

/** The body the device holds for lesson `key`, and its hash, or `null`. */
export async function storedLesson(
  db: SqlDriver,
  key: string
): Promise<HeldBody | null> {
  const row = await one(
    db,
    "SELECT body, content_hash FROM curriculum WHERE key = ?",
    [key]
  )
  return row === null
    ? null
    : { body: text(row, "body"), hash: text(row, "content_hash") }
}

/**
 * The activity a curriculum row is listed under when nothing says otherwise:
 * the conversation lessons the bare manifest lists, as on the server
 * (`DEFAULT_ACTIVITY`, paulgsc/server `handlers/db/curriculum.rs`).
 */
export const DEFAULT_LESSON_ACTIVITY = "topik"

/**
 * One TOPIK lesson: its manifest entry and its body, verbatim, under the
 * activity home lists it for. Unchanged only when all three are: home can
 * edit a lesson's name, description, level or tags without touching its
 * body.
 */
export async function upsertLesson(
  db: SqlDriver,
  entry: LessonEntry,
  body: string,
  nowMs: number,
  activityId: string = DEFAULT_LESSON_ACTIVITY
): Promise<UpsertOutcome> {
  const contentHash = await sha256Hex(body)
  const level =
    entry.difficulty !== undefined && LEVELS.includes(entry.difficulty)
      ? entry.difficulty
      : null
  const tags = entry.tags === undefined ? null : JSON.stringify(entry.tags)
  return db.transaction(async () => {
    const stored = await one(
      db,
      `SELECT content_hash, version, retired_at, activity_id, level, display_name,
              description, batch_count, total_questions, total_messages, tags
       FROM curriculum WHERE key = ?`,
      [entry.key]
    )
    if (
      stored !== null &&
      text(stored, "content_hash") === contentHash &&
      // A lesson an older build retired comes back when home lists it again.
      stored.retired_at === null &&
      stored.activity_id === activityId &&
      stored.level === level &&
      stored.display_name === entry.displayName &&
      stored.description === entry.description &&
      stored.batch_count === entry.batchCount &&
      stored.total_questions === entry.totalQuestions &&
      stored.total_messages === entry.totalMessages &&
      stored.tags === tags
    ) {
      return "unchanged"
    }
    const version = stored === null ? 1 : num(stored, "version") + 1
    await db.run(
      `INSERT INTO curriculum (key, activity_id, level, display_name, description, batch_count, total_questions, total_messages, tags, published_at, version, content_hash, body, retired_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(key) DO UPDATE SET
         activity_id = excluded.activity_id, level = excluded.level, display_name = excluded.display_name,
         description = excluded.description, batch_count = excluded.batch_count,
         total_questions = excluded.total_questions, total_messages = excluded.total_messages,
         tags = excluded.tags, published_at = excluded.published_at,
         version = excluded.version, content_hash = excluded.content_hash,
         body = excluded.body, retired_at = NULL`,
      [
        entry.key,
        activityId,
        level,
        entry.displayName,
        entry.description,
        entry.batchCount,
        entry.totalQuestions,
        entry.totalMessages,
        tags,
        rfc3339(nowMs),
        version,
        contentHash,
        body,
      ]
    )
    return stored === null ? "inserted" : "updated"
  })
}

/**
 * Deletes every lesson of `activityId` whose key is not in `keep`, after a
 * sync copies that activity's home manifest. Deleted, where the server
 * retires: nothing on the phone loads a lesson by a key it saved (a session
 * stores a level; every loader takes its key from the manifest), so a
 * retired row is only weight.
 */
export async function removeLessonsExcept(
  db: SqlDriver,
  keep: ReadonlyArray<string>,
  activityId: string = DEFAULT_LESSON_ACTIVITY
): Promise<number> {
  return db.transaction(() =>
    deleteCounted(
      db,
      "curriculum",
      "activity_id = ? AND key NOT IN (SELECT value FROM json_each(?))",
      [activityId, JSON.stringify(keep)]
    )
  )
}

/** Counted first: on the Capacitor bridge `changes` includes cascades (`sql`). */
async function deleteCounted(
  db: SqlDriver,
  table: string,
  where: string,
  params: ReadonlyArray<SqlValue>
): Promise<number> {
  const row = await one(
    db,
    `SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`,
    params
  )
  await db.run(`DELETE FROM ${table} WHERE ${where}`, params)
  return row === null ? 0 : num(row, "n")
}

/** A LeetType session file the phone holds, as its list shows it. */
export type SessionFileRow = {
  name: string
  title: string
  oneLine: string
  pickedAt: string
}

/**
 * A session file picked from storage, kept verbatim under its name: other
 * bytes under a name the phone holds are refused (`"name-taken"`), and the
 * same bytes again change nothing. Why a name is held, and the parse before
 * it: `@some-ui/leetype`'s session-file pick.
 */
export async function keepSessionFile(
  db: SqlDriver,
  file: Omit<SessionFileRow, "pickedAt"> & { body: string },
  nowMs: number
): Promise<"kept" | "already-held" | "name-taken"> {
  const contentHash = await sha256Hex(file.body)
  return db.transaction(async () => {
    const stored = await one(
      db,
      "SELECT content_hash FROM device_leetype_session_file WHERE name = ?",
      [file.name]
    )
    if (stored !== null) {
      return text(stored, "content_hash") === contentHash
        ? "already-held"
        : "name-taken"
    }
    await db.run(
      `INSERT INTO device_leetype_session_file (name, title, one_line, content_hash, body, picked_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        file.name,
        file.title,
        file.oneLine,
        contentHash,
        file.body,
        rfc3339(nowMs),
      ]
    )
    return "kept"
  })
}

/** Every session file the phone holds, newest pick first. */
export async function listSessionFiles(
  db: SqlDriver
): Promise<Array<SessionFileRow>> {
  const rows = await db.all(
    `SELECT name, title, one_line, picked_at FROM device_leetype_session_file
     ORDER BY picked_at DESC, name`
  )
  return rows.map((row) => ({
    name: text(row, "name"),
    title: text(row, "title"),
    oneLine: text(row, "one_line"),
    pickedAt: text(row, "picked_at"),
  }))
}

/** A held session file's text, verbatim, or `null`. */
export async function readSessionFile(
  db: SqlDriver,
  name: string
): Promise<string | null> {
  const row = await one(
    db,
    "SELECT body FROM device_leetype_session_file WHERE name = ?",
    [name]
  )
  return row === null ? null : text(row, "body")
}
