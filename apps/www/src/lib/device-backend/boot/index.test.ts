/**
 * When the device backend opens its database, and what it keeps of a
 * failure: one no retry in this process can fix (the plugin never loaded)
 * is kept, so every request says the same true thing at once; any other is
 * forgotten, so "Try again" opens again.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { DeviceBackend } from "@/lib/device-backend/interceptor"
import type * as Sql from "@/lib/device-backend/sql"

import type * as Boot from "./index"

const mocks = vi.hoisted(() => ({
  openCapacitorSqlite: vi.fn(),
  installNativeLog: vi.fn(),
  writeNativeLog: vi.fn(),
}))
vi.mock("@/lib/device-backend/capacitor-sqlite", () => ({
  openCapacitorSqlite: mocks.openCapacitorSqlite,
}))
vi.mock("@/lib/device-backend/backend", () => ({
  openDeviceBackend: (db: unknown): Promise<unknown> => Promise.resolve({ db }),
}))
vi.mock("@/lib/native-log", () => ({
  installNativeLog: mocks.installNativeLog,
  writeNativeLog: mocks.writeNativeLog,
}))

type Fresh = typeof Boot & {
  DeviceStorageError: typeof Sql.DeviceStorageError
  storageFailure: (retryable: boolean) => Error
}

/**
 * A fresh copy of the module, so no test inherits another's open, with the
 * error class from the same fresh graph (`instanceof` is per copy).
 */
async function boot(): Promise<Fresh> {
  vi.resetModules()
  const { DeviceStorageError } = await import("@/lib/device-backend/sql")
  return {
    ...(await import("./index")),
    DeviceStorageError,
    storageFailure: (retryable) =>
      new DeviceStorageError({
        kind: retryable ? "unreachable" : "unavailable",
        retryable,
        summary: "This phone's storage couldn't be opened.",
        cause: new Error("CapacitorSQLitePlugin: null"),
      }),
  }
}

describe("deviceBackend", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("opens once, with the native log installed first and told when it opened", async () => {
    const order: Array<string> = []
    mocks.installNativeLog.mockImplementation(() => order.push("log"))
    mocks.openCapacitorSqlite.mockImplementation(() => {
      order.push("open")
      return Promise.resolve("db")
    })
    const { deviceBackend, DEVICE_STORAGE_OPENED } = await boot()
    const [first, second]: Array<DeviceBackend> = await Promise.all([
      deviceBackend(),
      deviceBackend(),
    ])
    expect(first).toBe(second)
    expect(order).toEqual(["log", "open"])
    expect(mocks.writeNativeLog).toHaveBeenCalledWith(DEVICE_STORAGE_OPENED)
  })

  it("keeps a failure no retry can fix, without asking the plugin again", async () => {
    const { deviceBackend, DeviceStorageError, storageFailure } = await boot()
    mocks.openCapacitorSqlite.mockRejectedValue(storageFailure(false))
    await expect(deviceBackend()).rejects.toBeInstanceOf(DeviceStorageError)
    await expect(deviceBackend()).rejects.toBeInstanceOf(DeviceStorageError)
    expect(mocks.openCapacitorSqlite).toHaveBeenCalledTimes(1)
  })

  it("forgets any other failure, so the next request opens again", async () => {
    const { deviceBackend, DeviceStorageError, storageFailure } = await boot()
    mocks.openCapacitorSqlite
      .mockRejectedValueOnce(storageFailure(true))
      .mockRejectedValueOnce(new Error("a migration bug"))
      .mockResolvedValueOnce("db")
    await expect(deviceBackend()).rejects.toBeInstanceOf(DeviceStorageError)
    await expect(deviceBackend()).rejects.toThrow("a migration bug")
    await expect(deviceBackend()).resolves.toEqual({ db: "db" })
    expect(mocks.openCapacitorSqlite).toHaveBeenCalledTimes(3)
  })
})

describe("bootDeviceBackend", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("installs the native log at boot, before any request opens the database", async () => {
    vi.stubEnv("VITE_DEVICE_BACKEND", "true")
    vi.stubGlobal("window", { location: new URL("https://localhost/") })
    vi.stubGlobal(
      "fetch",
      (): Promise<Response> => Promise.reject(new Error("unused"))
    )
    const { bootDeviceBackend } = await boot()
    bootDeviceBackend()
    await vi.waitFor(() => expect(mocks.installNativeLog).toHaveBeenCalled())
    expect(mocks.openCapacitorSqlite).not.toHaveBeenCalled()
  })
})
