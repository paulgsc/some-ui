/**
 * The Android app's recognizer for LeetType's margin notes, over the
 * speech-recognition plugin. The boundary's own laws (settles once, by a
 * deadline, cause kept, reported once) are `@some-ui/intent-kit`'s to test;
 * what is this port's is what it asks the plugin for, and what each of the
 * plugin's failures means, read from the plugin's own source so an upgrade
 * that changes a message fails here instead of reaching a phone as
 * "unknown".
 */
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { FOREIGN_FAILURE_TAG } from "@some-ui/intent-kit"
import type { Listening } from "@some-ui/leetype"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { classifyPhoneSpeech, phoneDictation, runsNatively } from "./index"

const plugin = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
}))
/**
 * As `registerPlugin` builds it: a Proxy that answers every property with a
 * method that calls the native side, `then` included. A plain object here
 * would let the adapter resolve a promise with the plugin and pass, while
 * on a phone that promise calls the plugin's "then" and never settles.
 */
function asCapacitorPlugin(methods: typeof plugin): typeof plugin {
  return new Proxy(methods, {
    get: (target, key): unknown =>
      Reflect.get(target, key) ??
      ((): Promise<never> => new Promise(() => undefined)),
  })
}

vi.mock("@capacitor-community/speech-recognition", () => ({
  SpeechRecognition: asCapacitorPlugin(plugin),
}))

/** Every message `SpeechRecognition.start` can reject with, from its Java source. */
function pluginMessages(): Array<string> {
  const root = dirname(
    createRequire(import.meta.url).resolve(
      "@capacitor-community/speech-recognition/package.json"
    )
  )
  const java = join(
    root,
    "android/src/main/java/com/getcapacitor/community/speechrecognition"
  )
  const plugin = readFileSync(join(java, "SpeechRecognition.java"), "utf8")
  const constants = readFileSync(join(java, "Constants.java"), "utf8")
  const fromErrorText = [...plugin.matchAll(/message = "([^"]+)";/g)].map(
    (match) => match[1]
  )
  const fromStart = [
    ...constants.matchAll(
      /String (?:NOT_AVAILABLE|MISSING_PERMISSION) = "([^"]+)";/g
    ),
  ].map((match) => match[1])
  return [...fromErrorText, ...fromStart]
}

/** One utterance on a fresh port. */
function listenOnce(): Listening {
  return phoneDictation().listen(() => undefined)
}

describe("phoneDictation", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    plugin.checkPermissions.mockResolvedValue({ speechRecognition: "granted" })
    plugin.stop.mockReturnValue(new Promise(() => undefined))
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("asks the phone for final results only, in the page's language, and hands back the transcript", async () => {
    plugin.start.mockResolvedValue({ matches: [" the budget  ", "the badger"] })
    const dictation = phoneDictation()
    expect(dictation.recognizer).toBe("phone")
    await expect(dictation.listen(() => undefined).outcome).resolves.toEqual({
      status: "succeeded",
      value: "the budget",
    })
    expect(plugin.start).toHaveBeenCalledWith({
      language: navigator.language,
      partialResults: false,
      popup: false,
      maxResults: 1,
    })
  })

  it("reads silence as an empty transcript, not a failure", async () => {
    for (const message of ["No match", "No speech input"]) {
      plugin.start.mockRejectedValueOnce(new Error(message))
      await expect(listenOnce().outcome).resolves.toEqual({
        status: "succeeded",
        value: "",
      })
    }
    plugin.start.mockResolvedValueOnce({ matches: [] })
    await expect(listenOnce().outcome).resolves.toEqual({
      status: "succeeded",
      value: "",
    })
    expect(console.error).not.toHaveBeenCalled()
  })

  it("is denied without the microphone, never starting, and withdrawable", async () => {
    plugin.checkPermissions.mockResolvedValue({ speechRecognition: "prompt" })
    plugin.requestPermissions.mockResolvedValue({ speechRecognition: "denied" })
    const outcome = await listenOnce().outcome
    expect(outcome).toMatchObject({
      status: "failed",
      error: { kind: "rejected", retryable: false },
    })
    expect(plugin.start).not.toHaveBeenCalled()
  })

  it("is unavailable, with the plugin's own words logged, on a phone with no recognizer", async () => {
    const refusal = Object.assign(
      new Error("Speech recognition service is not available."),
      { code: "UNAVAILABLE" }
    )
    plugin.start.mockRejectedValue(refusal)
    const outcome = await listenOnce().outcome
    expect(outcome).toMatchObject({
      status: "failed",
      error: { kind: "unavailable", retryable: false, cause: refusal },
    })
    expect(console.error).toHaveBeenCalledWith(
      FOREIGN_FAILURE_TAG,
      expect.stringContaining("[android speech recognizer] unavailable"),
      refusal
    )
  })

  it("fails by its deadline when the recognizer never answers, and stops it", async () => {
    vi.useFakeTimers()
    plugin.start.mockReturnValue(new Promise(() => undefined))
    plugin.stop.mockResolvedValue(undefined)
    const listening = phoneDictation().listen(() => undefined)
    await vi.advanceTimersByTimeAsync(60_000)
    await expect(listening.outcome).resolves.toMatchObject({
      status: "failed",
      error: { kind: "unreachable", retryable: true },
    })
    expect(plugin.stop).toHaveBeenCalled()
  })

  it("never asks for the microphone or starts once cancelled while loading", async () => {
    let granted: (value: { speechRecognition: string }) => void = () =>
      undefined
    plugin.checkPermissions.mockReturnValue(
      new Promise((resolve) => {
        granted = resolve
      })
    )
    const listening = phoneDictation().listen(() => undefined)
    await vi.waitFor(() => expect(plugin.checkPermissions).toHaveBeenCalled())
    listening.cancel()
    granted({ speechRecognition: "prompt" })
    await expect(listening.outcome).resolves.toEqual({ status: "abandoned" })
    expect(plugin.requestPermissions).not.toHaveBeenCalled()
    expect(plugin.start).not.toHaveBeenCalled()
    expect(console.error).not.toHaveBeenCalled()
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
    await expect(listening.outcome).resolves.toEqual({
      status: "succeeded",
      value: "said",
    })
  })
})

describe("classifyPhoneSpeech", () => {
  it("names every failure the plugin's source can send, leaving only its own catch-all unknown", () => {
    const messages = pluginMessages()
    // Scanned something: the source moved, or this would pass on nothing.
    expect(messages.length).toBeGreaterThanOrEqual(10)
    const silence = new Set(["No match", "No speech input"])
    const unknown = messages.filter(
      (message) =>
        !silence.has(message) &&
        classifyPhoneSpeech(new Error(message)).kind === "unknown"
    )
    expect(unknown).toEqual(["Didn't understand, please try again."])
  })

  it("reads a build without the plugin as unavailable, whatever its message", () => {
    expect(
      classifyPhoneSpeech(
        Object.assign(new Error("x"), { code: "UNIMPLEMENTED" })
      )
    ).toMatchObject({ kind: "unavailable", retryable: false })
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
