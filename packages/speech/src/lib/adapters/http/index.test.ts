import { isAbortError, TIMEOUT_ERROR_NAME } from "@speech/lib/promise/abort"
import {
  createFakeAudioContextHandle,
  flushAsync,
  track,
} from "@speech/lib/testing"
import { describe, expect, it, vi } from "vitest"

import { createHttpSpeechAdapter } from "."

const audioResponse = (): Promise<Response> =>
  Promise.resolve(new Response(new ArrayBuffer(16), { status: 200 }))

/** Reads a header off a `RequestInit` without asserting its shape. */
function headerOf(init: RequestInit | undefined, name: string): unknown {
  const headers = new Headers(init?.headers)
  return headers.get(name)
}

function bodyOf(init: RequestInit | undefined): unknown {
  return typeof init?.body === "string" ? JSON.parse(init.body) : undefined
}

describe("createHttpSpeechAdapter - transport", () => {
  it("posts to the configured endpoint with the configured credentials", async () => {
    const audio = createFakeAudioContextHandle()
    const fetchImpl = vi.fn(() => audioResponse())
    const adapter = createHttpSpeechAdapter({
      service: {
        provider: "openai",
        apiUrl: "https://tts.internal/v1/audio/speech",
        apiKey: "configured-key",
        format: "wav",
      },
      fetchImpl,
      playerOptions: { audioContextFactory: audio.factory },
    })

    const settlement = track(adapter.speak("hello"))
    await flushAsync()
    audio.current?.finishCurrent()
    await settlement.promise

    expect(fetchImpl).toHaveBeenCalledOnce()
    const call = fetchImpl.mock.calls.at(0)
    const [url, init] = call ?? [undefined, undefined]
    expect(String(url)).toBe("https://tts.internal/v1/audio/speech")
    expect(headerOf(init, "Authorization")).toBe("Bearer configured-key")
    expect(bodyOf(init)).toMatchObject({
      input: "hello",
      response_format: "wav",
    })
  })

  it("surfaces a non-OK response as a retryable failure, not a cancellation", async () => {
    const adapter = createHttpSpeechAdapter({
      service: { provider: "openai" },
      fetchImpl: () =>
        Promise.resolve(new Response("upstream is down", { status: 503 })),
      playerOptions: {
        audioContextFactory: createFakeAudioContextHandle().factory,
      },
    })

    const settlement = track(adapter.speak("hello"))
    await flushAsync()

    expect(settlement.state).toBe("rejected")
    expect(isAbortError(settlement.error)).toBe(false)
    expect(settlement.error?.message).toContain("503")
  })

  it("reports a timeout as a timeout, so the queue is allowed to retry it", async () => {
    const adapter = createHttpSpeechAdapter({
      service: { provider: "openai", timeout: 5 },
      fetchImpl: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            // What the platform does: a generic AbortError that says
            // nothing about *why* the request was aborted.
            reject(new DOMException("The operation was aborted.", "AbortError"))
          })
        }),
      playerOptions: {
        audioContextFactory: createFakeAudioContextHandle().factory,
      },
    })

    const settlement = track(adapter.speak("hello"))
    await new Promise((resolve) => setTimeout(resolve, 20))
    await flushAsync()

    // A timeout is a backend failure; classifying it as a cancellation
    // would make the queue drop the utterance instead of retrying it.
    expect(settlement.state).toBe("rejected")
    expect(settlement.error?.name).toBe(TIMEOUT_ERROR_NAME)
    expect(isAbortError(settlement.error)).toBe(false)
  })

  it("aborts the request when the caller cancels before the bytes arrive", async () => {
    let observed: AbortSignal | undefined
    const adapter = createHttpSpeechAdapter({
      service: { provider: "openai" },
      fetchImpl: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          observed = init?.signal ?? undefined
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"))
          })
        }),
      playerOptions: {
        audioContextFactory: createFakeAudioContextHandle().factory,
      },
    })

    const controller = new AbortController()
    const settlement = track(
      adapter.speak("hello", { signal: controller.signal })
    )
    await flushAsync()

    controller.abort()
    await flushAsync()

    // The window the player alone cannot cover: cancelled after the request
    // went out, before there was anything to play.
    expect(observed?.aborted).toBe(true)
    expect(settlement.state).toBe("rejected")
    expect(isAbortError(settlement.error)).toBe(true)
    expect(adapter.pending).toBe(0)
  })

  it("stop() flushes an utterance still waiting on the network", async () => {
    const adapter = createHttpSpeechAdapter({
      service: { provider: "openai" },
      fetchImpl: () => new Promise<Response>(() => undefined),
      playerOptions: {
        audioContextFactory: createFakeAudioContextHandle().factory,
      },
    })

    const settlement = track(adapter.speak("hello"))
    await flushAsync()
    expect(adapter.pending).toBe(1)

    adapter.stop()
    expect(adapter.pending).toBe(0)

    await flushAsync()
    expect(isAbortError(settlement.error)).toBe(true)
  })

  it("serves a repeated phrase from cache without a second request", async () => {
    const audio = createFakeAudioContextHandle()
    const fetchImpl = vi.fn(() => audioResponse())
    const adapter = createHttpSpeechAdapter({
      service: { provider: "openai" },
      fetchImpl,
      playerOptions: { audioContextFactory: audio.factory },
    })

    const first = track(adapter.speak("same phrase"))
    await flushAsync()
    audio.current?.finishCurrent()
    await first.promise

    const second = track(adapter.speak("same phrase"))
    await flushAsync()
    audio.current?.finishCurrent()
    await second.promise

    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(second.state).toBe("resolved")
  })

  it("rejects when the service has no voice to speak with", async () => {
    const adapter = createHttpSpeechAdapter({
      service: { provider: "custom", apiUrl: "https://tts.internal" },
      defaultVoice: null,
      fetchImpl: () => audioResponse(),
      playerOptions: {
        audioContextFactory: createFakeAudioContextHandle().factory,
      },
    })

    const settlement = track(adapter.speak("hello"))
    await flushAsync()

    // `BUILTIN_VOICES.custom` is empty by design - a custom backend names
    // its own voices - so this is the honest failure, not a silent no-op.
    expect(settlement.state).toBe("rejected")
    expect(settlement.error?.message).toContain("No voice")
  })
})
