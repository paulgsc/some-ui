import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { ArchiveResult, NewItem, Store } from "@mailbox/store"
import { d1Store } from "@mailbox/store"
import type { Database } from "sql.js"
import { describe, expect, it } from "vitest"

import { d1Shim, openSqlite } from "./d1-shim"
import { memoryStore } from "./stores"

const MIGRATIONS = join(import.meta.dirname, "..", "..", "migrations")

const migrationFiles = (): ReadonlyArray<string> =>
  readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith(".sql"))
    .sort()

const apply = (db: Database, file: string): void => {
  db.exec(readFileSync(join(MIGRATIONS, file), "utf8"))
}

/** A database with every migration applied, in order, as `wrangler d1 migrations apply` does. */
async function migrated(): Promise<Database> {
  const files = migrationFiles()
  // The first migration is the one this suite is written against.
  expect(files).toContain("0001_create_item.sql")
  const db = await openSqlite()
  for (const file of files) apply(db, file)
  return db
}

const PUT_AT = "2026-10-21T14:52:00.000Z"
const EARLIER = "2026-10-01T00:00:00.000Z"
const ARCHIVED_AT = "2027-01-20T00:00:00.000Z"
const ASKED_AT = "2027-02-01T00:00:00.000Z"
const RESTORED_AT = "2027-02-01T00:15:00.000Z"
const LATER = "2027-06-01T00:00:00.000Z"

function item(text: string, overrides: Partial<NewItem> = {}): NewItem {
  const bytes = new TextEncoder().encode(text)
  return {
    bytes,
    // Not a real hash: the store keeps what it is told. Distinct text, distinct value.
    sha256: `sha-of-${text}`,
    contentType: "application/json",
    putBy: "routine",
    putAt: PUT_AT,
    ...overrides,
  }
}

/** Every byte value, so a BLOB that was read as text would corrupt. */
const EVERY_BYTE = Uint8Array.from({ length: 256 }, (_, index) => index)

