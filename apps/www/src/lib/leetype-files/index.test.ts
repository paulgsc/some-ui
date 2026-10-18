/**
 * The phone's session-file store over a real database: a picked file lands
 * in the content store verbatim, its name is its identity, and a keep past
 * the storage budget is refused rather than written.
 */
import { openNodeSqlite } from "@/test-support/node-sqlite-driver"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { openDeviceBackend } from "@/lib/device-backend/backend"
import type { DeviceBackend } from "@/lib/device-backend/interceptor"
import type { StorageBudget } from "@/lib/device-backend/storage"
import { databaseBytes, onSaveRefused } from "@/lib/device-backend/storage"
import { phoneSessionFiles } from "@/lib/leetype-files"

let backend: DeviceBackend
let quota = Number.POSITIVE_INFINITY
const budget: StorageBudget = {
  get quotaBytes() {
    return quota
  },
}

vi.mock("@/lib/device-backend/boot", () => ({
  deviceBackend: (): Promise<DeviceBackend> => Promise.resolve(backend),
}))
vi.mock("@/lib/device-backend/storage-view", () => ({
  deviceStorage: { refresh: (): Promise<void> => Promise.resolve() },
}))

const AT = new Date("2026-10-18T21:00:00.000Z")
const FILE = {
  name: "t1-01-power-cut",
  title: "A power cut",
  oneLine: "What survives a power cut.",
  body: '{"title":"A power cut"}',
}

beforeEach(async () => {
  quota = Number.POSITIVE_INFINITY
  backend = await openDeviceBackend(
    openNodeSqlite(),
    () => AT.getTime(),
    budget
  )
})

describe("phoneSessionFiles", () => {
  it("keeps a picked file verbatim under its name and lists it", async () => {
    const store = phoneSessionFiles()
    expect(await store.keep(FILE, AT)).toBe("kept")
    expect(await store.read(FILE.name)).toBe(FILE.body)
    expect(await store.read("elsewhere")).toBeNull()
    expect(await store.list()).toEqual([
      {
        name: FILE.name,
        title: FILE.title,
        oneLine: FILE.oneLine,
        pickedAt: "2026-10-18T21:00:00.000+00:00",
      },
    ])
  })

  it("changes nothing for the same bytes, and refuses other bytes under a held name", async () => {
    const store = phoneSessionFiles()
    await store.keep(FILE, AT)
    expect(await store.keep(FILE, AT)).toBe("already-held")
    expect(await store.keep({ ...FILE, body: '{"title":"Changed"}' }, AT)).toBe(
      "name-taken"
    )
    expect(await store.read(FILE.name)).toBe(FILE.body)
  })

  it("refuses a keep past the storage budget, writes nothing, and asks for room", async () => {
    const store = phoneSessionFiles()
    const refused = vi.fn()
    const stop = onSaveRefused(refused)
    quota = await databaseBytes(backend.context.db)
    expect(await store.keep({ ...FILE, body: "x".repeat(50_000) }, AT)).toBe(
      "full"
    )
    expect(await store.list()).toEqual([])
    expect(refused).toHaveBeenCalledWith(null)
    stop()
  })
})
