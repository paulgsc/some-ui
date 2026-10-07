import { webSpeechDictation } from "@leetype/lib/leetype/notes/dictation"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type Handlers = {
  onresult:
    | ((event: {
        results: ArrayLike<
          ArrayLike<{ transcript: string }> & { isFinal: boolean }
        >
      }) => void)
    | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

type Instance = Handlers & {
  lang: string
  interimResults: boolean
  started: boolean
  stopped: boolean
  aborted: boolean
}

type Results = Array<Array<{ transcript: string }> & { isFinal: boolean }>

/** A stand-in for the browser's `SpeechRecognition`, driven by the test. */
function fakeRecognition(): {
  FakeRecognition: new () => Instance & {
    continuous: boolean
    maxAlternatives: number
    start(): void
    stop(): void
    abort(): void
  }
  instances: Array<Instance>
} {
  const instances: Array<Instance> = []
  class FakeRecognition {
    lang = ""
    interimResults = false
    continuous = true
    maxAlternatives = 0
    onresult: Handlers["onresult"] = null
    onerror: Handlers["onerror"] = null
    onend: Handlers["onend"] = null
    started = false
    stopped = false
    aborted = false
    constructor() {
      instances.push(this)
    }
    start(): void {
      this.started = true
    }
    stop(): void {
      this.stopped = true
    }
    abort(): void {
      this.aborted = true
    }
  }
  return { FakeRecognition, instances }
}

const results = (...parts: Array<string>): Results =>
  parts.map((transcript, index) =>
    Object.assign([{ transcript }], { isFinal: index < parts.length - 1 })
  )

/**
 * Every `SpeechRecognitionErrorEvent.error` the Web Speech API defines
 * (https://webaudio.github.io/web-speech-api/#speechreco-error), with what
 * each must become: the list is the platform's and closed, so all of it is
 * here, not a sample.
 */
const WEB_SPEECH_ERRORS = [
  ["no-speech", "silence"],
  ["aborted", "silence"],
  ["audio-capture", "unavailable"],
  ["network", "unreachable"],
  ["not-allowed", "rejected"],
  ["service-not-allowed", "rejected"],
  ["language-not-supported", "unavailable"],
  ["phrases-not-supported", "unknown"],
] as const

describe("webSpeechDictation", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("is null where the browser has no recognizer", () => {
    expect(webSpeechDictation({})).toBeNull()
    expect(webSpeechDictation(undefined)).toBeNull()
  })

  it("listens in the page's language and reports words as they come", async () => {
    const { FakeRecognition, instances } = fakeRecognition()
    const dictation = webSpeechDictation({
      webkitSpeechRecognition: FakeRecognition,
      navigator: { language: "en-GB" },
    })!
    expect(dictation.recognizer).toBe("browser")
    const heard: Array<string> = []
    const listening = dictation.listen((words) => heard.push(words))
    const [recognition] = instances
    expect(recognition).toMatchObject({
      lang: "en-GB",
      interimResults: true,
      started: true,
    })
    recognition!.onresult!({ results: results("the bounds ", "grow") })
    listening.stop()
    expect(recognition!.stopped).toBe(true)
    recognition!.onend!()
    await expect(listening.outcome).resolves.toEqual({
      status: "succeeded",
      value: "the bounds grow",
    })
    expect(heard).toEqual(["the bounds grow"])
  })

  it("reads each of the platform's errors as silence or as a failure in our words", async () => {
    const { FakeRecognition, instances } = fakeRecognition()
    const dictation = webSpeechDictation({
      SpeechRecognition: FakeRecognition,
    })!
    for (const [code, meaning] of WEB_SPEECH_ERRORS) {
      const listening = dictation.listen(() => undefined)
      const recognition = instances.at(-1)!
      recognition.onerror!({ error: code })
      recognition.onend!()
      const outcome = await listening.outcome
      if (meaning === "silence") {
        expect(outcome, code).toEqual({ status: "succeeded", value: "" })
        continue
      }
      expect(outcome, code).toMatchObject({
        status: "failed",
        error: { kind: meaning, cause: { code } },
      })
      if (outcome.status !== "failed") continue
      // What no tap can fix withdraws the microphone.
      expect(outcome.error.retryable, code).toBe(
        meaning !== "unavailable" && meaning !== "rejected"
      )
    }
  })

  it("keeps words heard before the recognizer timed out", async () => {
    const { FakeRecognition, instances } = fakeRecognition()
    const listening = webSpeechDictation({
      SpeechRecognition: FakeRecognition,
    })!.listen(() => undefined)
    const [recognition] = instances
    recognition!.onresult!({ results: results("half") })
    recognition!.onerror!({ error: "no-speech" })
    recognition!.onend!()
    await expect(listening.outcome).resolves.toEqual({
      status: "succeeded",
      value: "half",
    })
  })

  it("fails by its deadline when the recognizer never ends, and aborts it", async () => {
    vi.useFakeTimers()
    const { FakeRecognition, instances } = fakeRecognition()
    const listening = webSpeechDictation({
      SpeechRecognition: FakeRecognition,
    })!.listen(() => undefined)
    await vi.advanceTimersByTimeAsync(60_000)
    await expect(listening.outcome).resolves.toMatchObject({
      status: "failed",
      error: { kind: "unreachable", retryable: true },
    })
    expect(instances[0]!.aborted).toBe(true)
  })

  it("aborts on cancel and reports nothing after it", async () => {
    const { FakeRecognition, instances } = fakeRecognition()
    const heard: Array<string> = []
    const listening = webSpeechDictation({
      SpeechRecognition: FakeRecognition,
    })!.listen((words) => heard.push(words))
    listening.cancel()
    const [recognition] = instances
    expect(recognition!.aborted).toBe(true)
    recognition!.onresult!({ results: results("late") })
    recognition!.onend!()
    await expect(listening.outcome).resolves.toEqual({ status: "abandoned" })
    expect(heard).toEqual([])
    expect(console.error).not.toHaveBeenCalled()
  })
})
