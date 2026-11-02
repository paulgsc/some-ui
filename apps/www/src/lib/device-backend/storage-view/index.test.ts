/**
 * The phone's room as a pull reads it (PULL4): read again, said when it
 * could not be, and never put back by a read that lands after a newer one.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

const phone = vi.hoisted(
  (): {
    fails: boolean
    /** Each read's room, answered when the test says (`answer`). */
    pending: Array<(quotaBytes: number) => void>
  } => ({ fails: false, pending: [] })
)

vi.mock("@/lib/device-backend/boot", () => ({
  deviceBackend: (): Promise<unknown> =>
    phone.fails
      ? Promise.reject(new Error("no database"))
      : Promise.resolve({ context: { db: null, budget: 0 } }),
}))
vi.mock("@/lib/device-backend/storage", () => ({
  storageUse: (): Promise<unknown> =>
    new Promise((resolve) => {
      phone.pending.push((quotaBytes) =>
        resolve({ databaseBytes: 0, webViewBytes: 0, quotaBytes })
      )
    }),
  readPruneNotice: (): Promise<null> => Promise.resolve(null),
  onSaveRefused: (): void => undefined,
  dismissPruneNotice: (): Promise<void> => Promise.resolve(),
}))
vi.mock("@/lib/device-backend/handlers/sessions", () => ({
  oldestRemovable: (): Promise<null> => Promise.resolve(null),
}))

const { deviceStorage } = await import("@/lib/device-backend/storage-view")

/** Answers the `index`th read still waiting with `quotaBytes`. */
async function answer(index: number, quotaBytes: number): Promise<void> {
  await vi.waitFor(() => expect(phone.pending[index]).toBeDefined())
  phone.pending[index]?.(quotaBytes)
}

afterEach(() => {
  phone.fails = false
  phone.pending = []
})

describe("a pull's read of the phone's room", () => {
  it("reads it again, and shows what it read", async () => {
    const checked = deviceStorage.check()
    await answer(0, 3)
    await expect(checked).resolves.toBeUndefined()
    expect(deviceStorage.getSnapshot()?.use.quotaBytes).toBe(3)
  })

  it("says it could not read it", async () => {
    phone.fails = true
    await expect(deviceStorage.check()).rejects.toThrow()
  })

  it("keeps the newer room when an older read lands after it", async () => {
    const older = deviceStorage.check()
    const newer = deviceStorage.refresh()
    await answer(1, 20)
    await newer
    await answer(0, 10)
    await expect(older).resolves.toBeUndefined()
    expect(deviceStorage.getSnapshot()?.use.quotaBytes).toBe(20)
  })
})