describe("the migration", () => {
  it("an UPDATE of an item aborts", async () => {
    const db = await migrated()
    await d1Store(d1Shim(db)).put("brief", "digest-2026-10-21.json", item("a"))
    expect(() => db.run("UPDATE item SET size = 0")).toThrow(
      "item is append-only"
    )
    expect(() => db.run("UPDATE item SET body = x'00'")).toThrow(
      "item is append-only"
    )
  })

  it("a DELETE of an item aborts unless archived holds its row", async () => {
    const db = await migrated()
    await d1Store(d1Shim(db)).put("brief", "digest-2026-10-21.json", item("a"))
    const leaves = "an item leaves only into archived"
    expect(() => db.run("DELETE FROM item")).toThrow(leaves)
    expect(() => db.run("DELETE FROM item WHERE seq = 1")).toThrow(leaves)
    // A row that differs from the item in any column it is matched on is not it.
    const archivedRow = (seq: number, name: string, sha: string): void => {
      db.run(
        "INSERT INTO archived (seq, folder, name, sha256, size, content_type, put_by, put_at, archived_at) VALUES (?, 'brief', ?, ?, 1, 'application/json', 'routine', 'then', 'now')",
        [seq, name, sha]
      )
    }
    archivedRow(9, "digest-2026-10-21.json", "sha-of-a")
    archivedRow(10, "other.json", "sha-of-a")
    expect(() => db.run("DELETE FROM item WHERE seq = 1")).toThrow(leaves)
    expect(db.exec("SELECT count(*) FROM item").at(0)?.values).toEqual([[1]])
    archivedRow(1, "digest-2026-10-21.json", "sha-of-a")
    expect(() => db.run("DELETE FROM item WHERE seq = 1")).not.toThrow()
    expect(db.exec("SELECT count(*) FROM item").at(0)?.values).toEqual([[0]])
  })

  it("an index leaves item without an archived row only while a newer one of its routine is live", async () => {
    const db = await migrated()
    const index = (name: string): void => {
      db.run(
        "INSERT INTO item (folder, name, sha256, size, content_type, body, put_by, put_at) VALUES ('index', ?, 's', 1, 'application/json', x'7b7d', 'home', 'now')",
        [name]
      )
    }
    const jobs1 = "index-jobs-20261031T150000000Z.json"
    const jobs2 = "index-jobs-20261101T150000000Z.json"
    const topik = "index-topik-20261102T150000000Z.json"
    index(jobs1)
    const leaves = "an item leaves only into archived"
    const drop = (name: string): void => {
      db.run("DELETE FROM item WHERE name = ?", [name])
    }
    expect(() => {
      drop(jobs1)
    }).toThrow(leaves)
    index(topik)
    expect(() => {
      drop(jobs1)
    }).toThrow(leaves)
    index(jobs2)
    expect(() => {
      drop(jobs2)
    }).toThrow(leaves)
    expect(() => {
      drop(topik)
    }).toThrow(leaves)
    expect(() => {
      drop(jobs1)
    }).not.toThrow()
    expect(db.exec("SELECT name FROM item ORDER BY seq").at(0)?.values).toEqual(
      [[topik], [jobs2]]
    )
  })

  it("an archived name takes no other bytes, whoever inserts them", async () => {
    const db = await migrated()
    const store = d1Store(d1Shim(db))
    await store.put("brief", "b1.json", item("a"))
    await store.archive("brief", "b1.json", "sha-of-a", ARCHIVED_AT, LATER)
    expect(() =>
      db.run(
        "INSERT INTO item (folder, name, sha256, size, content_type, body, put_by, put_at) VALUES ('brief', 'b1.json', 'sha-of-b', 1, 'application/json', x'62', 'routine', 'now')"
      )
    ).toThrow("an archived name keeps its bytes")
    expect(db.exec("SELECT count(*) FROM item").at(0)?.values).toEqual([[0]])
  })

  it("an UPDATE or DELETE of archived or restored aborts", async () => {
    const db = await migrated()
    const store = d1Store(d1Shim(db))
    await store.put("brief", "b1.json", item("a"))
    await store.archive("brief", "b1.json", "sha-of-a", ARCHIVED_AT, LATER)
    await store.restore(
      "brief",
      "b1.json",
      new Uint8Array([97]),
      "sha-of-a",
      RESTORED_AT
    )
    for (const table of ["archived", "restored"]) {
      expect(() => db.run(`UPDATE ${table} SET seq = 7`)).toThrow(
        `${table} is append-only`
      )
      expect(() => db.run(`DELETE FROM ${table}`)).toThrow(
        `${table} is append-only`
      )
    }
  })

  it("a batch that fails part way leaves nothing behind", async () => {
    const db = await migrated()
    const shim = d1Shim(db)
    await d1Store(shim).put("brief", "b1.json", item("a"))
    await expect(
      shim.batch([
        shim
          .prepare(
            "INSERT INTO archived (seq, folder, name, sha256, size, content_type, put_by, put_at, archived_at) VALUES (1, 'brief', 'b1.json', 'sha-of-a', 1, 'application/json', 'routine', 'then', 'now')"
          )
          .bind(),
        shim.prepare("UPDATE item SET size = 0").bind(),
      ])
    ).rejects.toThrow("item is append-only")
    expect(db.exec("SELECT count(*) FROM archived").at(0)?.values).toEqual([
      [0],
    ])
  })

  it("a putter outside the two is refused by the table", async () => {
    const db = await migrated()
    const insert = (putBy: string): void => {
      db.run(
        "INSERT INTO item (folder, name, sha256, size, content_type, body, put_by, put_at) VALUES ('scene', 'n', 's', 0, 'application/json', x'00', ?, 'now')",
        [putBy]
      )
    }
    expect(() => insert("phone")).toThrow()
    expect(() => insert("home")).not.toThrow()
  })

  it("the rebuild for new folders keeps every row and seq, and seq goes on past every one archived", async () => {
    const db = await openSqlite()
    const files = migrationFiles()
    const rebuild = files.indexOf("0003_folders.sql")
    expect(rebuild).toBeGreaterThan(0)
    for (const file of files.slice(0, rebuild)) apply(db, file)
    const store = d1Store(d1Shim(db))
    await store.put("brief", "b1.json", item("1"))
    await store.put("brief", "b2.json", item("2"))
    await store.put("brief", "b3.json", item("3"))
    await store.archive("brief", "b3.json", "sha-of-3", ARCHIVED_AT, LATER)
    const before = db.exec(
      "SELECT seq, folder, name, sha256, body FROM item ORDER BY seq"
    )
    for (const file of files.slice(rebuild)) apply(db, file)

    expect(
      db.exec("SELECT seq, folder, name, sha256, body FROM item ORDER BY seq")
    ).toEqual(before)
    // b3 held seq 3 and is archived: the next item goes past it.
    expect(await store.put("scene", "s1.json", item("4"))).toEqual({
      change: "added",
      seq: 4,
    })
    expect(() => db.run("UPDATE item SET size = 0")).toThrow(
      "item is append-only"
    )
  })

  it("the rebuild carries seq past archived items when none is live, and starts at 1 on a table never used", async () => {
    const files = migrationFiles()
    const rebuild = files.indexOf("0003_folders.sql")
    const upTo = async (
      fill: (store: Store) => Promise<void>
    ): Promise<Store> => {
      const db = await openSqlite()
      for (const file of files.slice(0, rebuild)) apply(db, file)
      const store = d1Store(d1Shim(db))
      await fill(store)
      for (const file of files.slice(rebuild)) apply(db, file)
      return store
    }
    const allArchived = await upTo(async (store) => {
      await store.put("brief", "b1.json", item("1"))
      await store.put("brief", "b2.json", item("2"))
      await store.archive("brief", "b1.json", "sha-of-1", ARCHIVED_AT, LATER)
      await store.archive("brief", "b2.json", "sha-of-2", ARCHIVED_AT, LATER)
    })
    expect(await allArchived.put("drama", "d.json", item("3"))).toEqual({
      change: "added",
      seq: 3,
    })
    const unused = await upTo(() => Promise.resolve())
    expect(await unused.put("drama", "d.json", item("1"))).toEqual({
      change: "added",
      seq: 1,
    })
  })
})

