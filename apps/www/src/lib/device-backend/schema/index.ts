/**
 * The on-device database's schema: the subset of paulgsc/server's
 * `migrations/` the device backend serves, copied column for column (subject
 * included), so a row here is one `file_host` could take verbatim. Each table
 * names its source migration and anything left out.
 *
 * Three tables are the device's own: `device_round_from_home` (migration 2),
 * so the bundled seed never replaces synced rounds with older bytes;
 * `device_round_retired` (3), so it never restores one home retired; and
 * `device_storage_notice` (3), removals not yet shown (`device-backend/storage`).
 *
 * Migrations are append-only, numbered by `PRAGMA user_version`. Never edit a
 * shipped entry: a phone that ran it will not run it again.
 */
import type { SqlDriver } from "@/lib/device-backend/sql"
import { num, one } from "@/lib/device-backend/sql"

const MIGRATIONS: ReadonlyArray<string> = [
  // 1 - sessions (20260805000300 as rebuilt by 20260906000900 and
  // 20260910000100), learner_shelf (20260929000200, without its trigger on
  // `account`), curriculum (20260924001300 + 20260927000100), leetype
  // (20260929000100 + 20260929000300), presence_leases (20260826000800).
  `
  CREATE TABLE sessions (
      id                TEXT    PRIMARY KEY,
      subject_id        TEXT    NOT NULL,
      name              TEXT    NOT NULL,
      status            TEXT    NOT NULL,
      origin            TEXT    NOT NULL,
      layout_mode       TEXT    NOT NULL,
      total_duration_ms INTEGER NOT NULL,
      created_at        TEXT    NOT NULL,
      updated_at        TEXT    NOT NULL,
      started_at        TEXT,
      completed_at      TEXT,
      final_elapsed_ms  INTEGER,
      activities        TEXT    NOT NULL,
      scenes            TEXT    NOT NULL,
      layout            TEXT
  );
  CREATE INDEX idx_sessions_started_at ON sessions(started_at);
  CREATE INDEX idx_sessions_completed_at ON sessions(completed_at);
  CREATE INDEX idx_sessions_status ON sessions(subject_id, status, updated_at DESC);
  CREATE UNIQUE INDEX idx_sessions_one_unstarted_system_proposal
  ON sessions (subject_id)
  WHERE origin = 'system' AND started_at IS NULL AND status IN ('paused', 'scheduled', 'draft');

  CREATE TABLE learner_shelf (
      subject_id   TEXT NOT NULL,
      activity_id  TEXT NOT NULL CHECK (activity_id IN ('topik', 'leetype')),
      key          TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      saved_at     TEXT NOT NULL,
      body         TEXT NOT NULL,
      PRIMARY KEY (subject_id, activity_id, key)
  );

  CREATE TABLE curriculum (
      key              TEXT    PRIMARY KEY,
      activity_id      TEXT    NOT NULL,
      level            TEXT    CHECK (level IS NULL OR level IN ('beginner', 'intermediate', 'advanced')),
      display_name     TEXT    NOT NULL,
      description      TEXT    NOT NULL,
      batch_count      INTEGER NOT NULL,
      total_questions  INTEGER NOT NULL,
      total_messages   INTEGER NOT NULL,
      tags             TEXT,
      published_at     TEXT    NOT NULL,
      version          INTEGER NOT NULL,
      content_hash     TEXT    NOT NULL,
      body             TEXT    NOT NULL,
      retired_at       TEXT
  );
  CREATE INDEX idx_curriculum_published_at ON curriculum(published_at);
  CREATE INDEX idx_curriculum_activity_level ON curriculum(activity_id, level);
  CREATE INDEX idx_curriculum_listed ON curriculum(key) WHERE retired_at IS NULL;

  CREATE TABLE leetype_round (
      id           TEXT    PRIMARY KEY,
      language     TEXT    NOT NULL CHECK (language = 'rust'),
      published_at TEXT    NOT NULL,
      version      INTEGER NOT NULL,
      content_hash TEXT    NOT NULL,
      retired_at   TEXT,
      body         TEXT    NOT NULL
  );
  CREATE INDEX idx_leetype_round_listed ON leetype_round(id) WHERE retired_at IS NULL;
  CREATE TABLE leetype_round_witness (
      round_id       TEXT    NOT NULL REFERENCES leetype_round(id) ON DELETE CASCADE,
      member_index   INTEGER NOT NULL,
      proposition_id TEXT    NOT NULL,
      admissible     INTEGER NOT NULL CHECK (admissible IN (0, 1)),
      PRIMARY KEY (round_id, member_index)
  );
  CREATE INDEX idx_leetype_round_witness_proposition ON leetype_round_witness(proposition_id, round_id);
  CREATE TABLE leetype_round_run (
      round_id     TEXT NOT NULL REFERENCES leetype_round(id) ON DELETE CASCADE,
      content_hash TEXT NOT NULL,
      variant      TEXT NOT NULL CHECK (variant = 'A' OR variant GLOB 'd[0-9]'),
      bounds       TEXT NOT NULL CHECK (bounds IN ('before', 'after')),
      sizes        TEXT NOT NULL,
      result       TEXT NOT NULL,
      recorded_at  TEXT NOT NULL,
      PRIMARY KEY (round_id, variant, bounds)
  );

  CREATE TABLE presence_leases (
      subject_id   TEXT NOT NULL,
      context_key  TEXT NOT NULL,
      observed_at  TEXT NOT NULL,
      PRIMARY KEY (subject_id, context_key)
  );
  `,
  // 2 - device only: the rounds the sync from home wrote
  // (`content-store`'s `RoundOrigin`).
  `
  CREATE TABLE device_round_from_home (
      round_id TEXT PRIMARY KEY REFERENCES leetype_round(id) ON DELETE CASCADE
  );
  `,
  // 3 - device only: bundled rounds home retired (`content-store`), and
  // removals not yet shown (`storage`'s `PruneNotice`). Both stay small: the
  // seed trims the first to ids the bundle still ships; the second is one row.
  `
  CREATE TABLE device_round_retired (
      round_id TEXT PRIMARY KEY
  );
  CREATE TABLE device_storage_notice (
      id     INTEGER PRIMARY KEY CHECK (id = 1),
      rounds INTEGER NOT NULL,
      since  TEXT    NOT NULL
  );
  `,
]

/** The schema version a fully migrated database reports. */
const SCHEMA_VERSION = MIGRATIONS.length

/**
 * Brings `db` up to `SCHEMA_VERSION`, one migration per transaction, and
 * turns on the foreign keys the round tables' cascades rely on (a
 * per-connection setting in SQLite, so every open sets it).
 *
 * A new database first gets `auto_vacuum = FULL`, which only takes before
 * its first table: deleted rows' pages then leave the file at each commit,
 * so the file Android backs up shrinks with what is removed.
 */
export async function migrate(db: SqlDriver): Promise<void> {
  const row = await one(db, "PRAGMA user_version")
  const current = row === null ? 0 : num(row, "user_version")
  if (current === 0) await db.exec("PRAGMA auto_vacuum = FULL")
  await db.exec("PRAGMA foreign_keys = ON")
  for (let index = current; index < SCHEMA_VERSION; index++) {
    const sql = MIGRATIONS[index] ?? ""
    await db.transaction(async () => {
      await db.exec(sql)
      // `PRAGMA` takes no bound parameters; `index + 1` is ours.
      await db.exec(`PRAGMA user_version = ${index + 1}`)
    })
  }
}
