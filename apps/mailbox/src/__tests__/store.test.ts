import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { NewItem, Store } from "@mailbox/store"
import { d1Store } from "@mailbox/store"
import type { Database } from "sql.js"
import { describe, expect, it } from "vitest"

import { d1Shim, openSqlite } from "./d1-shim"
import { memoryStore } from "./stores"

const MIGRATIONS = join(import.meta.dirname, "..", "..", "migrations")

/** A database with every migration applied, in order, as `wrangler d1 migrations apply` does. */
async function migrated(): Promise<Database> {
  const files = readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith(".sql"))
    .sort()
  // The first migration is the one this suite is written against.
  expect(files).toContain("0001_create_item.sql")
  const db = await openSqlite()
  for (const file of files) {
    db.exec(readFileSync(join(MIGRATIONS, file), "utf8"))
  }
  return db
}

const PUT_AT = "2026-10-21T14:52:00.000Z"

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

  it("a DELETE of an item aborts", async () => {
    const db = await migrated()
    await d1Store(d1Shim(db)).put("brief", "digest-2026-10-21.json", item("a"))
    expect(() => db.run("DELETE FROM item")).toThrow("item is append-only")
    expect(() => db.run("DELETE FROM item WHERE seq = 1")).toThrow(
      "item is append-only"
    )
    expect(db.exec("SELECT count(*) FROM item").at(0)?.values).toEqual([[1]])
  })

  it("a folder or a putter outside the two lists is refused by the table", async () => {
    const db = await migrated()
    const insert = (folder: string, putBy: string): void => {
      db.run(
        "INSERT INTO item (folder, name, sha256, size, content_type, body, put_by, put_at) VALUES (?, 'n', 's', 0, 'application/json', x'00', ?, 'now')",
        [folder, putBy]
      )
    }
    expect(() => insert("voice", "home")).toThrow()
    expect(() => insert("brief", "phone")).toThrow()
    expect(() => insert("brief", "home")).not.toThrow()
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
    })
  })
})

describe("MB1: nothing in the workspace issues a statement that rewrites an item", () => {
  const SRC = join(import.meta.dirname, "..")
  // The words appear in prose comments, so comments are cut before the scan.
  const REWRITES =
    /\b(UPDATE\s+\w+\s+SET|DELETE\s+FROM|REPLACE\s+INTO|OR\s+REPLACE|DO\s+UPDATE)\b/i
  const UNGUARDS = /\b(DROP\s+(TRIGGER|TABLE)|ALTER\s+TABLE\s+item)\b/i
  const tsCode = (text: string): string =>
    text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
  const sqlCode = (text: string): string => text.replace(/--[^\n]*/g, "")

  it("the scan flags each statement it is there to catch, and not the adapter's own", () => {
    for (const bad of [
      "INSERT OR REPLACE INTO item (a) VALUES (1)",
      "REPLACE INTO item (a) VALUES (1)",
      "UPDATE item SET size = 0",
      "DELETE FROM item WHERE seq = 1",
      "INSERT INTO item (a) VALUES (1) ON CONFLICT (a) DO UPDATE SET a = 2",
    ]) {
      expect(bad).toMatch(REWRITES)
    }
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

  it("no source file issues one", () => {
    const files = readdirSync(SRC).filter((file) => file.endsWith(".ts"))
    // A directory that moved would otherwise leave nothing to scan.
    expect(files).toEqual(
      expect.arrayContaining(["core.ts", "index.ts", "store.ts"])
    )
    const offenders = files.filter((file) =>
      REWRITES.test(tsCode(readFileSync(join(SRC, file), "utf8")))
    )
    expect(offenders).toEqual([])
  })

  it("no migration rewrites an item or removes what guards it", () => {
    const files = readdirSync(MIGRATIONS).filter((file) =>
      file.endsWith(".sql")
    )
    expect(files).toContain("0001_create_item.sql")
    const offenders = files.filter((file) => {
      const sql = sqlCode(readFileSync(join(MIGRATIONS, file), "utf8"))
      return REWRITES.test(sql) || UNGUARDS.test(sql)
    })
    expect(offenders).toEqual([])
  })
})
