/**
 * MigrationLedger unit tests.
 *
 * runMigrations() is pure logic with an injectable StorageAdapter, so these
 * tests run entirely in the Playwright test-runner (Node.js) process — no
 * browser page required.
 */

import {
  runMigrations,
  type Migration,
  type MigrationContext,
  type StorageAdapter,
} from "@common/lib/migration-ledger"
import { expect, test } from "@playwright/test"

function makeStorage(): StorageAdapter & { _store: Record<string, string> } {
  const _store: Record<string, string> = {}
  return {
    _store,
    getItem(k: string): string | null {
      return k in _store ? (_store[k] ?? null) : null
    },
    setItem(k: string, v: string): void {
      _store[k] = v
    },
    removeItem(k: string): void {
      delete _store[k]
    },
  }
}

function resolved(): Promise<void> {
  return Promise.resolve()
}

// ─────────────────────────────────────────────────────────────────────────────
// Independent namespace counters
// ─────────────────────────────────────────────────────────────────────────────

test("independent counters: namespace w and u never interfere", async () => {
  const storage = makeStorage()

  const wMigrations: Array<Migration> = [
    {
      to: 1,
      up(ctx: MigrationContext): Promise<void> {
        ctx.set("flag", "w-applied")
        return resolved()
      },
    },
  ]
  const uMigrations: Array<Migration> = [
    {
      to: 1,
      up(ctx: MigrationContext): Promise<void> {
        ctx.set("flag", "u-applied")
        return resolved()
      },
    },
  ]

  await runMigrations("w", wMigrations, storage)
  await runMigrations("u", uMigrations, storage)

  expect(storage.getItem("w.__migration_version")).toBe("1")
  expect(storage.getItem("u.__migration_version")).toBe("1")
  expect(storage.getItem("w.flag")).toBe("w-applied")
  expect(storage.getItem("u.flag")).toBe("u-applied")
})

test("independent counters: w at version 3 and u at version 1 coexist without coupling", async () => {
  const storage = makeStorage()

  const wMigrations: Array<Migration> = [
    {
      to: 1,
      up(ctx: MigrationContext): Promise<void> {
        ctx.set("step", "1")
        return resolved()
      },
    },
    {
      to: 2,
      up(ctx: MigrationContext): Promise<void> {
        ctx.set("step", "2")
        return resolved()
      },
    },
    {
      to: 3,
      up(ctx: MigrationContext): Promise<void> {
        ctx.set("step", "3")
        return resolved()
      },
    },
  ]
  const uMigrations: Array<Migration> = [
    {
      to: 1,
      up(ctx: MigrationContext): Promise<void> {
        ctx.set("step", "1")
        return resolved()
      },
    },
  ]

  await runMigrations("w", wMigrations, storage)
  await runMigrations("u", uMigrations, storage)

  expect(storage.getItem("w.__migration_version")).toBe("3")
  expect(storage.getItem("u.__migration_version")).toBe("1")
  expect(storage.getItem("w.step")).toBe("3")
  expect(storage.getItem("u.step")).toBe("1")
})

// ─────────────────────────────────────────────────────────────────────────────
// Idempotent re-run
// ─────────────────────────────────────────────────────────────────────────────

test("idempotent: re-running an already-applied migration set is a no-op", async () => {
  const storage = makeStorage()
  let callCount = 0

  const migrations: Array<Migration> = [
    {
      to: 1,
      up(ctx: MigrationContext): Promise<void> {
        callCount++
        ctx.set("x", "hello")
        return resolved()
      },
    },
  ]

  await runMigrations("ns", migrations, storage)
  await runMigrations("ns", migrations, storage)
  await runMigrations("ns", migrations, storage)

  expect(callCount).toBe(1)
  expect(storage.getItem("ns.__migration_version")).toBe("1")
  expect(storage.getItem("ns.x")).toBe("hello")
})

test("idempotent: running a superset of migrations only applies new ones", async () => {
  const storage = makeStorage()
  const applied: Array<number> = []

  const first: Array<Migration> = [
    {
      to: 1,
      up(): Promise<void> {
        applied.push(1)
        return resolved()
      },
    },
    {
      to: 2,
      up(): Promise<void> {
        applied.push(2)
        return resolved()
      },
    },
  ]
  const second: Array<Migration> = [
    {
      to: 1,
      up(): Promise<void> {
        applied.push(1)
        return resolved()
      },
    },
    {
      to: 2,
      up(): Promise<void> {
        applied.push(2)
        return resolved()
      },
    },
    {
      to: 3,
      up(): Promise<void> {
        applied.push(3)
        return resolved()
      },
    },
  ]

  await runMigrations("ns", first, storage)
  await runMigrations("ns", second, storage)

  expect(applied).toEqual([1, 2, 3])
  expect(storage.getItem("ns.__migration_version")).toBe("3")
})

