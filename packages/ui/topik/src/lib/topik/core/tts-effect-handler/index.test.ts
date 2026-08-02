import type { SpeakOptions, SpeechAdapter, VoiceConfig } from "@some-ui/speech"
import type { Message } from "@topik/lib/topik"
import type { ISessionMachine } from "@topik/lib/topik/core/session-types"
import { describe, expect, it, vi } from "vitest"

import { createTTSEffectHandler } from "."

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

function makeMessage(id: string, content = `content-${id}`): Message {
  return {
    id,
    role: "assistant",
    content,
    timestamp: new Date(2024, 0, 1).toISOString(),
    korean: `한국어-${id}`,
    english: `english-${id}`,
  }
}

type CapturedCall = {
  content: string
  options: SpeakOptions
  resolveSpeak: () => void
  rejectSpeak: (error: Error) => void
}

/**
 * A `SpeechAdapter` whose utterances finish only when a test says so.
 *
 * Each call's callbacks arrive with the call, so nothing has to assume an
 * ordering to associate an onStart/onEnd with the message that asked for
 * it. The fake this replaces had to capture options installed by a
 * preceding `updateOptions` and trust that the pairing held.
 */
function createFakeSpeechAdapter(voices: ReadonlyArray<VoiceConfig> = []): {
  speechAdapter: SpeechAdapter
  calls: Array<CapturedCall>
} {
  const calls: Array<CapturedCall> = []

  const speechAdapter: SpeechAdapter = {
    id: "web-speech",
    supported: true,
    voices,
    pending: 0,
    speak: vi.fn((content: string, options: SpeakOptions = {}) => {
      return new Promise<void>((resolve, reject) => {
        calls.push({
          content,
          options,
          resolveSpeak: resolve,
          rejectSpeak: reject,
        })
      })
    }),
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    setVolume: vi.fn(),
    setPlaybackRate: vi.fn(),
    dispose: vi.fn(),
  }

  return { speechAdapter, calls }
}

const flushAsync = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0))

/**
 * `machine` is part of TTSEffectHandlerConfig but is never read anywhere in
 * tts-effect-handler.ts, so an empty placeholder that satisfies the type is
 * enough.
 */
function makeFakeMachine(): ISessionMachine {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see comment above
  return {} as ISessionMachine
}

const fakeMachine = makeFakeMachine()

function finishSpeaking(call: CapturedCall): void {
  call.options.onEnd?.()
  call.resolveSpeak()
}

function errorSpeaking(call: CapturedCall, error: Error): void {
  call.options.onError?.(error)
  call.rejectSpeak(error)
}

// ═══════════════════════════════════════════════════════════════════════════
// SERIAL QUEUE
// ═══════════════════════════════════════════════════════════════════════════