describe.each([
  ["the in-memory store", (): Promise<Store> => Promise.resolve(memoryStore())],
  [
    "the D1 adapter on SQLite (BLOBs as arrays, as D1 returns them)",
    async (): Promise<Store> => d1Store(d1Shim(await migrated(), "array")),
  ],
  [
    "the D1 adapter on SQLite (BLOBs as bytes)",
    async (): Promise<Store> => d1Store(d1Shim(await migrated(), "bytes")),
  ],
])("%s", (_label, open) => {
  it("put then get round-trips bytes exactly", async () => {
    const store = await open()
    const stored = item("", { bytes: EVERY_BYTE, sha256: "sha-every-byte" })
    const added = await store.put("brief", "digest-2026-10-21.json", stored)
    expect(added).toEqual({ change: "added", seq: 1 })

    const got = await store.get("brief", "digest-2026-10-21.json")
    expect(got).toEqual({
      seq: 1,
      name: "digest-2026-10-21.json",
      size: 256,
      sha256: "sha-every-byte",
      contentType: "application/json",
      putAt: PUT_AT,
      liveSince: PUT_AT,
      bytes: EVERY_BYTE,
    })
  })

  it("the same bytes again are unchanged and keep their seq", async () => {
    const store = await open()
    await store.put("brief", "digest-2026-10-20.json", item("other"))
    await store.put("brief", "digest-2026-10-21.json", item("a"))
    const again = await store.put(
      "brief",
      "digest-2026-10-21.json",
      item("a", { putAt: "2030-01-01T00:00:00.000Z" })
    )
    expect(again).toEqual({ change: "unchanged", seq: 2 })
    expect((await store.get("brief", "digest-2026-10-21.json"))?.putAt).toBe(
      PUT_AT
    )
  })

  it("a second put of other bytes under the name is a conflict", async () => {
    const store = await open()
    await store.put("brief", "digest-2026-10-21.json", item("a"))
    const second = await store.put("brief", "digest-2026-10-21.json", item("b"))
    expect(second).toEqual({ change: "conflict" })
    const got = await store.get("brief", "digest-2026-10-21.json")
    expect(new TextDecoder().decode(got?.bytes)).toBe("a")
    expect(got?.sha256).toBe("sha-of-a")
  })

  it("a name is held per folder", async () => {
    const store = await open()
    expect((await store.put("brief", "same.json", item("a"))).change).toBe(
      "added"
    )
    expect(
      (await store.put("decisions", "same.json", item("b", { putBy: "home" })))
        .change
    ).toBe("added")
    expect(
      new TextDecoder().decode((await store.get("brief", "same.json"))?.bytes)
    ).toBe("a")
    expect(
      new TextDecoder().decode(
        (await store.get("decisions", "same.json"))?.bytes
      )
    ).toBe("b")
  })

  it("an absent name is null", async () => {
    const store = await open()
    expect(await store.get("brief", "digest-2026-10-21.json")).toBeNull()
  })

  it("list pages by seq within a folder, oldest first", async () => {
    const store = await open()
    await store.put("brief", "b1.json", item("1"))
    await store.put("decisions", "d1.json", item("2", { putBy: "home" }))
    await store.put("brief", "b2.json", item("3"))
    await store.put("brief", "b3.json", item("4"))

    const names = async (
      after: number,
      limit: number
    ): Promise<ReadonlyArray<string>> =>
      (await store.list("brief", after, limit)).map((entry) => entry.name)
    expect(await names(0, 50)).toEqual(["b1.json", "b2.json", "b3.json"])
    expect(await names(0, 2)).toEqual(["b1.json", "b2.json"])
    expect(await names(1, 50)).toEqual(["b2.json", "b3.json"])
    expect(await names(4, 50)).toEqual([])
  })

  it("list carries no body", async () => {
    const store = await open()
    await store.put("brief", "b1.json", item("1"))
    const [only] = await store.list("brief", 0, 50)
    expect(only).toEqual({
      seq: 1,
      name: "b1.json",
      size: 1,
      sha256: "sha-of-1",
      contentType: "application/json",
      putAt: PUT_AT,
      liveSince: PUT_AT,
    })
  })

  it("an index put drops the ones before it of its routine, and one older than the live one is superseded", async () => {
    const store = await open()
    const home = (text: string): NewItem => item(text, { putBy: "home" })
    const jobs1 = "index-jobs-20261031T150000000Z.json"
    const jobs2 = "index-jobs-20261101T150000000Z.json"
    const topik = "index-topik-20261030T150000000Z.json"
    expect(await store.put("index", jobs1, home("1"))).toEqual({
      change: "added",
      seq: 1,
    })
    expect((await store.put("index", topik, home("t"))).change).toBe("added")
    expect(await store.put("index", jobs1, home("1"))).toEqual({
      change: "unchanged",
      seq: 1,
    })
    expect((await store.put("index", jobs2, home("2"))).change).toBe("added")
    expect((await store.list("index", 0, 50)).map((meta) => meta.name)).toEqual(
      [topik, jobs2]
    )
    expect(await store.get("index", jobs1)).toBeNull()
    expect(await store.archivedOf("index", jobs1)).toBeNull()
    expect(await store.put("index", jobs1, home("1"))).toEqual({
      change: "superseded",
    })
    expect((await store.list("index", 0, 50)).map((meta) => meta.name)).toEqual(
      [topik, jobs2]
    )
    expect(
      new TextDecoder().decode((await store.get("index", jobs2))?.bytes)
    ).toBe("2")
  })

  it("archiving moves an old item's metadata into archived and drops its bytes", async () => {
    const store = await open()
    await store.put("brief", "b1.json", item("1"))
    await store.put("brief", "b2.json", item("2"))
    expect(
      await store.archive("brief", "b1.json", "sha-of-1", ARCHIVED_AT, LATER)
    ).toEqual({ change: "archived" })

    expect(await store.get("brief", "b1.json")).toBeNull()
    expect((await store.list("brief", 0, 50)).map((i) => i.name)).toEqual([
      "b2.json",
    ])
    const row = {
      seq: 1,
      name: "b1.json",
      size: 1,
      sha256: "sha-of-1",
      contentType: "application/json",
      putAt: PUT_AT,
      archivedAt: ARCHIVED_AT,
    }
    expect(await store.archivedOf("brief", "b1.json")).toEqual(row)
    expect(await store.listArchived("brief", 0, 50)).toEqual([row])
    expect(await store.listArchived("brief", 1, 50)).toEqual([])
    expect(await store.listArchived("decisions", 0, 50)).toEqual([])
  })

  it("archiving says why it did not: again, absent, other bytes, too young", async () => {
    const store = await open()
    await store.put("brief", "b1.json", item("1"))
    await store.put("brief", "b2.json", item("2"))
    await store.archive("brief", "b1.json", "sha-of-1", ARCHIVED_AT, LATER)

    const archive = (
      name: string,
      sha: string,
      before = LATER
    ): Promise<ArchiveResult> =>
      store.archive("brief", name, sha, ARCHIVED_AT, before)
    expect(await archive("b1.json", "sha-of-1")).toEqual({
      change: "unchanged",
    })
    expect(await archive("b1.json", "sha-of-9")).toEqual({ change: "mismatch" })
    expect(await archive("b9.json", "sha-of-9")).toEqual({ change: "absent" })
    expect(await archive("b2.json", "sha-of-9")).toEqual({ change: "mismatch" })
    expect(await archive("b2.json", "sha-of-2", EARLIER)).toEqual({
      change: "too_young",
    })
    // None of those moved anything.
    expect((await store.get("brief", "b2.json"))?.sha256).toBe("sha-of-2")
    expect(await store.listArchived("brief", 0, 50)).toHaveLength(1)
  })

  it("an archived name is still held: the same bytes are unchanged, others conflict", async () => {
    const store = await open()
    await store.put("brief", "b1.json", item("1"))
    await store.archive("brief", "b1.json", "sha-of-1", ARCHIVED_AT, LATER)
    expect(await store.put("brief", "b1.json", item("1"))).toEqual({
      change: "unchanged",
      seq: 1,
    })
    expect(await store.put("brief", "b1.json", item("2"))).toEqual({
      change: "conflict",
    })
    expect(await store.get("brief", "b1.json")).toBeNull()
  })

  it("an ask for an archived item waits until home puts its bytes back", async () => {
    const store = await open()
    await store.put("brief", "b1.json", item("1"))
    await store.put("brief", "b2.json", item("2"))
    expect(await store.ask("brief", "b1.json", ASKED_AT)).toEqual({
      change: "live",
    })
    expect(await store.ask("brief", "b9.json", ASKED_AT)).toEqual({
      change: "not_archived",
    })
    await store.archive("brief", "b1.json", "sha-of-1", ARCHIVED_AT, LATER)
    expect(await store.ask("brief", "b1.json", ASKED_AT)).toEqual({
      change: "asked",
    })
    expect(await store.ask("brief", "b1.json", LATER)).toEqual({
      change: "unchanged",
    })
    expect(await store.listWanted("brief", 50)).toEqual([
      { name: "b1.json", askedAt: ASKED_AT },
    ])
    expect(await store.listWanted("decisions", 50)).toEqual([])
  })

  it("a restore puts the archived bytes back under a new seq and closes the ask", async () => {
    const store = await open()
    await store.put("brief", "b1.json", item("1"))
    await store.put("brief", "b2.json", item("2"))
    await store.archive("brief", "b1.json", "sha-of-1", ARCHIVED_AT, LATER)
    await store.ask("brief", "b1.json", ASKED_AT)

    const bytes = new TextEncoder().encode("1")
    expect(
      await store.restore("brief", "b1.json", bytes, "sha-of-9", RESTORED_AT)
    ).toEqual({ change: "mismatch" })
    // The wrong bytes leave the ask open.
    expect(await store.listWanted("brief", 50)).toHaveLength(1)
    expect(
      await store.restore("brief", "b9.json", bytes, "sha-of-9", RESTORED_AT)
    ).toEqual({ change: "not_archived" })

    expect(
      await store.restore("brief", "b1.json", bytes, "sha-of-1", RESTORED_AT)
    ).toEqual({ change: "restored", seq: 3 })
    expect(await store.listWanted("brief", 50)).toEqual([])
    const back = await store.get("brief", "b1.json")
    expect(back).toEqual({
      seq: 3,
      name: "b1.json",
      size: 1,
      sha256: "sha-of-1",
      contentType: "application/json",
      putAt: PUT_AT,
      liveSince: RESTORED_AT,
      bytes,
    })
    expect(
      await store.restore("brief", "b1.json", bytes, "sha-of-1", LATER)
    ).toEqual({ change: "unchanged", seq: 3 })
    expect((await store.get("brief", "b1.json"))?.liveSince).toBe(RESTORED_AT)
    // A put names the live copy's seq, not the archived one's.
    expect(await store.put("brief", "b1.json", item("1"))).toEqual({
      change: "unchanged",
      seq: 3,
    })

    // Counted from its return, it is too young to go home again.
    expect(
      await store.archive("brief", "b1.json", "sha-of-1", LATER, ARCHIVED_AT)
    ).toEqual({ change: "too_young" })
    expect(
      await store.archive("brief", "b1.json", "sha-of-1", LATER, LATER)
    ).toEqual({ change: "archived" })
    expect(
      (await store.listArchived("brief", 0, 50)).map((row) => row.seq)
    ).toEqual([1, 3])
  })
})

