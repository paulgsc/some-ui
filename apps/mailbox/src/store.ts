/**
 * What the mailbox keeps, and the one adapter that keeps it in D1.
 *
 * The port (`Store`) is all `core.ts` knows of storage, so the whole
 * request-to-answer logic runs in tests against an in-memory store, and the
 * SQL runs in tests against real SQLite (`__tests__/store.test.ts`).
 *
 * MB1 (append-only): the adapter's only write is
 * `INSERT ... ON CONFLICT(folder, name) DO NOTHING`; the table's triggers abort
 * an UPDATE or DELETE of an item. They do not stop `INSERT OR REPLACE`, so no
 * code may issue one. Full text: README.md, "Gray-area invariants".
 */

export type Folder = "brief" | "decisions" | "scout"

/** Who put an item; also the name of the token that may. */
export type Role = "routine" | "home"

export type ItemMeta = {
  readonly seq: number
  readonly name: string
  readonly size: number
  readonly sha256: string
  readonly contentType: string
  readonly putAt: string
}

export type StoredItem = ItemMeta & { readonly bytes: Uint8Array }

export type NewItem = {
  readonly bytes: Uint8Array
  /** Lower-case hex of `bytes`. */
  readonly sha256: string
  readonly contentType: string
  readonly putBy: Role
  /** RFC 3339, milliseconds, `Z`. */
  readonly putAt: string
}

export type PutResult =
  | { readonly change: "added" | "unchanged"; readonly seq: number }
  | { readonly change: "conflict" }

export type Store = {
  /** Metadata of items with `seq > after`, oldest first, at most `limit`. */
  list: (
    folder: Folder,
    after: number,
    limit: number
  ) => Promise<ReadonlyArray<ItemMeta>>
  get: (folder: Folder, name: string) => Promise<StoredItem | null>
  /**
   * One name holds one body, forever: the same bytes again are `unchanged`,
   * other bytes are a `conflict` and change nothing.
   */
  put: (folder: Folder, name: string, item: NewItem) => Promise<PutResult>
}

type Row = Record<string, unknown>

/**
 * The part of `D1Database` the adapter uses. Rows come back untyped on
 * purpose: the adapter checks each one, so a shape D1 did not promise fails
 * here and not three calls later.
 */
export type Db = {
  prepare: (sql: string) => {
    bind: (...values: ReadonlyArray<unknown>) => {
      first: () => Promise<Row | null>
      all: () => Promise<{ results: ReadonlyArray<Row> }>
    }
  }
}

const INSERT_SQL = `INSERT INTO item (folder, name, sha256, size, content_type, body, put_by, put_at)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
ON CONFLICT (folder, name) DO NOTHING
RETURNING seq`

const HELD_SQL = "SELECT seq, sha256 FROM item WHERE folder = ?1 AND name = ?2"

const META_COLUMNS =
  "seq, name, size, sha256, content_type AS contentType, put_at AS putAt"

const LIST_SQL = `SELECT ${META_COLUMNS} FROM item WHERE folder = ?1 AND seq > ?2 ORDER BY seq ASC LIMIT ?3`

const GET_SQL = `SELECT ${META_COLUMNS}, body FROM item WHERE folder = ?1 AND name = ?2`

function metaOf(row: Row): ItemMeta {
  const { seq, name, size, sha256, contentType, putAt } = row
  if (
    typeof seq !== "number" ||
    typeof name !== "string" ||
    typeof size !== "number" ||
    typeof sha256 !== "string" ||
    typeof contentType !== "string" ||
    typeof putAt !== "string"
  ) {
    throw new Error("an item row is not the shape the mailbox wrote")
  }
  return { seq, name, size, sha256, contentType, putAt }
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
  return {
    async list(folder, after, limit): Promise<ReadonlyArray<ItemMeta>> {
      const { results } = await db
        .prepare(LIST_SQL)
        .bind(folder, after, limit)
        .all()
      return results.map(metaOf)
    },

    async get(folder, name): Promise<StoredItem | null> {
      const row = await db.prepare(GET_SQL).bind(folder, name).first()
      if (row === null) return null
      return { ...metaOf(row), bytes: bytesOf(row.body) }
    },

    async put(folder, name, item): Promise<PutResult> {
      const inserted = await db
        .prepare(INSERT_SQL)
        .bind(
          folder,
          name,
          item.sha256,
          item.bytes.byteLength,
          item.contentType,
          blobOf(item.bytes),
          item.putBy,
          item.putAt
        )
        .first()
      if (inserted !== null) return { change: "added", seq: seqOf(inserted) }
      // DO NOTHING returns no row: the name is held. Which body holds it?
      const held = await db.prepare(HELD_SQL).bind(folder, name).first()
      if (held === null) {
        // Unreachable while MB1 holds: nothing is ever deleted.
        throw new Error("a held item is not there")
      }
      return held.sha256 === item.sha256
        ? { change: "unchanged", seq: seqOf(held) }
        : { change: "conflict" }
    },
  }
}
