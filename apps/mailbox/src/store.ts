/**
 * What the mailbox keeps, and the one adapter that keeps it in D1.
 *
 * MB1: an item never changes, and leaves `item` only into `archived`; no code
 * may issue `INSERT OR REPLACE`, which the triggers do not stop. Full text:
 * README.md, "Gray-area invariants".
 */

export type Folder =
  | "brief"
  | "decisions"
  | "scout"
  | "scene"
  | "drama"
  | "run"
  | "opened"

/** Who put an item. A restored item keeps its first putter. */
export type Putter = "routine" | "home"

/** The name of each token, and what it may do (`ROLES` in `core.ts`). */
export type Role = Putter | "archive"

export type ItemMeta = {
  readonly seq: number
  readonly name: string
  readonly size: number
  readonly sha256: string
  readonly contentType: string
  readonly putAt: string
  /** When it was last put back from home, else when it was put. */
  readonly liveSince: string
}

export type StoredItem = ItemMeta & { readonly bytes: Uint8Array }

/** An item whose bytes moved home. `seq` is the one it had while live. */
export type ArchivedMeta = {
  readonly seq: number
  readonly name: string
  readonly size: number
  readonly sha256: string
  readonly contentType: string
  readonly putAt: string
  readonly archivedAt: string
}

export type WantedMeta = {
  readonly name: string
  readonly askedAt: string
}

export type NewItem = {
  readonly bytes: Uint8Array
  /** Lower-case hex of `bytes`. */
  readonly sha256: string
  readonly contentType: string
  readonly putBy: Putter
  /** RFC 3339, milliseconds, `Z`. */
  readonly putAt: string
}

export type PutResult =
  | { readonly change: "added" | "unchanged"; readonly seq: number }
  | { readonly change: "conflict" }

export type ArchiveResult = {
  /**
   * `archived`: its row is in `archived` and its bytes are gone. `unchanged`:
   * it was archived already. `absent`: the name was never held. `mismatch`:
   * the live bytes are not the ones named. `too_young`: live since after
   * `liveBefore`.
   */
  readonly change:
    | "archived"
    | "unchanged"
    | "absent"
    | "mismatch"
    | "too_young"
}

export type RestoreResult =
  | { readonly change: "restored" | "unchanged"; readonly seq: number }
  /** Never archived, or archived with other bytes. */
  | { readonly change: "not_archived" | "mismatch" }

export type AskResult = {
  /** `live`: the item is there now, so there is nothing to ask for. */
  readonly change: "asked" | "unchanged" | "live" | "not_archived"
}

export type Store = {
  /** Metadata of live items with `seq > after`, oldest first, at most `limit`. */
  list: (
    folder: Folder,
    after: number,
    limit: number
  ) => Promise<ReadonlyArray<ItemMeta>>
  get: (folder: Folder, name: string) => Promise<StoredItem | null>
  /**
   * One name holds one body, forever, archived or not: the same bytes again
   * are `unchanged`, other bytes are a `conflict` and change nothing.
   */
  put: (folder: Folder, name: string, item: NewItem) => Promise<PutResult>
  /** The name's latest archived row, or `null`. */
  archivedOf: (folder: Folder, name: string) => Promise<ArchivedMeta | null>
  /** Archived rows with `seq > after`, oldest first, at most `limit`. */
  listArchived: (
    folder: Folder,
    after: number,
    limit: number
  ) => Promise<ReadonlyArray<ArchivedMeta>>
  /** Moves the item's metadata into `archived` and drops its bytes, in one transaction. */
  archive: (
    folder: Folder,
    name: string,
    sha256: string,
    archivedAt: string,
    liveBefore: string
  ) => Promise<ArchiveResult>
  /** Puts an archived item's own bytes back, under a new seq, and closes the ask. */
  restore: (
    folder: Folder,
    name: string,
    bytes: Uint8Array,
    sha256: string,
    restoredAt: string
  ) => Promise<RestoreResult>
  ask: (folder: Folder, name: string, askedAt: string) => Promise<AskResult>
  /** Open asks, oldest first, at most `limit`. */
  listWanted: (
    folder: Folder,
    limit: number
  ) => Promise<ReadonlyArray<WantedMeta>>
}

