import { beforeEach, describe, expect, it } from "vitest"

import type { StorageAdapter } from "@/lib/tenant/storage"
import { createInMemoryStorage } from "@/lib/tenant/storage"
import type { UserSettings } from "@/lib/tenant/types"

import { createSettingsRepository, DEFAULT_SETTINGS } from "."

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
    const updated: UserSettings = {
      ...DEFAULT_SETTINGS,
      ttsVoice: { provider: "openai", voiceId: "ko-KR-InJoonNeural" },
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
    expect(settings.ttsVoice).toEqual({ provider: "openai", voiceId: null })
  })

  it("reads a voice saved before the choice was typed", async () => {
    // The two strings `ttsVoice` replaced, as a browser that picked InJoon
    // before this change still holds them.
    storage.setItem(
      "some-ui.tenant.settings.v1",
      JSON.stringify({
        ttsProvider: "openai",
        ttsVoiceId: "ko-KR-InJoonNeural",
      })
    )
    const settings = await createSettingsRepository(storage, 0).get()

    expect(settings.ttsVoice).toEqual({
      provider: "openai",
      voiceId: "ko-KR-InJoonNeural",
    })
    expect(Object.keys(settings)).not.toContain("ttsProvider")
    expect(Object.keys(settings)).not.toContain("ttsVoiceId")
  })

  it("reads a voice that is not its provider's as nothing chosen", async () => {
    storage.setItem(
      "some-ui.tenant.settings.v1",
      JSON.stringify({
        ttsVoice: { provider: "google", voiceId: "ko-KR-InJoonNeural" },
      })
    )
    const settings = await createSettingsRepository(storage, 0).get()

    expect(settings.ttsVoice).toEqual({ provider: "google", voiceId: null })
  })

  it("reads an unknown provider as the default one", async () => {
    storage.setItem(
      "some-ui.tenant.settings.v1",
      JSON.stringify({ ttsProvider: "polly", ttsVoiceId: "Joanna" })
    )
    const settings = await createSettingsRepository(storage, 0).get()

    expect(settings.ttsVoice).toEqual({ provider: "openai", voiceId: null })
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
