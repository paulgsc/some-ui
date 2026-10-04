/**
 * Android's engine binds after the plugin loads, and until it has, the
 * plugin answers wrongly instead of waiting. Every call here waits for the
 * engine, so a lesson's first line, the Korean probe and the voice list are
 * not lost to a cold start.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type * as NativeModule from "@/lib/device-speech/native"

const plugin = vi.hoisted(() => {
  const state = { bound: false, available: true }
  const speak = vi.fn((_options: unknown): Promise<void> => Promise.resolve())
  const stop = vi.fn((): Promise<void> => Promise.resolve())
  const checkVoiceData = vi.fn((): Promise<void> => Promise.resolve())
  const installVoiceData = vi.fn((): Promise<void> => Promise.resolve())
  return {
    state,
    speak,
    stop,
    checkVoiceData,
    installVoiceData,
    TextToSpeech: {
      // The plugin's own: launches Android's voice-data check, not its installer.
      openInstall: checkVoiceData,
      speak: (options: unknown): Promise<void> =>
        state.bound
          ? speak(options)
          : Promise.reject(new Error("Not yet initialized")),
      stop,
      getSupportedVoices: (): Promise<{ voices: Array<unknown> }> =>
        state.bound
          ? Promise.resolve({
              voices: [
                {
                  voiceURI: "ko-kr-x-kob-local",
                  name: "ko-KR",
                  lang: "ko-KR",
                  localService: true,
                  default: false,
                },
                {
                  voiceURI: "kok-in-x-kok-network",
                  name: "kok-IN",
                  lang: "kok-IN",
                  localService: false,
                  default: false,
                },
              ],
            })
          : Promise.reject(new Error("Attempt to invoke a null object")),
      isLanguageSupported: (options: {
        lang: string
      }): Promise<{ supported: boolean }> =>
        Promise.resolve({
          supported: state.bound && state.available && options.lang === "ko-KR",
        }),
    },
  }
})

vi.mock("@capacitor/core", () => ({
  registerPlugin: (name: string): unknown =>
    name === "VoiceData" ? { openInstall: plugin.installVoiceData } : {},
}))

vi.mock("@capacitor-community/text-to-speech", () => ({
  TextToSpeech: plugin.TextToSpeech,
  QueueStrategy: { Flush: 0, Add: 1 },
}))

/** A fresh module: its readiness is remembered per launch. */
async function load(): Promise<typeof NativeModule> {
  vi.resetModules()
  return import("@/lib/device-speech/native")
}

beforeEach(() => {
  vi.useFakeTimers()
  plugin.state.bound = false
  plugin.state.available = true
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe("the phone's engine at a cold start", () => {
  it("does not report Korean missing before the engine has bound", async () => {
    const { engine } = await load()

    const probe = engine.isLanguageSupported("korean")
    await vi.advanceTimersByTimeAsync(250)
    plugin.state.bound = true
    await vi.advanceTimersByTimeAsync(1_000)

    await expect(probe).resolves.toBe(true)
  })

  it("lists the phone's voices once the engine answers, in our languages", async () => {
    const { engine } = await load()

    const voices = engine.getVoices()
    await vi.advanceTimersByTimeAsync(250)
    plugin.state.bound = true
    await vi.advanceTimersByTimeAsync(1_000)

    // Konkani (`kok`) is a language this site does not speak, not Korean.
    await expect(voices).resolves.toEqual([
      expect.objectContaining({ id: "ko-kr-x-kob-local", language: "korean" }),
      expect.objectContaining({ id: "kok-in-x-kok-network", language: null }),
    ])
  })

  it("speaks a line asked for before the engine bound, once it has", async () => {
    const { engine } = await load()

    const line = engine.speak({
      text: "안녕하세요",
      language: "korean",
      voiceId: "ko-kr-x-kob-local",
      rate: 1,
      pitch: 1,
      volume: 1,
    })
    await vi.advanceTimersByTimeAsync(250)
    expect(plugin.speak).not.toHaveBeenCalled()
    plugin.state.bound = true
    await vi.advanceTimersByTimeAsync(1_000)

    await expect(line).resolves.toBeUndefined()
    expect(plugin.speak).toHaveBeenCalledWith(
      expect.objectContaining({ text: "안녕하세요", lang: "ko-KR", voice: 0 })
    )
  })

  it("does not speak a line stopped while the engine was binding", async () => {
    const { engine } = await load()

    void engine.speak({ text: "하나", rate: 1, pitch: 1, volume: 1 })
    await engine.stop()
    plugin.state.bound = true
    await vi.advanceTimersByTimeAsync(1_000)

    expect(plugin.speak).not.toHaveBeenCalled()
  })

  it("gives up on a phone with no engine, and tries again on the next call", async () => {
    const { engine } = await load()

    const first = engine.getVoices()
    const settled = expect(first).rejects.toThrow("null object")
    await vi.advanceTimersByTimeAsync(11_000)
    await settled

    plugin.state.bound = true
    const second = engine.getVoices()
    await vi.advanceTimersByTimeAsync(0)
    await expect(second).resolves.toHaveLength(2)
  })
})

describe("installing a voice", () => {
  it("opens the engine's installer through the app's own plugin, not the plugin's check", async () => {
    const { openVoiceInstall } = await load()

    await openVoiceInstall()

    expect(plugin.installVoiceData).toHaveBeenCalledTimes(1)
    expect(plugin.checkVoiceData).not.toHaveBeenCalled()
  })
})