describe("TTSEffectHandler - serial queue", () => {
  it("speaks messages one at a time, in FIFO order", async () => {
    const { speechAdapter, calls } = createFakeSpeechAdapter()
    const handler = createTTSEffectHandler({
      speechAdapter,
      componentId: "c1",
      machine: fakeMachine,
    })

    handler.enqueue(makeMessage("m1"), true)
    handler.enqueue(makeMessage("m2"), true)

    // Second message must not start until the first completes.
    expect(speechAdapter.speak).toHaveBeenCalledTimes(1)
    expect(calls[0]!.content).toBe("content-m1")

    finishSpeaking(calls[0]!)
    await flushAsync()

    expect(speechAdapter.speak).toHaveBeenCalledTimes(2)
    expect(calls[1]!.content).toBe("content-m2")

    finishSpeaking(calls[1]!)
    await flushAsync()
    expect(handler.isSpeaking()).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-PLAY DEDUPLICATION (Set-based)
// ═══════════════════════════════════════════════════════════════════════════

describe("TTSEffectHandler - auto-play dedup", () => {
  it("does not re-speak an auto message that has already completed", async () => {
    const { speechAdapter, calls } = createFakeSpeechAdapter()
    const handler = createTTSEffectHandler({
      speechAdapter,
      componentId: "c1",
      machine: fakeMachine,
    })
    const msg = makeMessage("m1")

    handler.enqueue(msg, true)
    finishSpeaking(calls[0]!)
    await flushAsync()
    expect(speechAdapter.speak).toHaveBeenCalledTimes(1)

    // A later effect re-dispatch (e.g. StrictMode double effect) re-enqueues
    // the same already-spoken message.
    handler.enqueue(msg, true)
    await flushAsync()
    expect(speechAdapter.speak).toHaveBeenCalledTimes(1)
  })

  it("fires onMessageComplete exactly once for a completed auto message", async () => {
    const onMessageComplete = vi.fn()
    const { speechAdapter, calls } = createFakeSpeechAdapter()
    const handler = createTTSEffectHandler({
      speechAdapter,
      componentId: "c1",
      machine: fakeMachine,
      onMessageComplete,
    })

    handler.enqueue(makeMessage("m1"), true)
    finishSpeaking(calls[0]!)
    await flushAsync()

    expect(onMessageComplete).toHaveBeenCalledTimes(1)
    expect(onMessageComplete).toHaveBeenCalledWith("m1")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// DOUBLE-FIRE GUARD (completionFired)
// ═══════════════════════════════════════════════════════════════════════════

describe("TTSEffectHandler - double-fire guard", () => {
  it("ignores a duplicate onEnd call for the same message", async () => {
    const onSpeechEnd = vi.fn()
    const onMessageComplete = vi.fn()
    const { speechAdapter, calls } = createFakeSpeechAdapter()
    const handler = createTTSEffectHandler({
      speechAdapter,
      componentId: "c1",
      machine: fakeMachine,
      onSpeechEnd,
      onMessageComplete,
    })

    handler.enqueue(makeMessage("m1"), true)
    calls[0]!.options.onEnd?.()
    calls[0]!.options.onEnd?.() // underlying implementation fires twice
    calls[0]!.resolveSpeak()
    await flushAsync()

    expect(onSpeechEnd).toHaveBeenCalledTimes(1)
    expect(onMessageComplete).toHaveBeenCalledTimes(1)
  })

  it("ignores onError after onEnd already completed the message", async () => {
    const onSpeechEnd = vi.fn()
    const onError = vi.fn()
    const { speechAdapter, calls } = createFakeSpeechAdapter()
    const handler = createTTSEffectHandler({
      speechAdapter,
      componentId: "c1",
      machine: fakeMachine,
      onSpeechEnd,
      onError,
    })

    handler.enqueue(makeMessage("m1"), true)
    calls[0]!.options.onEnd?.()
    calls[0]!.options.onError?.(new Error("late error"))
    calls[0]!.resolveSpeak()
    await flushAsync()

    expect(onSpeechEnd).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
  })

  it("treats onError as terminal too - a following onEnd is ignored", async () => {
    const onSpeechEnd = vi.fn()
    const { speechAdapter, calls } = createFakeSpeechAdapter()
    const handler = createTTSEffectHandler({
      speechAdapter,
      componentId: "c1",
      machine: fakeMachine,
      onSpeechEnd,
    })

    handler.enqueue(makeMessage("m1"), true)
    errorSpeaking(calls[0]!, new Error("boom"))
    calls[0]!.options.onEnd?.()
    await flushAsync()

    // onSpeechEnd fires once, from the onError branch
    expect(onSpeechEnd).toHaveBeenCalledTimes(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// speakManually - interrupts the queue
// ═══════════════════════════════════════════════════════════════════════════

describe("TTSEffectHandler - speakManually", () => {
  it("stops current playback and clears any queued auto messages", async () => {
    const onMessageComplete = vi.fn()
    const { speechAdapter, calls } = createFakeSpeechAdapter()
    const handler = createTTSEffectHandler({
      speechAdapter,
      componentId: "c1",
      machine: fakeMachine,
      onMessageComplete,
    })

    handler.enqueue(makeMessage("m1"), true) // speaking now (calls[0])
    handler.enqueue(makeMessage("m2"), true) // queued, should never get a turn

    const manualPromise = handler.speakManually(makeMessage("manual"))
    await flushAsync()

    expect(speechAdapter.stop).toHaveBeenCalled()
    // Manual speak fires immediately - it does not wait for the queue.
    expect(speechAdapter.speak).toHaveBeenCalledTimes(2)
    expect(calls[1]!.content).toBe("content-manual")

    finishSpeaking(calls[1]!)
    await manualPromise

    // Manual speaks are not auto-play - no completion callback.
    expect(onMessageComplete).not.toHaveBeenCalled()

    // The dropped m2 must never be spoken, even once m1's stale in-flight
    // call is resolved.
    finishSpeaking(calls[0]!)
    await flushAsync()
    expect(speechAdapter.speak).toHaveBeenCalledTimes(2)
  })

  it("clears dedup state for the message being spoken manually", async () => {
    const { speechAdapter, calls } = createFakeSpeechAdapter()
    const handler = createTTSEffectHandler({
      speechAdapter,
      componentId: "c1",
      machine: fakeMachine,
    })
    const msg = makeMessage("m1")

    handler.enqueue(msg, true)
    finishSpeaking(calls[0]!)
    await flushAsync()
    expect(speechAdapter.speak).toHaveBeenCalledTimes(1)

    // Replay the already-spoken message manually (e.g. a "replay" button).
    const manualPromise = handler.speakManually(msg)
    await flushAsync()
    expect(speechAdapter.speak).toHaveBeenCalledTimes(2)

    finishSpeaking(calls[1]!)
    await manualPromise

    // Auto dedup was cleared by the manual speak, so a later auto re-trigger
    // for the same message plays again instead of being silently dropped.
    handler.enqueue(msg, true)
    await flushAsync()
    expect(speechAdapter.speak).toHaveBeenCalledTimes(3)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// handleStopAudio - mid-queue stop
// ═══════════════════════════════════════════════════════════════════════════

describe("TTSEffectHandler - handleStopAudio", () => {
  it("stops mid-message playback, clears state, and drops the rest of the queue", async () => {
    const onSpeechEnd = vi.fn()
    const { speechAdapter } = createFakeSpeechAdapter()
    const handler = createTTSEffectHandler({
      speechAdapter,
      componentId: "c1",
      machine: fakeMachine,
      onSpeechEnd,
    })

    handler.enqueue(makeMessage("m1"), true)
    handler.enqueue(makeMessage("m2"), true) // queued behind m1

    expect(handler.isSpeaking()).toBe(true)
    expect(handler.getCurrentMessageId()).toBe("m1")

    handler.handleStopAudio()

    expect(speechAdapter.stop).toHaveBeenCalled()
    expect(handler.isSpeaking()).toBe(false)
    expect(handler.getCurrentMessageId()).toBeNull()
    expect(onSpeechEnd).toHaveBeenCalledWith("m1")

    // m2 was queued but never gets a turn - the queue was cleared.
    await flushAsync()
    expect(speechAdapter.speak).toHaveBeenCalledTimes(1)
  })

  it("is a no-op when nothing is currently speaking", () => {
    const onSpeechEnd = vi.fn()
    const { speechAdapter } = createFakeSpeechAdapter()
    const handler = createTTSEffectHandler({
      speechAdapter,
      componentId: "c1",
      machine: fakeMachine,
      onSpeechEnd,
    })
    // The constructor itself calls stop() once (handles the remount case) -
    // clear that so this test only observes handleStopAudio's own behavior.
    vi.mocked(speechAdapter.stop).mockClear()

    handler.handleStopAudio()
    expect(speechAdapter.stop).not.toHaveBeenCalled()
    expect(onSpeechEnd).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Construction / destroy
// ═══════════════════════════════════════════════════════════════════════════

describe("TTSEffectHandler - lifecycle", () => {
  it("stops any existing audio on construction (handles the remount case)", () => {
    const { speechAdapter } = createFakeSpeechAdapter()
    createTTSEffectHandler({
      speechAdapter,
      componentId: "c1",
      machine: fakeMachine,
    })
    expect(speechAdapter.stop).toHaveBeenCalledTimes(1)
  })

  it("destroy stops playback and clears dedup sets", async () => {
    const { speechAdapter, calls } = createFakeSpeechAdapter()
    const handler = createTTSEffectHandler({
      speechAdapter,
      componentId: "c1",
      machine: fakeMachine,
    })
    const msg = makeMessage("m1")

    handler.enqueue(msg, true)
    finishSpeaking(calls[0]!)
    await flushAsync()

    handler.destroy()

    // Dedup was cleared by destroy, so re-enqueuing the same id after a
    // fresh handler lifecycle would speak again.
    handler.enqueue(msg, true)
    await flushAsync()
    expect(speechAdapter.speak).toHaveBeenCalledTimes(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// VOICE SELECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The mismatch this prevents does not degrade, it fails: `openai-edge-tts`
 * asked to read Hangul in an en-US voice returns an empty audio stream,
 * which the backend reports as a 500 about "parameters" and never as "wrong
 * language". Since a host's default voice is English (apps/www ships an
 * unset `ttsVoiceId`, which resolves to the catalogue's first entry), the
 * applet asking for its own language is the whole difference between a
 * Korean lesson that speaks and one that 500s on its first sentence.
 */
const KOREAN_VOICE: VoiceConfig = {
  id: "ko-KR-SunHiNeural",
  name: "Sun-Hi",
  provider: "openai",
  language: "ko-KR",
}
const ENGLISH_VOICE: VoiceConfig = {
  id: "onyx",
  name: "Onyx",
  provider: "openai",
  language: "en-US",
}

describe("TTSEffectHandler - voice selection", () => {
  it("speaks with the adapter's Korean voice, not its first", () => {
    const { speechAdapter, calls } = createFakeSpeechAdapter([
      ENGLISH_VOICE,
      KOREAN_VOICE,
    ])
    const handler = createTTSEffectHandler({
      speechAdapter,
      componentId: "c1",
      machine: fakeMachine,
    })

    handler.enqueue(makeMessage("m1"), true)

    expect(calls[0]!.options.voice).toEqual(KOREAN_VOICE)
  })

  it("names no voice when the backend offers no Korean one", () => {
    // The browser adapter on a machine with no Korean voice installed.
    // Passing nothing leaves the session's own default in charge, which is
    // what this applet did before it asked for a language at all.
    const { speechAdapter, calls } = createFakeSpeechAdapter([ENGLISH_VOICE])
    const handler = createTTSEffectHandler({
      speechAdapter,
      componentId: "c1",
      machine: fakeMachine,
    })

    handler.enqueue(makeMessage("m1"), true)

    expect(calls[0]!.options.voice).toBeUndefined()
  })

  it("matches on the language subtag, not an exact locale", () => {
    // Browser voices report tags like "ko" or "ko-KR-x-something"; an
    // equality check would miss both and silently fall back to English.
    const plainKorean: VoiceConfig = { ...KOREAN_VOICE, language: "KO" }
    const { speechAdapter, calls } = createFakeSpeechAdapter([
      ENGLISH_VOICE,
      plainKorean,
    ])
    const handler = createTTSEffectHandler({
      speechAdapter,
      componentId: "c1",
      machine: fakeMachine,
    })

    handler.enqueue(makeMessage("m1"), true)

    expect(calls[0]!.options.voice).toEqual(plainKorean)
  })

  it("keeps speaking with it across a queue", async () => {
    const { speechAdapter, calls } = createFakeSpeechAdapter([
      ENGLISH_VOICE,
      KOREAN_VOICE,
    ])
    const handler = createTTSEffectHandler({
      speechAdapter,
      componentId: "c1",
      machine: fakeMachine,
    })

    handler.enqueue(makeMessage("m1"), true)
    handler.enqueue(makeMessage("m2"), true)
    finishSpeaking(calls[0]!)
    await flushAsync()

    expect(calls[1]!.options.voice).toEqual(KOREAN_VOICE)
  })
})
