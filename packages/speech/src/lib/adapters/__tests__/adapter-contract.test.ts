/**
 * The settlement laws from `adapters/types.ts`, run against every adapter.
 *
 * They are written once and parameterized on purpose: the laws are what
 * makes an adapter substitutable, so "the HTTP one gets it right and the
 * browser one doesn't" is the failure this file exists to catch. A new
 * backend joins the list below and inherits the whole suite.
 */

import { createHttpSpeechAdapter } from "@speech/lib/adapters/http"
import { createNativeSpeechAdapter } from "@speech/lib/adapters/native"
import type { SpeechAdapter } from "@speech/lib/adapters/types"
import { createWebSpeechAdapter } from "@speech/lib/adapters/web-speech"
import { isAbortError } from "@speech/lib/promise/abort"
import type { FakeAudioContextHandle } from "@speech/lib/testing"
import {
  createFakeAudioContextHandle,
  createFakeNativeEngine,
  createFakeSpeechSynthesis,
  flushAsync,
  track,
} from "@speech/lib/testing"
import { hostedVoiceFor } from "@speech/lib/voices"
import { describe, expect, it, vi } from "vitest"

type Harness = {
  adapter: SpeechAdapter
  /** Drives the utterance in flight to a clean finish. */
  finish: () => void
  /** Fails the utterance in flight the way the backend would. */
  fail: () => void
}

type HarnessFactory = {
  name: string
  create: () => Harness
}

function httpHarness(): Harness {
  const audio: FakeAudioContextHandle = createFakeAudioContextHandle()
  const adapter = createHttpSpeechAdapter({
    service: { provider: "openai", apiUrl: "http://tts.test/v1/audio/speech" },
    voiceFor: (lang) =>
      hostedVoiceFor({ provider: "openai", voiceId: null }, lang),
    fetchImpl: () =>
      Promise.resolve(
        new Response(new ArrayBuffer(8), {
          status: 200,
          headers: { "Content-Type": "audio/mpeg" },
        })
      ),
    playerOptions: { audioContextFactory: audio.factory },
  })

  return {
    adapter,
    finish: (): void => audio.current?.finishCurrent(),
    fail: (): void => {
      // The audio graph is the only failure surface once bytes have
      // arrived; a transport failure is covered in `http.test.ts`.
      const source = audio.current?.sources.at(-1)
      if (source) source.onended = null
    },
  }
}

function webSpeechHarness(): Harness {
  const fake = createFakeSpeechSynthesis()
  const adapter = createWebSpeechAdapter({
    synthesis: fake.synthesis,
    utteranceFactory: fake.utteranceFactory,
  })

  return {
    adapter,
    finish: (): void => fake.controls.end(),
    fail: (): void => fake.controls.error("synthesis-failed"),
  }
}

function nativeHarness(): Harness {
  const fake = createFakeNativeEngine()
  const adapter = createNativeSpeechAdapter({
    engine: fake.engine,
    language: "korean",
  })

  return {
    adapter,
    finish: (): void => fake.end(),
    fail: (): void => fake.fail(),
  }
}

const HARNESSES: ReadonlyArray<HarnessFactory> = [
  { name: "http", create: httpHarness },
  { name: "native", create: nativeHarness },
  { name: "web-speech", create: webSpeechHarness },
]

describe.each(HARNESSES)("$name adapter - settlement laws", ({ create }) => {
  it("law 1: a speak promise settles exactly once", async () => {
    const { adapter, finish } = create()
    const outcomes: Array<string> = []

    const promise = adapter.speak("hello")
    void promise.then(
      () => outcomes.push("resolved"),
      () => outcomes.push("rejected")
    )

    await flushAsync()
    finish()
    await flushAsync()
    // Everything that might try to settle it a second time.
    finish()
    adapter.stop()
    adapter.dispose()
    await flushAsync()

    expect(outcomes).toEqual(["resolved"])
  })

  it("law 2: aborting the caller's signal rejects with an AbortError", async () => {
    const { adapter } = create()
    const controller = new AbortController()

    const settlement = track(
      adapter.speak("hello", { signal: controller.signal })
    )
    await flushAsync()
    controller.abort()
    await flushAsync()

    expect(settlement.state).toBe("rejected")
    expect(isAbortError(settlement.error)).toBe(true)
  })

  it("law 3: stop() flushes - nothing is pending once it returns", async () => {
    const { adapter } = create()

    const settlement = track(adapter.speak("hello"))
    await flushAsync()
    expect(adapter.pending).toBeGreaterThan(0)

    adapter.stop()
    expect(adapter.pending).toBe(0)

    await flushAsync()
    expect(settlement.state).toBe("rejected")
    expect(isAbortError(settlement.error)).toBe(true)
  })

  it("law 3: dispose() flushes too", async () => {
    const { adapter } = create()

    const settlement = track(adapter.speak("hello"))
    await flushAsync()

    adapter.dispose()
    expect(adapter.pending).toBe(0)

    await flushAsync()
    expect(isAbortError(settlement.error)).toBe(true)
  })

  it("law 4: disposal is terminal - later speaks reject immediately", async () => {
    const { adapter } = create()
    adapter.dispose()

    const settlement = track(adapter.speak("hello"))
    await flushAsync()

    expect(settlement.state).toBe("rejected")
    expect(isAbortError(settlement.error)).toBe(true)
    expect(adapter.pending).toBe(0)
  })

  it("a stopped session cannot leave the next one wedged", async () => {
    const { adapter, finish } = create()

    const abandoned = track(adapter.speak("first"))
    await flushAsync()
    adapter.stop()
    await flushAsync()
    expect(abandoned.state).toBe("rejected")

    const revived = track(adapter.speak("second"))
    await flushAsync()
    finish()
    await flushAsync()

    expect(revived.state).toBe("resolved")
  })
})

