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
      ttsProvider: "google" as const,
    }

    await repo.save(updated)
    expect(storage.getItem("some-ui.tenant.settings.v1")).toBe(
      JSON.stringify(updated)
    )
    expect(await repo.get()).toEqual(updated)
  })
})

describe("SettingsRepository - forward compatibility", () => {
  it("fills in fields a stored blob predates", async () => {
    // Exactly what a browser holds after using the app before audio
    // preferences existed. Settings persist as one JSON object under one
    // key, so a missing field comes back `undefined` rather than defaulted -
    // and `preferences.speech.enabled` on undefined is a blank page, not a
    // missing toggle.
    storage.setItem(
      "some-ui.tenant.settings.v1",
      JSON.stringify({
        ttsProvider: "openai",
        ttsVoiceId: "",
        defaultSessionDurationMinutes: 10,
        defaultLayoutTree: "study",
      })
    )
    const repo = createSettingsRepository(storage, 0)

    const settings = await repo.get()

    expect(settings.audio).toEqual(DEFAULT_SETTINGS.audio)
    expect(settings.ttsProvider).toBe("openai")
  })

  it("keeps a stored audio choice rather than resetting it", async () => {
    storage.setItem(
      "some-ui.tenant.settings.v1",
      JSON.stringify({
        ...DEFAULT_SETTINGS,
        audio: {
          speech: { enabled: false, volume: 0.4 },
          effects: { enabled: true, volume: 0.1 },
        },
      })
    )
    const repo = createSettingsRepository(storage, 0)

    const settings = await repo.get()

    expect(settings.audio.speech).toEqual({ enabled: false, volume: 0.4 })
    expect(settings.audio.effects).toEqual({ enabled: true, volume: 0.1 })
  })
})
