/**
 * The phone's room as a pull reads it (PULL4): read again, said when it
 * could not be, and read once for every screen that shows it at once.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

const phone = vi.hoisted(() => ({ reads: 0, fails: false }))

vi.mock("@/lib/device-backend/boot", () => ({
  deviceBackend: (): Promise<unknown> => {
    phone.reads += 1
    return phone.fails
      ? Promise.reject(new Error("no database"))
      : Promise.resolve({ context: { db: null, budget: 0 } })
  },
}))
vi.mock("@/lib/device-backend/storage", () => ({
  storageUse: (): Promise<unknown> =>
    Promise.resolve({ databaseBytes: 1, webViewBytes: 2, quotaBytes: 3 }),
  readPruneNotice: (): Promise<null> => Promise.resolve(null),
  onSaveRefused: (): void => undefined,
  dismissPruneNotice: (): Promise<void> => Promise.resolve(),
}))
vi.mock("@/lib/device-backend/handlers/sessions", () => ({
  oldestRemovable: (): Promise<null> => Promise.resolve(null),
}))

const { deviceStorage } = await import("@/lib/device-backend/storage-view")

afterEach(() => {
  phone.reads = 0
  phone.fails = false
})

describe("a pull's read of the phone's room", () => {
  it("reads it again, and shows what it read", async () => {
    await expect(deviceStorage.check()).resolves.toBeUndefined()
    expect(deviceStorage.getSnapshot()?.use.quotaBytes).toBe(3)
    expect(phone.reads).toBe(1)
  })

  it("says it could not read it", async () => {
    phone.fails = true
    await expect(deviceStorage.check()).rejects.toThrow()
  })

  it("is read once for two screens asking at once, and again for the next pull", async () => {
    await Promise.all([deviceStorage.check(), deviceStorage.check()])
    expect(phone.reads).toBe(1)
    await deviceStorage.check()
    expect(phone.reads).toBe(2)
  })
})
