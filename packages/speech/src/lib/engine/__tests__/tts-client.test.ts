/**
 * What each hosted provider is sent, and how often. A request body is a
 * boundary: the provider gets its own language tag (`LANGUAGE_TAG`), never
 * this package's `SpokenLanguage`, which Google and Azure would reject.
 */

import { createTTSClient } from "@speech/lib/engine/tts-client"
import type { FetchImpl, TTSClient } from "@speech/lib/engine/tts-client"
import { isAbortError, TIMEOUT_ERROR_NAME } from "@speech/lib/promise/abort"
import type { Settlement } from "@speech/lib/testing"
import { createPendingFetch, flushAsync, track } from "@speech/lib/testing"
import type { TTSProvider, VoiceConfig } from "@speech/lib/types/tts-types"
import { BUILTIN_VOICES } from "@speech/lib/types/tts-types"
import fc from "fast-check"
import { afterEach, describe, expect, it, vi } from "vitest"

function firstVoice(
  provider: TTSProvider,
  language: VoiceConfig["language"]
): VoiceConfig {
  const voice = BUILTIN_VOICES[provider].find(
    (candidate) => candidate.language === language
  )
  if (!voice) throw new Error(`${provider} has no ${language} voice`)
  return voice
}

/** Synthesizes once and hands back the request body the provider got. */
async function bodySent(
  provider: TTSProvider,
  voice: VoiceConfig,
  text = "hello"
): Promise<string> {
  let sent = ""
  const fetchImpl: FetchImpl = (_url, init) => {
    sent = String(init?.body)
    return Promise.resolve(
      new Response(JSON.stringify({ audioContent: "" }), { status: 200 })
    )
  }
  const client = createTTSClient({
    service: { provider, apiUrl: "https://tts.test", apiKey: "k" },
    fetchImpl,
  })
  await client.synthesize(text, voice)
  return sent
}

describe("hosted request bodies carry the provider's language tag", () => {
  it("sends Google a BCP-47 languageCode", async () => {
    const body: unknown = JSON.parse(
      await bodySent("google", firstVoice("google", "english"))
    )
    expect(body).toMatchObject({ voice: { languageCode: "en-US" } })
  })

  it("sends Azure a BCP-47 xml:lang", async () => {
    const body = await bodySent("azure", firstVoice("azure", "english"))
    expect(body).toContain('xml:lang="en-US"')
    expect(body).not.toContain("english")
  })
})

describe("Azure's SSML", () => {
  it("escapes the text, so a line with & or < is read, not a broken request", async () => {
    const body = await bodySent(
      "azure",
      firstVoice("azure", "english"),
      "Tom & Jerry <3"
    )
    expect(body).toContain(">Tom &amp; Jerry &lt;3</voice>")
    expect(body).toContain('xmlns="http://www.w3.org/2001/10/synthesis"')
  })
})

const voice = firstVoice("openai", "korean")

function hostedClient(fetchImpl: FetchImpl, timeout?: number): TTSClient {
  return createTTSClient({
    service: { provider: "openai", apiUrl: "https://tts.test", timeout },
    fetchImpl,
  })
}

function bytesOf(settlement: Settlement<ArrayBuffer>): Array<number> {
  return settlement.value ? [...new Uint8Array(settlement.value)] : []
}

function cancelled(settlement: Settlement<ArrayBuffer>): boolean {
  return settlement.state === "rejected" && isAbortError(settlement.error)
}

