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
  { id: "en-us-x-iol-local", name: "English", lang: "en-US", local: true },
  { id: "ko-kr-x-ism-network", name: "Korean", lang: "ko-KR", local: false },
  { id: "ko-kr-x-kob-local", name: "Korean", lang: "ko-KR", local: true },
  { id: "ko-kr-x-kod-local", name: "Korean", lang: "ko-KR", local: true },
]

describe("native adapter", () => {
  it("hands the engine the text, language, rate and volume", async () => {
    const fake = createFakeNativeEngine()
    const adapter = createNativeSpeechAdapter({
      engine: fake.engine,
      lang: "ko-KR",
    })
    adapter.setVolume(0.5)

    const settlement = track(adapter.speak("안녕하세요", { playbackRate: 0.8 }))
    await flushAsync()

    expect(fake.spoken).toEqual([
      expect.objectContaining({
        text: "안녕하세요",
        lang: "ko-KR",
        rate: 0.8,
        volume: 0.5,
      }),
    ])
    fake.end()
    await flushAsync()
    expect(settlement.state).toBe("resolved")
  })

  it("refuses a language with no voice data, says so, and speaks once it is installed", async () => {
    const fake = createFakeNativeEngine({ installed: ["en-US"] })
    const onMissingVoice = vi.fn()
    const onError = vi.fn()
    const adapter = createNativeSpeechAdapter({
      engine: fake.engine,
      lang: "ko-KR",
      onMissingVoice,
    })

    const refused = track(adapter.speak("안녕하세요", { onError }))
    await flushAsync()

    expect(refused.state).toBe("rejected")
    expect(refused.error?.name).toBe(VOICE_MISSING_ERROR_NAME)
    expect(isAbortError(refused.error)).toBe(false)
    expect(onMissingVoice).toHaveBeenCalledWith("ko-KR")
    expect(onError).toHaveBeenCalledTimes(1)
    expect(fake.spoken).toEqual([])

    // A person installs Korean in the system settings and comes back.
    fake.install("ko-KR")
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
      lang: "ko-KR",
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
      lang: "ko-KR",
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

  it("reports an engine failure as that failure, not a cancellation", async () => {
    const fake = createFakeNativeEngine()
    const adapter = createNativeSpeechAdapter({
      engine: fake.engine,
      lang: "ko-KR",
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
      lang: "ko-KR",
      voiceId: "ko-kr-x-kod-local",
    })
    await flushAsync()

    void adapter.speak("하나").catch(() => undefined)
    await flushAsync()
    void adapter.speak("둘", { lang: "ko-KR" }).catch(() => undefined)
    await flushAsync()
    void adapter.speak("three", { lang: "en-US" }).catch(() => undefined)
    await flushAsync()

    // The English line is not the chosen voice's language, so the engine
    // picks its own English voice.
    expect(fake.spoken.map((request) => request.voiceId)).toEqual([
      "ko-kr-x-kod-local",
      "ko-kr-x-kod-local",
      undefined,
    ])
    expect(fake.spoken.map((request) => request.lang)).toEqual([
      "ko-KR",
      "ko-KR",
      "en-US",
    ])
  })

  it("leaves the voice to the engine when the chosen one speaks another language", async () => {
    const fake = createFakeNativeEngine({ voices: VOICES })
    const adapter = createNativeSpeechAdapter({
      engine: fake.engine,
      lang: "ko-KR",
      voiceId: "en-us-x-iol-local",
    })
    await flushAsync()

    void adapter.speak("안녕하세요").catch(() => undefined)
    await flushAsync()

    expect(fake.spoken[0]?.voiceId).toBeUndefined()
  })
})
