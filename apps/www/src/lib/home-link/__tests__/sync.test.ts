/**
 * The sync as Settings starts it: a sync home ends part way still shows
 * what it copied, and home being busy is not said as a failure.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  HomeBusyError,
  HomeUnreachableError,
} from "@/lib/device-backend/home-sync"
import { syncLessonsFrom } from "@/lib/home-link/sync"

type Fake = { ends: unknown; storageRefreshed: number }
const fake = vi.hoisted((): Fake => ({ ends: undefined, storageRefreshed: 0 }))

vi.mock("@/lib/device-backend/boot", () => ({
  deviceBackend: (): Promise<{ context: { db: object } }> =>
    Promise.resolve({ context: { db: {} } }),
}))
vi.mock("@/lib/device-backend/storage-view", () => ({
  deviceStorage: {
    refresh: (): Promise<void> => {
      fake.storageRefreshed += 1
      return Promise.resolve()
    },
  },
}))
vi.mock("@/lib/device-backend/home-sync", async (actual) => ({
  ...(await actual<object>()),
  syncFromHome: (): Promise<never> => Promise.reject(fake.ends),
}))
vi.mock("@/lib/home-link/index", () => ({
  homeLink: (): {
    sync: (run: (get: unknown) => Promise<unknown>) => Promise<unknown>
  } => ({ sync: (run) => run(() => undefined) }),
}))

afterEach(() => {
  fake.storageRefreshed = 0
})

describe("syncLessonsFrom", () => {
  it("shows what came before home was busy, and says busy as no failure", async () => {
    fake.ends = new HomeBusyError()
    const refresh = vi.fn()
    const result = await syncLessonsFrom("https://home.example/api/v1", refresh)
    expect(result).toEqual({
      ok: true,
      line: expect.stringMatching(/^Home is busy right now\./),
    })
    expect(refresh).toHaveBeenCalledOnce()
    expect(fake.storageRefreshed).toBe(1)
  })

  it("says home unreachable as a failure", async () => {
    fake.ends = new HomeUnreachableError("https://home.example/api/v1")
    const result = await syncLessonsFrom(
      "https://home.example/api/v1",
      () => undefined
    )
    expect(result.ok).toBe(false)
  })
})