type Row = Record<string, unknown>

type Bound = {
  first: () => Promise<Row | null>
  all: () => Promise<{ results: ReadonlyArray<Row> }>
}

/**
 * The part of `D1Database` the adapter uses. Rows come back untyped on
 * purpose: the adapter checks each one, so a shape D1 did not promise fails
 * here and not three calls later.
 */
export type Db = {
  prepare: (sql: string) => {
    bind: (...values: ReadonlyArray<unknown>) => Bound
  }
  /**
   * Runs the statements in one transaction: all or none (D1's `batch`).
   * Method syntax, so D1's own statement type is accepted for `Bound`.
   */
  batch(
    statements: ReadonlyArray<Bound>
  ): Promise<ReadonlyArray<{ results?: ReadonlyArray<Row> }>>
}

/** An archived name is held as surely as a live one, in the same statement. */
const INSERT_SQL = `INSERT INTO item (folder, name, sha256, size, content_type, body, put_by, put_at)
SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
WHERE NOT EXISTS (SELECT 1 FROM archived WHERE folder = ?1 AND name = ?2)
ON CONFLICT (folder, name) DO NOTHING
RETURNING seq`

const HELD_SQL = "SELECT seq, sha256 FROM item WHERE folder = ?1 AND name = ?2"

const ITEM_COLUMNS =
  "item.seq, item.name, item.size, item.sha256, item.content_type AS contentType, item.put_at AS putAt, COALESCE(restored.restored_at, item.put_at) AS liveSince"

const ITEM_FROM = "item LEFT JOIN restored ON restored.seq = item.seq"

const LIST_SQL = `SELECT ${ITEM_COLUMNS} FROM ${ITEM_FROM} WHERE item.folder = ?1 AND item.seq > ?2 ORDER BY item.seq ASC LIMIT ?3`

const GET_SQL = `SELECT ${ITEM_COLUMNS}, item.body FROM ${ITEM_FROM} WHERE item.folder = ?1 AND item.name = ?2`

const ARCHIVED_COLUMNS =
  "seq, name, size, sha256, content_type AS contentType, put_at AS putAt, archived_at AS archivedAt"

const ARCHIVED_OF_SQL = `SELECT ${ARCHIVED_COLUMNS} FROM archived WHERE folder = ?1 AND name = ?2 ORDER BY seq DESC LIMIT 1`

const LIST_ARCHIVED_SQL = `SELECT ${ARCHIVED_COLUMNS} FROM archived WHERE folder = ?1 AND seq > ?2 ORDER BY seq ASC LIMIT ?3`

/** ?1 folder, ?2 name, ?3 sha256, ?4 archived at, ?5 live before. */
const ARCHIVE_SQL = `INSERT INTO archived (seq, folder, name, sha256, size, content_type, put_by, put_at, archived_at)
SELECT item.seq, item.folder, item.name, item.sha256, item.size, item.content_type, item.put_by, item.put_at, ?4
FROM ${ITEM_FROM}
WHERE item.folder = ?1 AND item.name = ?2 AND item.sha256 = ?3
  AND COALESCE(restored.restored_at, item.put_at) <= ?5
ON CONFLICT (seq) DO NOTHING
RETURNING seq`

/** The trigger lets only an item whose row is in `archived` go. */
const DROP_BYTES_SQL = `DELETE FROM item
WHERE folder = ?1 AND name = ?2 AND sha256 = ?3
  AND seq IN (SELECT seq FROM archived WHERE folder = ?1 AND name = ?2)`

/** ?1 folder, ?2 name, ?3 bytes, ?4 sha256: only the archived bytes go back. */
const RESTORE_SQL = `INSERT INTO item (folder, name, sha256, size, content_type, body, put_by, put_at)
SELECT folder, name, sha256, size, content_type, ?3, put_by, put_at
FROM archived
WHERE folder = ?1 AND name = ?2 AND sha256 = ?4
ORDER BY seq DESC LIMIT 1
ON CONFLICT (folder, name) DO NOTHING
RETURNING seq`

