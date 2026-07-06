import { beforeEach, describe, expect, it } from "vitest"

import {
  createSettingsRepository,
  DEFAULT_SETTINGS,
} from "./settings-repository"
import type { StorageAdapter } from "./storage"
import { createInMemoryStorage } from "./storage"

let storage: StorageAdapter

beforeEach(() => {
  storage = createInMemoryStorage()
})

describe("SettingsRepository", () => {
  it("returns default settings when nothing has been saved yet", async () => {
    const repo = createSettingsRepository(storage, 0)
    expect(await repo.get()).toEqual(DEFAULT_SETTINGS)
  })

  it("persists updated settings", async () => {
    const repo = createSettingsRepository(storage, 0)
    const updated = {
      ...DEFAULT_SETTINGS,
      theme: "dark" as const,
      ttsProvider: "google" as const,
    }

    await repo.save(updated)
    expect(await repo.get()).toEqual(updated)
  })
})
