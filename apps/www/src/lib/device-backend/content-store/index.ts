/**
 * Writes into the device's content tables: the one place TOPIK lessons and
 * Leetype rounds get *into* the phone's database.
 *
 * Two callers: the bundled Leetype corpus, seeded on every start (an
 * unchanged body, or a round home wrote, is a no-op), and the sync from the
 * home `file_host` (`device-backend/home-sync`), the only way TOPIK lessons
 * arrive.
 *
 * Bodies are stored and hashed as received, so a round's recorded runs (keyed
 * by content hash) keep matching.
 */
import { isRecord, rfc3339, sha256Hex } from "@/lib/device-backend/common"
import type { SqlDriver } from "@/lib/device-backend/sql"
import { num, one, text } from "@/lib/device-backend/sql"

export type UpsertOutcome = "inserted" | "updated" | "unchanged"

/**
 * Where a round's bytes came from. Home's copy wins, or the bundled seed
 * would put the APK's older bytes back on every start.
 */
export type RoundOrigin = "bundled" | "home"

type Witness = { propositionId: string; admissible: boolean }

/** `diffOptions[i].member`'s proposition and admissibility, in option order. */
function witnessesOf(round: unknown): Array<Witness> {
  if (!isRecord(round) || !Array.isArray(round.diffOptions)) return []
  return round.diffOptions.flatMap((option): Array<Witness> => {
    if (!isRecord(option) || !isRecord(option.member)) return []
    const { propositionId, admissible } = option.member
    return typeof propositionId === "string" && typeof admissible === "boolean"
      ? [{ propositionId, admissible }]
      : []
  })
}

/**
 * A Leetype round, by the `id` in its own body. Re-listed if it had been
 * retired; its witness rows are rewritten with it. Throws on a body that is
 * not a round.
 *
 * `attestedHash` is the home manifest's content hash, used instead of hashing
 * `body`: Capacitor's native HTTP parses `application/json`, so a synced body
 * is a re-serialisation, and runs are keyed on the server's hash.
 *
 * A `"bundled"` write leaves a round the home sync wrote, or home retired,
 * alone (`"unchanged"`); a `"home"` write marks the round as home's.
 */
export async function upsertRound(
  db: SqlDriver,
  body: string,
  nowMs: number,
  origin: RoundOrigin,
  attestedHash?: string
): Promise<UpsertOutcome> {
  const round: unknown = JSON.parse(body)
  if (!isRecord(round) || typeof round.id !== "string") {
    throw new Error("device backend: a Leetype round needs a string `id`")
  }
  const id = round.id
  const contentHash = attestedHash ?? (await sha256Hex(body))
  return db.transaction(async () => {
    if (
      origin === "bundled" &&
      (await one(
        db,
        `SELECT 1 FROM device_round_from_home WHERE round_id = ?
         UNION ALL SELECT 1 FROM device_round_retired WHERE round_id = ?`,
        [id, id]
      )) !== null
    ) {
      return "unchanged"
    }
    const stored = await one(
      db,
      "SELECT content_hash, version, retired_at FROM leetype_round WHERE id = ?",
      [id]
    )
    if (
      stored !== null &&
      text(stored, "content_hash") === contentHash &&
      stored.retired_at === null
    ) {
      return "unchanged"
    }
    const version = stored === null ? 1 : num(stored, "version") + 1
    await db.run(
      `INSERT INTO leetype_round (id, language, published_at, version, content_hash, retired_at, body)
       VALUES (?, 'rust', ?, ?, ?, NULL, ?)
       ON CONFLICT(id) DO UPDATE SET
         published_at = excluded.published_at, version = excluded.version,
         content_hash = excluded.content_hash, retired_at = NULL, body = excluded.body`,
      [id, rfc3339(nowMs), version, contentHash, body]
    )
    await db.run("DELETE FROM leetype_round_witness WHERE round_id = ?", [id])
    let index = 0
    for (const witness of witnessesOf(round)) {
      await db.run(
        "INSERT INTO leetype_round_witness (round_id, member_index, proposition_id, admissible) VALUES (?, ?, ?, ?)",
        [id, index, witness.propositionId, witness.admissible ? 1 : 0]
      )
      index += 1
    }
    if (origin === "home") {
      await db.run(
        "INSERT OR IGNORE INTO device_round_from_home (round_id) VALUES (?)",
        [id]
      )
      await db.run("DELETE FROM device_round_retired WHERE round_id = ?", [id])
    }
    return stored === null ? "inserted" : "updated"
  })
}

/**
 * A round's recorded runs (`RoundRuns`), stored against the hash they name,
 * so the runs route drops them once the round's bytes change. Ignored for a
 * round the device does not hold, and for runs recorded against other bytes
 * (they would replace runs that match, e.g. the bundled seed's older runs).
 */