/** ?1 folder, ?2 name, ?3 restored at: once, for an item put back. */
const MARK_RESTORED_SQL = `INSERT INTO restored (seq, restored_at)
SELECT seq, ?3 FROM item
WHERE folder = ?1 AND name = ?2
  AND EXISTS (SELECT 1 FROM archived WHERE folder = ?1 AND name = ?2)
  AND NOT EXISTS (SELECT 1 FROM restored WHERE restored.seq = item.seq)`

const CLOSE_ASK_SQL = `DELETE FROM wanted
WHERE folder = ?1 AND name = ?2
  AND EXISTS (SELECT 1 FROM item WHERE folder = ?1 AND name = ?2)`

const ASK_SQL = `INSERT INTO wanted (folder, name, asked_at)
SELECT ?1, ?2, ?3
WHERE EXISTS (SELECT 1 FROM archived WHERE folder = ?1 AND name = ?2)
  AND NOT EXISTS (SELECT 1 FROM item WHERE folder = ?1 AND name = ?2)
ON CONFLICT (folder, name) DO NOTHING
RETURNING name`

const ASKED_SQL = "SELECT name FROM wanted WHERE folder = ?1 AND name = ?2"

const LIST_WANTED_SQL =
  "SELECT name, asked_at AS askedAt FROM wanted WHERE folder = ?1 ORDER BY asked_at ASC, name ASC LIMIT ?2"

function shapeError(): Error {
  return new Error("a row is not the shape the mailbox wrote")
}

type FileMeta = Omit<ItemMeta, "liveSince">

/** The columns an item row and an archived row share, checked. */
function fileMetaOf(row: Row): FileMeta {
  const { seq, name, size, sha256, contentType, putAt } = row
  if (
    typeof seq !== "number" ||
    typeof name !== "string" ||
    typeof size !== "number" ||
    typeof sha256 !== "string" ||
    typeof contentType !== "string" ||
    typeof putAt !== "string"
  ) {
    throw shapeError()
  }
  return { seq, name, size, sha256, contentType, putAt }
}

function metaOf(row: Row): ItemMeta {
  const { liveSince } = row
  if (typeof liveSince !== "string") throw shapeError()
  return { ...fileMetaOf(row), liveSince }
}

function archivedMetaOf(row: Row): ArchivedMeta {
  const { archivedAt } = row
  if (typeof archivedAt !== "string") throw shapeError()
  return { ...fileMetaOf(row), archivedAt }
}

function wantedMetaOf(row: Row): WantedMeta {
  const { name, askedAt } = row
  if (typeof name !== "string" || typeof askedAt !== "string") {
    throw shapeError()
  }
  return { name, askedAt }
}

function seqOf(row: Row): number {
  const { seq } = row
  if (typeof seq !== "number") {
    throw new Error("an item row has no seq")
  }
  return seq
}

function isByteArray(value: unknown): value is Array<number> {
  return Array.isArray(value) && value.every((byte) => typeof byte === "number")
}

/** D1 hands a BLOB back as an array of byte values; other drivers use bytes. */
function bytesOf(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (isByteArray(value)) return Uint8Array.from(value)
  throw new Error("an item body is not bytes")
}

/** D1 binds a BLOB from an `ArrayBuffer` that covers exactly the bytes. */
function blobOf(bytes: Uint8Array): ArrayBuffer {
  return new Uint8Array(bytes).buffer
}

