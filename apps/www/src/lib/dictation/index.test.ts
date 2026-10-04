/**
 * The Android app's recognizer for LeetType's margin notes, over the
 * speech-recognition plugin: the permission it asks for, final results only,
 * and the plugin's error text read as the port's failure reasons.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import { phoneDictation, runsNatively } from "./index"

const plugin = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
}))
vi.mock("@capacitor-community/speech-recognition", () => ({
  SpeechRecognition: plugin,
}))

describe("phoneDictation", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    plugin.checkPermissions.mockResolvedValue({ speechRecognition: "granted" })
    plugin.stop.mockReturnValue(new Promise(() => undefined))
  })

  it("asks the phone for final results only and hands back the transcript", async () => {
    plugin.start.mockResolvedValue({ matches: [" the budget  ", "the badger"] })
    const dictation = phoneDictation()
    expect(dictation.recognizer).toBe("phone")
    await expect(dictation.listen(() => undefined).done).resolves.toBe(
      "the budget"
    )
    expect(plugin.start).toHaveBeenCalledWith({
      partialResults: false,
      popup: false,
      maxResults: 1,
    })
  })

  it("asks for the microphone when it has not been granted, and is denied without it", async () => {
    plugin.checkPermissions.mockResolvedValue({ speechRecognition: "prompt" })
    plugin.requestPermissions.mockResolvedValue({ speechRecognition: "denied" })
    await expect(
      phoneDictation().listen(() => undefined).done
    ).rejects.toMatchObject({ reason: "denied" })
    expect(plugin.start).not.toHaveBeenCalled()
  })

  it("reads the recognizer's errors as silence or failure", async () => {
    for (const [message, reason] of [
      ["No match", "silent"],
      ["No speech input", "silent"],
      ["Insufficient permissions", "denied"],
      ["Network error", "failed"],
    ] as const) {
      plugin.start.mockRejectedValueOnce(new Error(message))
      await expect(
        phoneDictation().listen(() => undefined).done
      ).rejects.toMatchObject({ reason })
    }
    plugin.start.mockResolvedValueOnce({ matches: [] })
    await expect(
      phoneDictation().listen(() => undefined).done
    ).rejects.toMatchObject({ reason: "silent" })
  })

  it("stops the recognizer on stop, even before it has started", async () => {
    let finish: (value: { matches: Array<string> }) => void = () => undefined
    plugin.start.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    const listening = phoneDictation().listen(() => undefined)
    listening.stop()
    await vi.waitFor(() => expect(plugin.stop).toHaveBeenCalled())
    finish({ matches: ["said"] })
    await expect(listening.done).resolves.toBe("said")
  })
})

describe("runsNatively", () => {
  it("asks the native bridge's Capacitor global, and is false without one", () => {
    expect(runsNatively({})).toBe(false)
    expect(runsNatively({ Capacitor: {} })).toBe(false)
    expect(
      runsNatively({ Capacitor: { isNativePlatform: (): boolean => false } })
    ).toBe(false)
    expect(
      runsNatively({ Capacitor: { isNativePlatform: (): boolean => true } })
    ).toBe(true)
  })
})
