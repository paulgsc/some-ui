/**
 * The settlement laws from `adapters/types.ts`, run against every adapter.
 *
 * They are written once and parameterized on purpose: the laws are what
 * makes an adapter substitutable, so "the HTTP one gets it right and the
 * browser one doesn't" is the failure this file exists to catch. A new
 * backend joins the list below and inherits the whole suite.
 */

import { isAbortError } from "@speech/lib/promise/abort"
import type { FakeAudioContextHandle } from "@speech/lib/testing"
import {
  createFakeAudioContextHandle,
  createFakeSpeechSynthesis,
  flushAsync,
  track,
} from "@speech/lib/testing"
import { describe, expect, it } from "vitest"

import { createHttpSpeechAdapter } from "./http"
import type { SpeechAdapter } from "./types"
import { createWebSpeechAdapter } from "./web-speech"

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

const HARNESSES: ReadonlyArray<HarnessFactory> = [
  { name: "http", create: httpHarness },
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

    // The call site this replaces mapped `onerror` to `resolve()`, so a
    // queue built on it counted failures as successes and never retried.
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

    // `speechSynthesis.cancel()` used to silently drop the first utterance,
    // whose promise then settled as though it had been spoken in full.
    expect(displaced.state).toBe("rejected")
    expect(isAbortError(displaced.error)).toBe(true)
    expect(replacement.state).toBe("pending")

    fake.controls.end()
    await flushAsync()
    expect(replacement.state).toBe("resolved")
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