describe("web-speech adapter - browser specifics", () => {
  it("rejects with the real error rather than reporting a clean finish", async () => {
    const fake = createFakeSpeechSynthesis()
    const adapter = createWebSpeechAdapter({
      synthesis: fake.synthesis,
      utteranceFactory: fake.utteranceFactory,
    })

    const settlement = track(adapter.speak("hello"))
    await flushAsync()
    fake.controls.error("synthesis-failed")
    await flushAsync()

    // Resolving on `onerror` would make a queue count failures as successes
    // and never retry.
    expect(settlement.state).toBe("rejected")
    expect(isAbortError(settlement.error)).toBe(false)
    expect(settlement.error?.message).toContain("synthesis-failed")
  })

  it("treats the browser's own cancellation reasons as aborts", async () => {
    const fake = createFakeSpeechSynthesis()
    const adapter = createWebSpeechAdapter({
      synthesis: fake.synthesis,
      utteranceFactory: fake.utteranceFactory,
    })

    const settlement = track(adapter.speak("hello"))
    await flushAsync()
    fake.controls.error("interrupted")
    await flushAsync()

    expect(isAbortError(settlement.error)).toBe(true)
  })

  it("rejects the displaced utterance when a new one supersedes it", async () => {
    const fake = createFakeSpeechSynthesis()
    const adapter = createWebSpeechAdapter({
      synthesis: fake.synthesis,
      utteranceFactory: fake.utteranceFactory,
    })

    const displaced = track(adapter.speak("first"))
    await flushAsync()
    const replacement = track(adapter.speak("second"))
    await flushAsync()

    // `speechSynthesis.cancel()` drops the first utterance silently; its
    // promise must not settle as though it had been spoken in full.
    expect(displaced.state).toBe("rejected")
    expect(isAbortError(displaced.error)).toBe(true)
    expect(replacement.state).toBe("pending")

    fake.controls.end()
    await flushAsync()
    expect(replacement.state).toBe("resolved")
  })

  it("lets a displaced caller's late abort leave the replacement speaking", async () => {
    const fake = createFakeSpeechSynthesis()
    const adapter = createWebSpeechAdapter({
      synthesis: fake.synthesis,
      utteranceFactory: fake.utteranceFactory,
    })
    const first = new AbortController()

    void adapter.speak("first", { signal: first.signal }).catch(() => undefined)
    await flushAsync()
    const replacement = track(adapter.speak("second"))
    await flushAsync()
    const cancelsSoFar = fake.controls.cancelCount

    first.abort()
    await flushAsync()

    expect(fake.controls.cancelCount).toBe(cancelsSoFar)
    expect(replacement.state).toBe("pending")
  })

  it("announces when the browser's voices load", () => {
    const fake = createFakeSpeechSynthesis()
    const adapter = createWebSpeechAdapter({
      synthesis: fake.synthesis,
      utteranceFactory: fake.utteranceFactory,
    })
    let announced = 0
    const unsubscribe = adapter.subscribe(() => {
      announced += 1
    })

    // Nothing loaded yet is not "no Korean voice": the browser has not said.
    expect(adapter.describe("korean").availability).toBe("checking")
    fake.controls.loadVoices([
      {
        name: "Yuna",
        lang: "ko-KR",
        voiceURI: "Yuna",
        default: false,
        localService: true,
      },
    ])

    expect(announced).toBe(1)
    expect(adapter.describe("korean")).toEqual({
      platform: "browser",
      voice: "Yuna",
      availability: "available",
    })
    unsubscribe()
  })

  it("stops waiting for voices a browser never announces, and says so", () => {
    vi.useFakeTimers()
    try {
      const fake = createFakeSpeechSynthesis()
      const adapter = createWebSpeechAdapter({
        synthesis: fake.synthesis,
        utteranceFactory: fake.utteranceFactory,
        voicesWaitMs: 1000,
      })
      let told = 0
      adapter.subscribe(() => {
        told += 1
      })

      expect(adapter.describe("korean").availability).toBe("checking")
      vi.advanceTimersByTime(1000)
      // No voices, and no announcement coming: Korean is missing here.
      expect(told).toBe(1)
      expect(adapter.describe("korean").availability).toBe("missing")
      adapter.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it("does not wait when the browser's voices are already loaded", () => {
    const fake = createFakeSpeechSynthesis()
    fake.controls.loadVoices([
      {
        name: "Samantha",
        lang: "en-US",
        voiceURI: "Samantha",
        default: true,
        localService: true,
      },
    ])
    const adapter = createWebSpeechAdapter({
      synthesis: fake.synthesis,
      utteranceFactory: fake.utteranceFactory,
    })

    expect(adapter.describe("korean").availability).toBe("missing")
    adapter.dispose()
  })

  it("says a language is missing once the browser's voices have loaded without it", () => {
    const fake = createFakeSpeechSynthesis()
    const adapter = createWebSpeechAdapter({
      synthesis: fake.synthesis,
      utteranceFactory: fake.utteranceFactory,
    })

    fake.controls.loadVoices([
      {
        name: "Samantha",
        lang: "en-US",
        voiceURI: "Samantha",
        default: true,
        localService: true,
      },
      // Konkani: its tag starts with "ko", and it is not Korean.
      {
        name: "Konkani",
        lang: "kok-IN",
        voiceURI: "Konkani",
        default: false,
        localService: true,
      },
    ])

    expect(adapter.describe("korean")).toEqual({
      platform: "browser",
      voice: "Samantha",
      availability: "missing",
    })
  })

  it("reports word boundaries for callers that follow along", async () => {
    const fake = createFakeSpeechSynthesis()
    const adapter = createWebSpeechAdapter({
      synthesis: fake.synthesis,
      utteranceFactory: fake.utteranceFactory,
    })
    const boundaries: Array<[number, number]> = []

    const settlement = track(
      adapter.speak("hello there", {
        onBoundary: (charIndex, charLength) =>
          boundaries.push([charIndex, charLength]),
      })
    )
    await flushAsync()
    fake.controls.boundary(0, 5)
    fake.controls.boundary(6, 5)
    fake.controls.end()
    await settlement.promise

    expect(boundaries).toEqual([
      [0, 5],
      [6, 5],
    ])
  })

  const browserVoice = (
    name: string,
    lang: string,
    extra: { default?: boolean; localService?: boolean } = {}
  ): SpeechSynthesisVoice => ({
    name,
    lang,
    voiceURI: name,
    default: extra.default ?? false,
    localService: extra.localService ?? true,
  })

  it("hands a line to the browser's voice for its language, by name", async () => {
    const english = browserVoice("Samantha", "en-US", { default: true })
    const korean = browserVoice("Yuna", "ko-KR")
    const fake = createFakeSpeechSynthesis([english, korean])
    const adapter = createWebSpeechAdapter({
      synthesis: fake.synthesis,
      utteranceFactory: fake.utteranceFactory,
    })

    void adapter
      .speak("안녕하세요", { language: "korean" })
      .catch(() => undefined)
    await flushAsync()

    // Named, not left to the browser's guess from `lang`.
    expect(fake.controls.spoken[0]?.voice).toBe(korean)
    expect(adapter.describe("korean")).toEqual({
      platform: "browser",
      voice: "Yuna",
      availability: "available",
    })
  })

  it("says when the browser has no voice for the language, and whose voice reads it instead", () => {
    const fake = createFakeSpeechSynthesis([
      browserVoice("Samantha", "en-US", { default: true }),
    ])
    const adapter = createWebSpeechAdapter({
      synthesis: fake.synthesis,
      utteranceFactory: fake.utteranceFactory,
    })

    expect(adapter.describe("korean")).toEqual({
      platform: "browser",
      voice: "Samantha",
      availability: "missing",
    })
  })

  it("is unsupported, and honest about it, with no speechSynthesis", async () => {
    const adapter = createWebSpeechAdapter({
      synthesis: undefined,
      // jsdom has no `speechSynthesis`, so this genuinely resolves to none.
    })

    expect(adapter.supported).toBe(false)
    const settlement = track(adapter.speak("hello"))
    await flushAsync()
    expect(settlement.state).toBe("rejected")
  })
})