export function d1Store(db: Db): Store {
  const one = (
    sql: string,
    ...values: ReadonlyArray<unknown>
  ): Promise<Row | null> =>
    db
      .prepare(sql)
      .bind(...values)
      .first()

  const many = async <T>(
    shape: (row: Row) => T,
    sql: string,
    ...values: ReadonlyArray<unknown>
  ): Promise<ReadonlyArray<T>> => {
    const { results } = await db
      .prepare(sql)
      .bind(...values)
      .all()
    return results.map(shape)
  }

  const archivedOf = async (
    folder: Folder,
    name: string
  ): Promise<ArchivedMeta | null> => {
    const row = await one(ARCHIVED_OF_SQL, folder, name)
    return row === null ? null : archivedMetaOf(row)
  }

  return {
    list: (folder, after, limit) =>
      many(metaOf, LIST_SQL, folder, after, limit),

    async get(folder, name): Promise<StoredItem | null> {
      const row = await one(GET_SQL, folder, name)
      if (row === null) return null
      return { ...metaOf(row), bytes: bytesOf(row.body) }
    },

    async put(folder, name, item): Promise<PutResult> {
      const inserted = await one(
        INSERT_SQL,
        folder,
        name,
        item.sha256,
        item.bytes.byteLength,
        item.contentType,
        blobOf(item.bytes),
        item.putBy,
        item.putAt
      )
      if (inserted !== null) return { change: "added", seq: seqOf(inserted) }
      // No row: the name is held, live or archived (and maybe both, put back).
      const held =
        (await one(HELD_SQL, folder, name)) ??
        (await one(ARCHIVED_OF_SQL, folder, name))
      if (held === null) throw new Error("a held item is not there")
      return held.sha256 === item.sha256
        ? { change: "unchanged", seq: seqOf(held) }
        : { change: "conflict" }
    },

    archivedOf,

    listArchived: (folder, after, limit) =>
      many(archivedMetaOf, LIST_ARCHIVED_SQL, folder, after, limit),

    async archive(
      folder,
      name,
      sha256,
      archivedAt,
      liveBefore
    ): Promise<ArchiveResult> {
      const [moved] = await db.batch([
        db
          .prepare(ARCHIVE_SQL)
          .bind(folder, name, sha256, archivedAt, liveBefore),
        db.prepare(DROP_BYTES_SQL).bind(folder, name, sha256),
      ])
      if ((moved?.results ?? []).length > 0) return { change: "archived" }
      const live = await one(HELD_SQL, folder, name)
      if (live !== null) {
        return { change: live.sha256 === sha256 ? "too_young" : "mismatch" }
      }
      const archived = await archivedOf(folder, name)
      if (archived === null) return { change: "absent" }
      return { change: archived.sha256 === sha256 ? "unchanged" : "mismatch" }
    },

    async restore(
      folder,
      name,
      bytes,
      sha256,
      restoredAt
    ): Promise<RestoreResult> {
      const [put] = await db.batch([
        db.prepare(RESTORE_SQL).bind(folder, name, blobOf(bytes), sha256),
        db.prepare(MARK_RESTORED_SQL).bind(folder, name, restoredAt),
        db.prepare(CLOSE_ASK_SQL).bind(folder, name),
      ])
      const restored = put?.results?.at(0)
      if (restored !== undefined) {
        return { change: "restored", seq: seqOf(restored) }
      }
      const archived = await archivedOf(folder, name)
      if (archived === null) return { change: "not_archived" }
      if (archived.sha256 !== sha256) return { change: "mismatch" }
      const live = await one(HELD_SQL, folder, name)
      if (live === null) {
        // The insert found the archived row; only a live item stops it.
        throw new Error("a restore found no item to put back")
      }
      return { change: "unchanged", seq: seqOf(live) }
    },

    async ask(folder, name, askedAt): Promise<AskResult> {
      if ((await one(ASK_SQL, folder, name, askedAt)) !== null) {
        return { change: "asked" }
      }
      if ((await one(HELD_SQL, folder, name)) !== null)
        return { change: "live" }
      if ((await one(ASKED_SQL, folder, name)) !== null) {
        return { change: "unchanged" }
      }
      return { change: "not_archived" }
    },

    listWanted: (folder, limit) =>
      many(wantedMetaOf, LIST_WANTED_SQL, folder, limit),
  }
}
