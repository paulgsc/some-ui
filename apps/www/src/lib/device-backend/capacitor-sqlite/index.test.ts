/**
 * The SQLite port against the plugin's own JavaScript (`SQLiteConnection`,
 * `SQLiteDBConnection`, unmocked), with only its native side replaced: a
 * Proxy that, like the bridge's, answers every key, so nothing here passes
 * on a plain object a phone would not hand back. What `callForeign` itself
 * promises is `@some-ui/intent-kit`'s to test; what is this port's is that
 * it opens and queries through it, and what the plugin's failures mean.
 */
import type * as CapacitorSqlite from "@capacitor-community/sqlite"
import type * as CapacitorCore from "@capacitor/core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DeviceStorageError } from "@/lib/device-backend/sql"

import { openCapacitorSqlite } from "./index"

/** The native methods a case defines; any other never answers. */
const native = vi.hoisted(
  (): { methods: Record<string, () => Promise<unknown>> } => ({
    methods: {},
  })
)

vi.mock("@capacitor/core", async (importOriginal) => ({
  ...(await importOriginal<typeof CapacitorCore>()),
  Capacitor: { isNativePlatform: (): boolean => true },
}))
vi.mock("@capacitor-community/sqlite", async (importOriginal) => ({
  ...(await importOriginal<typeof CapacitorSqlite>()),
  CapacitorSQLite: new Proxy(
    {},
    {
      get: (_target, key): unknown =>
        typeof key === "string" && key in native.methods
          ? native.methods[key]
          : (): Promise<never> => new Promise(() => undefined),
    }
  ),
}))

/** How the plugin rejects every call once its `load()` has failed. */
const notLoaded = (): Promise<never> =>
  Promise.reject(new Error("CapacitorSQLitePlugin: null"))

describe("openCapacitorSqlite", () => {
  beforeEach(() => {
    native.methods = {}
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("opens the database and queries it through the plugin", async () => {
    native.methods = {
      checkConnectionsConsistency: (): Promise<unknown> =>
        Promise.resolve({ result: true }),
      createConnection: (): Promise<unknown> => Promise.resolve(),
      open: (): Promise<unknown> => Promise.resolve(),
      query: (): Promise<unknown> =>
        Promise.resolve({ values: [{ id: "s1" }] }),
    }
    const driver = await openCapacitorSqlite("test")
    await expect(driver.all("SELECT id FROM sessions")).resolves.toEqual([
      { id: "s1" },
    ])
    expect(console.error).not.toHaveBeenCalled()
  })

  it("is unavailable, no retry offered, when the plugin never loaded, and says so with its words", async () => {
    native.methods = { checkConnectionsConsistency: notLoaded }
    const opened = openCapacitorSqlite("test")
    await expect(opened).rejects.toBeInstanceOf(DeviceStorageError)
    await expect(opened).rejects.toMatchObject({
      error: { kind: "unavailable", retryable: false },
    })
    expect(console.error).toHaveBeenCalledWith(
      "foreign-failure",
      expect.stringContaining("[device storage] unavailable"),
      expect.objectContaining({ message: "CapacitorSQLitePlugin: null" })
    )
  })

  it("fails by its deadline when the plugin never answers", async () => {
    vi.useFakeTimers()
    const opened = openCapacitorSqlite("test")
    const settled = expect(opened).rejects.toMatchObject({
      error: { kind: "unreachable", retryable: true },
    })
    await vi.advanceTimersByTimeAsync(30_000)
    await settled
  })

  it("reads a failed statement as the storage's, retryable", async () => {
    native.methods = {
      checkConnectionsConsistency: (): Promise<unknown> =>
        Promise.resolve({ result: true }),
      createConnection: (): Promise<unknown> => Promise.resolve(),
      open: (): Promise<unknown> => Promise.resolve(),
      run: (): Promise<unknown> =>
        Promise.reject(new Error("Run: disk I/O error")),
    }
    const driver = await openCapacitorSqlite("test")
    await expect(driver.run("DELETE FROM sessions")).rejects.toMatchObject({
      error: { kind: "unknown", retryable: true },
    })
  })
})