describe("SP1: a line asked for again while it is on its way is fetched once", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("for any run of taps, cancels and one late answer, one fetch carries the line", async () => {
    type Step = { kind: "tap" } | { kind: "cancel"; index: number }
    const step: fc.Arbitrary<Step> = fc.oneof(
      fc.constant<Step>({ kind: "tap" }),
      fc.record({
        kind: fc.constant("cancel" as const),
        index: fc.nat({ max: 20 }),
      })
    )

    await fc.assert(
      fc.asyncProperty(
        fc.array(step, { minLength: 1, maxLength: 20 }),
        fc.nat({ max: 20 }),
        async (steps, answerAt) => {
          const { fetchImpl, calls } = createPendingFetch()
          const client = hostedClient(fetchImpl)
          const taps: Array<{
            controller: AbortController
            result: Settlement<ArrayBuffer>
            cancelled: boolean
          }> = []

          for (const [at, next] of steps.entries()) {
            if (at === answerAt) calls[0]?.answer(new Uint8Array([9]))
            if (next.kind === "tap") {
              const controller = new AbortController()
              taps.push({
                controller,
                cancelled: false,
                result: track(
                  client.synthesize("한 줄", voice, {
                    signal: controller.signal,
                  })
                ),
              })
            } else {
              const tap = taps[next.index % Math.max(taps.length, 1)]
              if (tap?.result.state === "pending") {
                tap.controller.abort()
                tap.cancelled = true
              }
            }
            await flushAsync()
          }
          calls[0]?.answer(new Uint8Array([9]))
          await flushAsync()

          expect(calls.length).toBeLessThanOrEqual(1)
          for (const call of calls) expect(call.signal.aborted).toBe(false)
          for (const tap of taps) {
            expect(cancelled(tap.result)).toBe(tap.cancelled)
            if (!tap.cancelled) expect(bytesOf(tap.result)).toEqual([9])
          }
        }
      )
    )
  })

  it("each requester gets its own copy, so one detaching it leaves the rest whole", async () => {
    const { fetchImpl, calls } = createPendingFetch()
    const client = hostedClient(fetchImpl)
    const first = track(client.synthesize("다시 들어요", voice))
    const second = track(client.synthesize("다시 들어요", voice))
    await flushAsync()
    calls[0]?.answer(new Uint8Array([1, 2, 3]))
    await flushAsync()

    // What `decodeAudioData` does to the buffer it is given.
    if (first.value) structuredClone(first.value, { transfer: [first.value] })
    expect(bytesOf(second)).toEqual([1, 2, 3])
    const cached = track(client.synthesize("다시 들어요", voice))
    await flushAsync()
    expect(bytesOf(cached)).toEqual([1, 2, 3])
    expect(calls).toHaveLength(1)
  })

  it("the timeout still ends the shared fetch, and the next ask starts afresh", async () => {
    vi.useFakeTimers()
    const { fetchImpl, calls } = createPendingFetch()
    const client = hostedClient(fetchImpl, 1_000)
    const requests = [
      track(client.synthesize("느린 와이파이", voice)),
      track(client.synthesize("느린 와이파이", voice)),
    ]
    await vi.advanceTimersByTimeAsync(0)

    await vi.advanceTimersByTimeAsync(1_000)
    expect(calls[0]?.signal.aborted).toBe(true)
    for (const request of requests) {
      expect(request.error).toMatchObject({ name: TIMEOUT_ERROR_NAME })
    }

    void client.synthesize("느린 와이파이", voice).catch(() => undefined)
    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toHaveLength(2)
  })

  it("clearCache ends a request in flight, and its requesters hear it as a cancel", async () => {
    const { fetchImpl, calls } = createPendingFetch()
    const client = hostedClient(fetchImpl)
    const request = track(client.synthesize("그만", voice))
    await flushAsync()

    client.clearCache()
    await flushAsync()
    expect(calls[0]?.signal.aborted).toBe(true)
    expect(cancelled(request)).toBe(true)
  })

  it("a requester already cancelled starts nothing", async () => {
    const { fetchImpl, calls } = createPendingFetch()
    const client = hostedClient(fetchImpl)
    const request = track(
      client.synthesize("늦었어요", voice, { signal: AbortSignal.abort() })
    )
    await flushAsync()
    expect(calls).toHaveLength(0)
    expect(cancelled(request)).toBe(true)
  })

  it("keys on the whole line: two lines that hashed alike are two fetches", async () => {
    const { fetchImpl, calls } = createPendingFetch()
    const client = hostedClient(fetchImpl)
    // "Aa" and "BB" collide under a 31-multiplier string hash.
    void client.synthesize("Aa", voice)
    await flushAsync()
    calls[0]?.answer(new Uint8Array([1]))
    await flushAsync()

    const bb = track(client.synthesize("BB", voice))
    await flushAsync()
    expect(calls).toHaveLength(2)
    calls[1]?.answer(new Uint8Array([2]))
    await flushAsync()
    expect(bytesOf(bb)).toEqual([2])
  })
})
