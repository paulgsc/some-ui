import { inMemoryStorage } from "@some-ui/core-utils"
import type { KeyedStorage } from "@some-ui/core-utils"
import { beforeEach, describe, expect, it } from "vitest"

import type { UserSettings } from "@/lib/tenant/types"

import { createSettingsRepository, DEFAULT_SETTINGS } from "."

let storage: KeyedStorage

beforeEach(() => {
  storage = inMemoryStorage()
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
      deviceVoiceId: "ko-kr-x-ism-local",
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
    // What a browser holds from before audio preferences existed: a missing
    // field comes back `undefined`, not defaulted.
    storage.setItem(
      "some-ui.tenant.settings.v1",
      JSON.stringify({
        ttsProvider: "openai",
        ttsVoiceId: "",
      })
    )
    const repo = createSettingsRepository(storage, 0)

    const settings = await repo.get()

    expect(settings.audio).toEqual(DEFAULT_SETTINGS.audio)
    expect(settings.deviceVoiceId).toBe("")
  })

  it("keeps the retired hosted voice through a save, and hands it to no one", async () => {
    // The voice a browser chose before the voice service was retired
    // (#2977), in both of the shapes it was ever stored in.
    const retired = {
      ttsVoice: { provider: "openai", voiceId: "ko-KR-InJoonNeural" },
      ttsProvider: "openai",
      ttsVoiceId: "ko-KR-InJoonNeural",
    }
    storage.setItem("some-ui.tenant.settings.v1", JSON.stringify(retired))
    const repo = createSettingsRepository(storage, 0)

    const settings = await repo.get()
    expect(Object.keys(settings)).not.toContain("ttsVoice")
    expect(Object.keys(settings)).not.toContain("ttsProvider")
    expect(Object.keys(settings)).not.toContain("ttsVoiceId")

    await repo.save({ ...settings, deviceVoiceId: "ko-kr-x-ism-local" })
    expect(
      JSON.parse(storage.getItem("some-ui.tenant.settings.v1") ?? "{}")
    ).toEqual({ ...retired, ...settings, deviceVoiceId: "ko-kr-x-ism-local" })
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
