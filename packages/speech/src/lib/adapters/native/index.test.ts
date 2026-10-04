/**
 * What the native adapter adds over the settlement laws, which
 * `adapters/__tests__/adapter-contract.test.ts` already runs against it:
 * a missing voice is said out loud, and the voice the person chose from the
 * phone's list speaks every line in its language.
 */

import type { NativeVoice } from "@speech/lib/adapters/native"
import {
  createNativeSpeechAdapter,
  VOICE_MISSING_ERROR_NAME,
} from "@speech/lib/adapters/native"
import { isAbortError } from "@speech/lib/promise/abort"
import { createFakeNativeEngine, flushAsync, track } from "@speech/lib/testing"
import { describe, expect, it, vi } from "vitest"

const VOICES: ReadonlyArray<NativeVoice> = [
  {
    id: "en-us-x-iol-local",
    name: "English",
    language: "english",
    local: true,
  },
  {
    id: "ko-kr-x-ism-network",
    name: "Korean",
    language: "korean",
    local: false,
  },
  { id: "ko-kr-x-kob-local", name: "Korean", language: "korean", local: true },
  { id: "ko-kr-x-kod-local", name: "Korean", language: "korean", local: true },
]

describe("native adapter", () => {
  it("hands the engine the text, language, rate and volume", async () => {
    const fake = createFakeNativeEngine()
    const adapter = createNativeSpeechAdapter({
      engine: fake.engine,
      language: "korean",
    })
    adapter.setVolume(0.5)

    const settlement = track(adapter.speak("안녕하세요", { playbackRate: 0.8 }))
    await flushAsync()

    expect(fake.spoken).toEqual([
      expect.objectContaining({
        text: "안녕하세요",
        language: "korean",
        rate: 0.8,
        volume: 0.5,
      }),
    ])
    fake.end()
    await flushAsync()
    expect(settlement.state).toBe("resolved")
  })

  it("refuses a language with no voice data, says so, and speaks once it is installed", async () => {
    const fake = createFakeNativeEngine({ installed: ["english"] })
    const onMissingVoice = vi.fn()
    const onError = vi.fn()
    const adapter = createNativeSpeechAdapter({
      engine: fake.engine,
      language: "korean",
      onMissingVoice,
    })

    const refused = track(adapter.speak("안녕하세요", { onError }))
    await flushAsync()

    expect(refused.state).toBe("rejected")
    expect(refused.error?.name).toBe(VOICE_MISSING_ERROR_NAME)
    expect(isAbortError(refused.error)).toBe(false)
    expect(onMissingVoice).toHaveBeenCalledWith("korean")
    expect(onError).toHaveBeenCalledTimes(1)
    expect(fake.spoken).toEqual([])

    // A person installs Korean in the system settings and comes back.
    fake.install("korean")
    const spoken = track(adapter.speak("안녕하세요"))
    await flushAsync()
    fake.end()
    await flushAsync()

    expect(spoken.state).toBe("resolved")
    expect(onMissingVoice).toHaveBeenCalledTimes(1)
  })

  it("does not report a missing voice for an utterance nobody is waiting on", async () => {
    const fake = createFakeNativeEngine({ installed: [] })
    const onMissingVoice = vi.fn()
    const adapter = createNativeSpeechAdapter({
      engine: fake.engine,
      language: "korean",
      onMissingVoice,
    })

    const abandoned = track(adapter.speak("안녕하세요"))
    adapter.stop()
    await flushAsync()

    expect(isAbortError(abandoned.error)).toBe(true)
    expect(onMissingVoice).not.toHaveBeenCalled()
  })

  it("rejects the displaced utterance even though the engine never settles it", async () => {
    const fake = createFakeNativeEngine()
    const adapter = createNativeSpeechAdapter({
      engine: fake.engine,
      language: "korean",
    })

    const displaced = track(adapter.speak("하나"))
    await flushAsync()
    const replacement = track(adapter.speak("둘"))
    await flushAsync()

    expect(isAbortError(displaced.error)).toBe(true)
    expect(replacement.state).toBe("pending")
    fake.end()
    await flushAsync()
    expect(replacement.state).toBe("resolved")
  })

  it("does not let a displaced caller's late abort stop its replacement", async () => {
    const fake = createFakeNativeEngine()
    const adapter = createNativeSpeechAdapter({
      engine: fake.engine,
      language: "korean",
    })
    const controller = new AbortController()

    track(adapter.speak("하나", { signal: controller.signal }))
    await flushAsync()
    const replacement = track(adapter.speak("둘"))
    await flushAsync()
    controller.abort()
    await flushAsync()

    expect(fake.stopCount).toBe(0)
    fake.end()
    await flushAsync()
    expect(replacement.state).toBe("resolved")
  })

  it("does not let a stopped caller's late abort stop the next line", async () => {
    const fake = createFakeNativeEngine()
    const adapter = createNativeSpeechAdapter({
      engine: fake.engine,
      language: "korean",
    })
    const controller = new AbortController()

    track(adapter.speak("하나", { signal: controller.signal }))
    await flushAsync()
    adapter.stop()
    const next = track(adapter.speak("둘"))
    await flushAsync()
    controller.abort()
    await flushAsync()

    expect(fake.stopCount).toBe(1)
    fake.end()
    await flushAsync()
    expect(next.state).toBe("resolved")
  })

  it("announces when the phone's voices and its Korean probe answer", async () => {
    const fake = createFakeNativeEngine({ voices: VOICES, installed: [] })
    const adapter = createNativeSpeechAdapter({
      engine: fake.engine,
      language: "korean",
      voiceId: "ko-kr-x-kod-local",
    })
    const listener = vi.fn()
    const unsubscribe = adapter.subscribe(listener)

    // Before the bridge answers, the session's language is being asked.
    expect(adapter.describe("korean")).toEqual({
      platform: "phone",
      voice: null,
      availability: "checking",
    })
    await flushAsync()
    expect(listener).toHaveBeenCalledTimes(2)
    expect(adapter.describe("korean")).toEqual({
      platform: "phone",
      voice: "Korean",
      availability: "missing",
    })

    // Installing Korean is announced on the probe that finds it.
    fake.install("korean")
    void adapter.speak("안녕하세요").catch(() => undefined)
    await flushAsync()
    expect(listener).toHaveBeenCalledTimes(3)

    unsubscribe()
    adapter.dispose()
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it("probes again when the engine fails a line in a language it had", async () => {
    const fake = createFakeNativeEngine({ installed: ["korean"] })
    const onMissingVoice = vi.fn()
    const adapter = createNativeSpeechAdapter({
      engine: fake.engine,
      language: "korean",
      onMissingVoice,
    })
    await flushAsync()
    expect(adapter.describe("korean").availability).toBe("available")

    // Korean is removed in the phone's settings while the app runs.
    const line = track(adapter.speak("하나"))
    await flushAsync()
    fake.uninstall("korean")
    fake.fail("This language is not supported.")
    await flushAsync()
    expect(line.error?.message).toBe("This language is not supported.")
    expect(adapter.describe("korean").availability).toBe("missing")

    const next = track(adapter.speak("둘"))
    await flushAsync()
    expect(next.error?.name).toBe(VOICE_MISSING_ERROR_NAME)
    expect(onMissingVoice).toHaveBeenCalledWith("korean")
  })

  it("does not take a failed probe as Korean installed", async () => {
    const fake = createFakeNativeEngine({ installed: [] })
    let probeFails = true
    const adapter = createNativeSpeechAdapter({
      engine: {
        ...fake.engine,
        isLanguageSupported: (language) =>
          probeFails
            ? Promise.reject(new Error("engine not bound"))
            : fake.engine.isLanguageSupported(language),
      },
      language: "korean",
    })
    await flushAsync()

    // The failed probe lets the line try, and says it could not tell.
    void adapter.speak("하나").catch(() => undefined)
    await flushAsync()
    expect(fake.spoken).toHaveLength(1)
    expect(adapter.describe("korean").availability).toBe("unverifiable")

    probeFails = false
    const refused = track(adapter.speak("둘"))
    await flushAsync()
    expect(refused.error?.name).toBe(VOICE_MISSING_ERROR_NAME)
    expect(adapter.describe("korean").availability).toBe("missing")
  })

  it("reports an engine failure as that failure, not a cancellation", async () => {
    const fake = createFakeNativeEngine()
    const adapter = createNativeSpeechAdapter({
      engine: fake.engine,
      language: "korean",
    })

    const settlement = track(adapter.speak("안녕하세요"))
    await flushAsync()
    fake.fail("Error while performing speak.")
    await flushAsync()

    expect(isAbortError(settlement.error)).toBe(false)
    expect(settlement.error?.message).toBe("Error while performing speak.")
  })

  it("stops the engine on stop, pause and dispose", async () => {
    const fake = createFakeNativeEngine()
    const adapter = createNativeSpeechAdapter({ engine: fake.engine })

    adapter.stop()
    adapter.pause()
    adapter.dispose()
    adapter.dispose()
    await flushAsync()

    expect(fake.stopCount).toBe(3)
  })

  it("speaks every line in its language in the chosen voice", async () => {
    const fake = createFakeNativeEngine({ voices: VOICES })
    const adapter = createNativeSpeechAdapter({
      engine: fake.engine,
      language: "korean",
      voiceId: "ko-kr-x-kod-local",
    })
    await flushAsync()

    void adapter.speak("하나").catch(() => undefined)
    await flushAsync()
    void adapter.speak("둘", { language: "korean" }).catch(() => undefined)
    await flushAsync()
    void adapter.speak("three", { language: "english" }).catch(() => undefined)
    await flushAsync()

    // The English line is not the chosen voice's language, so the engine
    // picks its own English voice.
    expect(fake.spoken.map((request) => request.voiceId)).toEqual([
      "ko-kr-x-kod-local",
      "ko-kr-x-kod-local",
      undefined,
    ])
    expect(fake.spoken.map((request) => request.language)).toEqual([
      "korean",
      "korean",
      "english",
    ])
  })

  it("says who speaks: the chosen voice by name, and whether Korean is installed", async () => {
    const fake = createFakeNativeEngine({ voices: VOICES, installed: [] })
    const adapter = createNativeSpeechAdapter({
      engine: fake.engine,
      language: "korean",
      voiceId: "ko-kr-x-kod-local",
    })
    await flushAsync()

    expect(adapter.describe("korean")).toEqual({
      platform: "phone",
      voice: "Korean",
      availability: "missing",
    })

    fake.install("korean")
    void adapter.speak("안녕하세요").catch(() => undefined)
    await flushAsync()
    expect(adapter.describe("korean").availability).toBe("available")
    // English is not the chosen voice's language: the engine's default.
    // Nobody had asked about it, so reading it asks.
    expect(adapter.describe("english")).toEqual({
      platform: "phone",
      voice: null,
      availability: "checking",
    })
    fake.install("english")
    await flushAsync()
    expect(adapter.describe("english").availability).toBe("available")
  })

  it("asks once per language however often it is read, and not after it is gone", async () => {
    const fake = createFakeNativeEngine({ installed: ["korean"] })
    const adapter = createNativeSpeechAdapter({ engine: fake.engine })

    adapter.describe("korean")
    adapter.describe("korean")
    void adapter.speak("하나", { language: "korean" }).catch(() => undefined)
    await flushAsync()
    expect(fake.probeCount).toBe(1)
    expect(adapter.describe("korean").availability).toBe("available")

    adapter.describe("english")
    adapter.dispose()
    await flushAsync()
    expect(fake.probeCount).toBe(1)
  })

  it("leaves the voice to the engine when the chosen one speaks another language", async () => {
    const fake = createFakeNativeEngine({ voices: VOICES })
    const adapter = createNativeSpeechAdapter({
      engine: fake.engine,
      language: "korean",
      voiceId: "en-us-x-iol-local",
    })
    await flushAsync()

    void adapter.speak("안녕하세요").catch(() => undefined)
    await flushAsync()

    expect(fake.spoken[0]?.voiceId).toBeUndefined()
  })
})

describe("native adapter - every interleaving of up to five events", () => {
  const EVENTS = [
    "say a (with a signal)",
    "say b",
    "stop",
    "abort a",
    "engine ends",
    "engine fails",
  ] as const
  type Event = (typeof EVENTS)[number]

  function* sequences(length: number): Generator<ReadonlyArray<Event>> {
    if (length === 0) {
      yield []
      return
    }
    for (const head of sequences(length - 1)) {
      for (const event of EVENTS) yield [...head, event]
    }
  }

  const settleMicrotasks = async (): Promise<void> => {
    for (let tick = 0; tick < 10; tick += 1) await Promise.resolve()
  }

  /**
   * After each event: at most one caller is still waiting, and the engine
   * was stopped only by a stop or by aborting a caller that was still
   * waiting. At the end, the engine finishing what it says settles every
   * caller, and a new line still reaches it.
   */
  async function runInterleaving(
    events: ReadonlyArray<Event>
  ): Promise<string | null> {
    const fake = createFakeNativeEngine()
    const adapter = createNativeSpeechAdapter({
      engine: fake.engine,
      language: "korean",
    })
    const callers: Array<ReturnType<typeof track>> = []
    let a: { controller: AbortController; caller: ReturnType<typeof track> } = {
      controller: new AbortController(),
      caller: track(Promise.resolve()),
    }
    let expectedStops = 0
    await settleMicrotasks()

    const act: Readonly<Record<Event, () => void>> = {
      "say a (with a signal)": () => {
        const controller = new AbortController()
        const caller = track(
          adapter.speak("하나", { signal: controller.signal })
        )
        callers.push(caller)
        a = { controller, caller }
      },
      "say b": () => {
        callers.push(track(adapter.speak("둘")))
      },
      stop: () => {
        expectedStops += 1
        adapter.stop()
      },
      "abort a": () => {
        if (a.caller.state === "pending" && !a.controller.signal.aborted) {
          expectedStops += 1
        }
        a.controller.abort()
      },
      "engine ends": () => fake.end(),
      "engine fails": () => fake.fail(),
    }

    for (const event of events) {
      act[event]()
      await settleMicrotasks()
      const waiting = callers.filter((caller) => caller.state === "pending")
      if (waiting.length > 1) {
        return `${event}: ${String(waiting.length)} callers waiting`
      }
      if (fake.stopCount !== expectedStops) {
        return `${event}: engine stopped ${String(fake.stopCount)} times, expected ${String(expectedStops)}`
      }
    }

    fake.end()
    await settleMicrotasks()
    if (callers.some((caller) => caller.state === "pending")) {
      return "drained: a caller is still waiting after the engine finished"
    }
    const fresh = track(adapter.speak("셋"))
    await settleMicrotasks()
    fake.end()
    await settleMicrotasks()
    if (fresh.state !== "resolved") return "drained: a new line did not finish"
    adapter.dispose()
    return null
  }

  it("never leaves two callers waiting, never stops a line nobody stopped, and never wedges", async () => {
    const failures: Array<string> = []
    for (let length = 1; length <= 5; length += 1) {
      for (const events of sequences(length)) {
        const problem = await runInterleaving(events)
        if (problem && failures.length < 5) {
          failures.push(`${events.join(" → ")} :: ${problem}`)
        }
      }
    }
    expect(failures).toEqual([])
  }, 120_000)
})
