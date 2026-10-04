import {
  DictationError,
  dictationFailureOf,
  webSpeechDictation,
} from "@leetype/lib/leetype/notes/dictation"
import { describe, expect, it } from "vitest"

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

describe("webSpeechDictation", () => {
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
    await expect(listening.done).resolves.toBe("the bounds grow")
    expect(heard).toEqual(["the bounds grow"])
  })

  it("rejects silence, a refusal and a failure with their reasons", async () => {
    const { FakeRecognition, instances } = fakeRecognition()
    const dictation = webSpeechDictation({
      SpeechRecognition: FakeRecognition,
    })!
    const cases = [
      [undefined, "silent"],
      ["not-allowed", "denied"],
      ["network", "failed"],
    ] as const
    for (const [error, reason] of cases) {
      const listening = dictation.listen(() => undefined)
      const recognition = instances.at(-1)!
      if (error !== undefined) recognition.onerror!({ error })
      recognition.onend!()
      await expect(listening.done).rejects.toEqual(new DictationError(reason))
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
    await expect(listening.done).resolves.toBe("half")
  })

  it("aborts on cancel and reports nothing after it", () => {
    const { FakeRecognition, instances } = fakeRecognition()
    const heard: Array<string> = []
    const listening = webSpeechDictation({
      SpeechRecognition: FakeRecognition,
    })!.listen((words) => heard.push(words))
    listening.cancel()
    const [recognition] = instances
    expect(recognition!.aborted).toBe(true)
    recognition!.onresult!({ results: results("late") })
    expect(heard).toEqual([])
  })
})

describe("dictationFailureOf", () => {
  it("reads a reason from any rejection that carries one, and calls the rest failed", () => {
    expect(dictationFailureOf(new DictationError("denied"))).toBe("denied")
    expect(dictationFailureOf({ reason: "silent" })).toBe("silent")
    expect(dictationFailureOf({ reason: "exploded" })).toBe("failed")
    expect(dictationFailureOf(new Error("boom"))).toBe("failed")
    expect(dictationFailureOf(undefined)).toBe("failed")
  })
})