export async function upsertRuns(
  db: SqlDriver,
  body: string,
  nowMs: number
): Promise<number> {
  const parsed: unknown = JSON.parse(body)
  if (
    !isRecord(parsed) ||
    typeof parsed.roundId !== "string" ||
    typeof parsed.contentHash !== "string" ||
    !Array.isArray(parsed.runs)
  ) {
    throw new Error("device backend: not a RoundRuns body")
  }
  const { roundId, contentHash, runs } = parsed
  return db.transaction(async () => {
    const round = await one(
      db,
      "SELECT content_hash FROM leetype_round WHERE id = ?",
      [roundId]
    )
    if (round === null || text(round, "content_hash") !== contentHash) return 0
    let written = 0
    for (const run of runs) {
      if (
        !isRecord(run) ||
        typeof run.variant !== "string" ||
        typeof run.bounds !== "string"
      ) {
        continue
      }
      await db.run(
        `INSERT INTO leetype_round_run (round_id, content_hash, variant, bounds, sizes, result, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(round_id, variant, bounds) DO UPDATE SET
           content_hash = excluded.content_hash, sizes = excluded.sizes,
           result = excluded.result, recorded_at = excluded.recorded_at`,
        [
          roundId,
          contentHash,
          run.variant,
          run.bounds,
          JSON.stringify(run.sizes ?? {}),
          JSON.stringify(run.result ?? null),
          rfc3339(nowMs),
        ]
      )
      written += 1
    }
    return written
  })
}

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

/** The content hash the device holds for round `id`, or `null`. */
export async function storedRoundHash(
  db: SqlDriver,
  id: string
): Promise<string | null> {
  const row = await one(
    db,
    "SELECT content_hash FROM leetype_round WHERE id = ? AND retired_at IS NULL",
    [id]
  )
  return row === null ? null : text(row, "content_hash")
}

/**
 * One TOPIK lesson: its manifest entry and its body, verbatim. Unchanged
 * only when both are: home can edit a lesson's name, description, level or
 * tags without touching its body.
 */
export async function upsertLesson(
  db: SqlDriver,
  entry: LessonEntry,
  body: string,
  nowMs: number
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
      `SELECT content_hash, version, retired_at, level, display_name, description,
              batch_count, total_questions, total_messages, tags
       FROM curriculum WHERE key = ?`,
      [entry.key]
    )
    if (
      stored !== null &&
      text(stored, "content_hash") === contentHash &&
      stored.retired_at === null &&
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
       VALUES (?, 'topik', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(key) DO UPDATE SET
         level = excluded.level, display_name = excluded.display_name,
         description = excluded.description, batch_count = excluded.batch_count,
         total_questions = excluded.total_questions, total_messages = excluded.total_messages,
         tags = excluded.tags, published_at = excluded.published_at,
         version = excluded.version, content_hash = excluded.content_hash,
         body = excluded.body, retired_at = NULL`,
      [
        entry.key,
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
 * Deletes every lesson whose key is not in `keep`, after a sync copies the
 * home manifest. Deleted, where the server retires: nothing on the phone loads
 * a lesson by a key it saved (a session stores a level; every loader takes its
 * key from the manifest), so a retired row is only weight.
 */
export async function removeLessonsExcept(
  db: SqlDriver,
  keep: ReadonlyArray<string>
): Promise<number> {
  const { changes } = await db.transaction(() =>
    db.run(
      "DELETE FROM curriculum WHERE key NOT IN (SELECT value FROM json_each(?))",
      [JSON.stringify(keep)]
    )
  )
  return changes
}

/**
 * Deletes every round whose id is not in `keep`, its witnesses and runs
 * with it (`ON DELETE CASCADE`).
 *
 * `"home"`: home's listing is the word on every round, so one home stopped
 * listing goes whatever its origin, and is recorded as retired so the next
 * start's seed does not put a bundled copy back. `"bundled"`: the seed
 * dropping what this build no longer ships, never a round home wrote, and
 * forgetting retirements of rounds the bundle no longer has.
 */
export async function removeRoundsExcept(
  db: SqlDriver,
  keep: ReadonlyArray<string>,
  origin: RoundOrigin
): Promise<number> {
  const kept = JSON.stringify(keep)
  return db.transaction(async () => {
    if (origin === "home") {
      await db.run(
        `INSERT OR IGNORE INTO device_round_retired (round_id)
         SELECT id FROM leetype_round WHERE id NOT IN (SELECT value FROM json_each(?))`,
        [kept]
      )
      const { changes } = await db.run(
        "DELETE FROM leetype_round WHERE id NOT IN (SELECT value FROM json_each(?))",
        [kept]
      )
      return changes
    }
    await db.run(
      "DELETE FROM device_round_retired WHERE round_id NOT IN (SELECT value FROM json_each(?))",
      [kept]
    )
    const { changes } = await db.run(
      `DELETE FROM leetype_round
       WHERE id NOT IN (SELECT value FROM json_each(?))
         AND id NOT IN (SELECT round_id FROM device_round_from_home)`,
      [kept]
    )
    return changes
  })
}
