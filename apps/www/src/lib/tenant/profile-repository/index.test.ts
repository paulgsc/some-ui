import { beforeEach, describe, expect, it } from "vitest"

import type { StorageAdapter } from "@/lib/tenant/storage"
import { createInMemoryStorage } from "@/lib/tenant/storage"
import type { UserProfile } from "@/lib/tenant/types"

import { createProfileRepository, DEFAULT_PROFILE } from "."

let storage: StorageAdapter

beforeEach(() => {
  storage = createInMemoryStorage()
})

describe("ProfileRepository", () => {
  it("returns the default profile when nothing has been saved yet", async () => {
    const repo = createProfileRepository(storage, 0)
    expect(await repo.get()).toEqual(DEFAULT_PROFILE)
  })

  it("persists a saved profile and returns it on subsequent reads", async () => {
    const repo = createProfileRepository(storage, 0)
    const profile: UserProfile = {
      id: "local-tenant",
      displayName: "Jae",
      avatar: "🐨",
      targetTopikLevel: "advanced",
    }

    await repo.save(profile)
    expect(await repo.get()).toEqual(profile)
  })

  it("survives being re-read through a fresh repository instance over the same storage", async () => {
    const first = createProfileRepository(storage, 0)
    await first.save({ ...DEFAULT_PROFILE, displayName: "Persisted" })

    const second = createProfileRepository(storage, 0)
    expect((await second.get()).displayName).toBe("Persisted")
  })
})