describe("MB5: nothing in the workspace issues a statement that rewrites an item", () => {
  const SRC = join(import.meta.dirname, "..")
  // The words appear in prose comments, so comments are cut before the scan.
  // `DELETE FROM` is matched apart: three are allowed (below).
  const REWRITES =
    /\b(UPDATE\s+\w+\s+SET|REPLACE\s+INTO|OR\s+REPLACE|DO\s+UPDATE)\b/i
  const DELETES = /\bDELETE\s+FROM\s+(\w+)/gi
  const UNGUARDS = /\b(DROP\s+(TRIGGER|TABLE)|ALTER\s+TABLE\s+item)\b/i
  /**
   * 0003's rebuild of `item` for new folders, the one place a migration may
   * set the sequence and drop and rename the table: the rebuild test checks
   * every row and trigger survives it.
   */
  const REBUILD =
    /\bUPDATE sqlite_sequence\s+SET seq = MAX\(seq, COALESCE\(\(SELECT seq FROM sqlite_sequence WHERE name = 'item'\), 0\)\)\s+WHERE name = 'item_next';\s*DROP TABLE item;\s*ALTER TABLE item_next RENAME TO item;/
  /** The one trigger a migration may drop: 0002 replaces it in the same file. */
  const REPLACED_TRIGGER = /\bDROP\s+TRIGGER\s+item_is_append_only_delete\s*;/i
  /**
   * 0004 replaces the delete trigger in the same file, with the index's one
   * exception; the trigger cases above fail if it lets anything else go.
   */
  const REPLACED_FOR_INDEX =
    /\bDROP\s+TRIGGER\s+item_leaves_only_into_archived\s*;(?=\s*CREATE\s+TRIGGER\s+item_leaves_only_into_archived\s+BEFORE\s+DELETE\s+ON\s+item\b)/i
  const tsCode = (text: string): string =>
    text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
  const sqlCode = (text: string): string => text.replace(/--[^\n]*/g, "")

  it("the scan flags each statement it is there to catch, and not the adapter's own", () => {
    for (const bad of [
      "INSERT OR REPLACE INTO item (a) VALUES (1)",
      "REPLACE INTO item (a) VALUES (1)",
      "UPDATE item SET size = 0",
      "INSERT INTO item (a) VALUES (1) ON CONFLICT (a) DO UPDATE SET a = 2",
    ]) {
      expect(bad).toMatch(REWRITES)
    }
    // The rebuild's exemption is its exact text: a statement slipped inside
    // it is no longer exempt.
    expect(
      "UPDATE sqlite_sequence\n  SET seq = 1; UPDATE item SET size = 0\n  WHERE name = 'item_next';\nDROP TABLE item;\nALTER TABLE item_next RENAME TO item;"
    ).not.toMatch(REBUILD)
    for (const bad of [
      "DROP TRIGGER item_is_append_only_update",
      "ALTER TABLE item ADD x",
    ]) {
      expect(bad).toMatch(UNGUARDS)
    }
    expect(
      "INSERT INTO item (a) VALUES (1) ON CONFLICT (folder, name) DO NOTHING"
    ).not.toMatch(REWRITES)
  })

  it("no source file issues one, and deletes only the archive's bytes, an index a newer one replaced, and a closed ask", () => {
    const files = readdirSync(SRC).filter((file) => file.endsWith(".ts"))
    // A directory that moved would otherwise leave nothing to scan.
    expect(files).toEqual(
      expect.arrayContaining(["core.ts", "index.ts", "store.ts"])
    )
    const code = files.map((file) => ({
      file,
      text: tsCode(readFileSync(join(SRC, file), "utf8")),
    }))
    expect(
      code.filter(({ text }) => REWRITES.test(text)).map(({ file }) => file)
    ).toEqual([])
    const deletes = code.flatMap(({ file, text }) =>
      [...text.matchAll(DELETES)].map((found) => `${file}: ${found[1] ?? ""}`)
    )
    expect(deletes.sort()).toEqual([
      "store.ts: item",
      "store.ts: item",
      "store.ts: wanted",
    ])
  })

  it("no migration rewrites an item or removes what guards it", () => {
    const files = readdirSync(MIGRATIONS).filter((file) =>
      file.endsWith(".sql")
    )
    expect(files).toEqual(
      expect.arrayContaining(["0001_create_item.sql", "0002_archive.sql"])
    )
    const offenders = files.filter((file) => {
      let sql = sqlCode(readFileSync(join(MIGRATIONS, file), "utf8"))
      if (file === "0002_archive.sql") sql = sql.replace(REPLACED_TRIGGER, "")
      if (file === "0003_folders.sql") sql = sql.replace(REBUILD, "")
      if (file === "0004_index_view.sql") {
        sql = sql.replace(REPLACED_FOR_INDEX, "")
      }
      return (
        REWRITES.test(sql) ||
        UNGUARDS.test(sql) ||
        /\bDELETE\s+FROM\b/i.test(sql)
      )
    })
    expect(offenders).toEqual([])
  })
})