// ─────────────────────────────────────────────────────────────────────────────
// Partial-apply resumes correctly
// ─────────────────────────────────────────────────────────────────────────────

test("partial-apply: resumes from where a prior partial run stopped", async () => {
  const storage = makeStorage()
  const applied: Array<number> = []

  // Simulate a partial run: manually set version to 2
  storage.setItem("ns.__migration_version", "2")

  const migrations: Array<Migration> = [
    {
      to: 1,
      up(): Promise<void> {
        applied.push(1)
        return resolved()
      },
    },
    {
      to: 2,
      up(): Promise<void> {
        applied.push(2)
        return resolved()
      },
    },
    {
      to: 3,
      up(): Promise<void> {
        applied.push(3)
        return resolved()
      },
    },
    {
      to: 4,
      up(): Promise<void> {
        applied.push(4)
        return resolved()
      },
    },
  ]

  await runMigrations("ns", migrations, storage)

  expect(applied).toEqual([3, 4])
  expect(storage.getItem("ns.__migration_version")).toBe("4")
})

test("partial-apply: version persists after each step so a crash mid-run resumes correctly", async () => {
  const storage = makeStorage()
  const persisted: Array<string> = []

  const origSet = storage.setItem.bind(storage)
  storage.setItem = (k: string, v: string): void => {
    origSet(k, v)
    if (k === "ns.__migration_version") persisted.push(v)
  }

  const migrations: Array<Migration> = [
    {
      to: 1,
      up(): Promise<void> {
        return resolved()
      },
    },
    {
      to: 2,
      up(): Promise<void> {
        return resolved()
      },
    },
    {
      to: 3,
      up(): Promise<void> {
        return resolved()
      },
    },
  ]

  await runMigrations("ns", migrations, storage)

  expect(persisted).toEqual(["1", "2", "3"])
})

// ─────────────────────────────────────────────────────────────────────────────
// Out-of-order `to` rejected
// ─────────────────────────────────────────────────────────────────────────────

test("out-of-order: throws when migrations are not strictly monotonically increasing", async () => {
  const storage = makeStorage()

  const bad: Array<Migration> = [
    {
      to: 1,
      up(): Promise<void> {
        return resolved()
      },
    },
    {
      to: 3,
      up(): Promise<void> {
        return resolved()
      },
    },
    {
      to: 2,
      up(): Promise<void> {
        return resolved()
      },
    },
  ]

  await expect(runMigrations("ns", bad, storage)).rejects.toThrow()
})

test("out-of-order: throws when two migrations share the same `to` value", async () => {
  const storage = makeStorage()

  const dup: Array<Migration> = [
    {
      to: 1,
      up(): Promise<void> {
        return resolved()
      },
    },
    {
      to: 1,
      up(): Promise<void> {
        return resolved()
      },
    },
  ]

  await expect(runMigrations("ns", dup, storage)).rejects.toThrow()
})

// ─────────────────────────────────────────────────────────────────────────────
// MigrationContext namespace isolation
// ─────────────────────────────────────────────────────────────────────────────

test("ctx.set prefixes all keys with the namespace", async () => {
  const storage = makeStorage()

  await runMigrations(
    "myns",
    [
      {
        to: 1,
        up(ctx: MigrationContext): Promise<void> {
          ctx.set("data", "value")
          return resolved()
        },
      },
    ],
    storage
  )

  expect(storage.getItem("myns.data")).toBe("value")
  expect(storage.getItem("data")).toBeNull()
})

test("ctx.get reads only from the namespace", async () => {
  const storage = makeStorage()
  storage.setItem("other.shared", "alien")
  storage.setItem("myns.shared", "mine")

  let seen: string | null = null
  await runMigrations(
    "myns",
    [
      {
        to: 1,
        up(ctx: MigrationContext): Promise<void> {
          seen = ctx.get("shared")
          return resolved()
        },
      },
    ],
    storage
  )

  expect(seen).toBe("mine")
})

test("ctx.remove deletes only the namespaced key", async () => {
  const storage = makeStorage()
  storage.setItem("myns.temp", "yes")
  storage.setItem("other.temp", "also-yes")

  await runMigrations(
    "myns",
    [
      {
        to: 1,
        up(ctx: MigrationContext): Promise<void> {
          ctx.remove("temp")
          return resolved()
        },
      },
    ],
    storage
  )

  expect(storage.getItem("myns.temp")).toBeNull()
  expect(storage.getItem("other.temp")).toBe("also-yes")
})
