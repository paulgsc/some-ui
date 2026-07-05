import type { Message } from "@chat/lib/topik"
import type { ISessionMachine } from "@chat/lib/topik/core/session-types"
import type { TTSOptions, UseAudioTTSReturn } from "some-ui-utils"
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
  options: TTSOptions
  resolveSpeak: () => void
  rejectSpeak: (error: Error) => void
}

/**
 * Fake audioTTS. `updateOptions` is always called immediately before `speak`
 * for the same message (see tts-effect-handler.ts `_speak`), so capturing the
 * pending options at the moment `speak` executes correctly associates each
 * call's onStart/onEnd/onError with its own message.
 */
function createFakeAudioTTS(): {
  audioTTS: UseAudioTTSReturn
  calls: Array<CapturedCall>
} {
  const calls: Array<CapturedCall> = []
  let pendingOptions: TTSOptions = {}

  const audioTTS: UseAudioTTSReturn = {
    speak: vi.fn((content: string) => {
      return new Promise<void>((resolve, reject) => {
        calls.push({
          content,
          options: pendingOptions,
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
    updateOptions: vi.fn((opts: TTSOptions) => {
      pendingOptions = opts
    }),
    speaking: false,
    paused: false,
    loading: false,
    supported: true,
    currentTime: 0,
    duration: 0,
    voices: [],
    selectedVoice: null,
    setSelectedVoice: vi.fn(),
  }

  return { audioTTS, calls }
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
    const { audioTTS, calls } = createFakeAudioTTS()
    const handler = createTTSEffectHandler({
      audioTTS,
      componentId: "c1",
      machine: fakeMachine,
    })

    handler.enqueue(makeMessage("m1"), true)
    handler.enqueue(makeMessage("m2"), true)

    // Second message must not start until the first completes.
    expect(audioTTS.speak).toHaveBeenCalledTimes(1)
    expect(calls[0]!.content).toBe("content-m1")

    finishSpeaking(calls[0]!)
    await flushAsync()

    expect(audioTTS.speak).toHaveBeenCalledTimes(2)
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
    const { audioTTS, calls } = createFakeAudioTTS()
    const handler = createTTSEffectHandler({
      audioTTS,
      componentId: "c1",
      machine: fakeMachine,
    })
    const msg = makeMessage("m1")

    handler.enqueue(msg, true)
    finishSpeaking(calls[0]!)
    await flushAsync()
    expect(audioTTS.speak).toHaveBeenCalledTimes(1)

    // A later effect re-dispatch (e.g. StrictMode double effect) re-enqueues
    // the same already-spoken message.
    handler.enqueue(msg, true)
    await flushAsync()
    expect(audioTTS.speak).toHaveBeenCalledTimes(1)
  })

  it("fires onMessageComplete exactly once for a completed auto message", async () => {
    const onMessageComplete = vi.fn()
    const { audioTTS, calls } = createFakeAudioTTS()
    const handler = createTTSEffectHandler({
      audioTTS,
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
    const { audioTTS, calls } = createFakeAudioTTS()
    const handler = createTTSEffectHandler({
      audioTTS,
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
    const { audioTTS, calls } = createFakeAudioTTS()
    const handler = createTTSEffectHandler({
      audioTTS,
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
    const { audioTTS, calls } = createFakeAudioTTS()
    const handler = createTTSEffectHandler({
      audioTTS,
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
    const { audioTTS, calls } = createFakeAudioTTS()
    const handler = createTTSEffectHandler({
      audioTTS,
      componentId: "c1",
      machine: fakeMachine,
      onMessageComplete,
    })

    handler.enqueue(makeMessage("m1"), true) // speaking now (calls[0])
    handler.enqueue(makeMessage("m2"), true) // queued, should never get a turn

    const manualPromise = handler.speakManually(makeMessage("manual"))
    await flushAsync()

    expect(audioTTS.stop).toHaveBeenCalled()
    // Manual speak fires immediately - it does not wait for the queue.
    expect(audioTTS.speak).toHaveBeenCalledTimes(2)
    expect(calls[1]!.content).toBe("content-manual")

    finishSpeaking(calls[1]!)
    await manualPromise

    // Manual speaks are not auto-play - no completion callback.
    expect(onMessageComplete).not.toHaveBeenCalled()

    // The dropped m2 must never be spoken, even once m1's stale in-flight
    // call is resolved.
    finishSpeaking(calls[0]!)
    await flushAsync()
    expect(audioTTS.speak).toHaveBeenCalledTimes(2)
  })

  it("clears dedup state for the message being spoken manually", async () => {
    const { audioTTS, calls } = createFakeAudioTTS()
    const handler = createTTSEffectHandler({
      audioTTS,
      componentId: "c1",
      machine: fakeMachine,
    })
    const msg = makeMessage("m1")

    handler.enqueue(msg, true)
    finishSpeaking(calls[0]!)
    await flushAsync()
    expect(audioTTS.speak).toHaveBeenCalledTimes(1)

    // Replay the already-spoken message manually (e.g. a "replay" button).
    const manualPromise = handler.speakManually(msg)
    await flushAsync()
    expect(audioTTS.speak).toHaveBeenCalledTimes(2)

    finishSpeaking(calls[1]!)
    await manualPromise

    // Auto dedup was cleared by the manual speak, so a later auto re-trigger
    // for the same message plays again instead of being silently dropped.
    handler.enqueue(msg, true)
    await flushAsync()
    expect(audioTTS.speak).toHaveBeenCalledTimes(3)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// handleStopAudio - mid-queue stop
// ═══════════════════════════════════════════════════════════════════════════

describe("TTSEffectHandler - handleStopAudio", () => {
  it("stops mid-message playback, clears state, and drops the rest of the queue", async () => {
    const onSpeechEnd = vi.fn()
    const { audioTTS } = createFakeAudioTTS()
    const handler = createTTSEffectHandler({
      audioTTS,
      componentId: "c1",
      machine: fakeMachine,
      onSpeechEnd,
    })

    handler.enqueue(makeMessage("m1"), true)
    handler.enqueue(makeMessage("m2"), true) // queued behind m1

    expect(handler.isSpeaking()).toBe(true)
    expect(handler.getCurrentMessageId()).toBe("m1")

    handler.handleStopAudio()

    expect(audioTTS.stop).toHaveBeenCalled()
    expect(handler.isSpeaking()).toBe(false)
    expect(handler.getCurrentMessageId()).toBeNull()
    expect(onSpeechEnd).toHaveBeenCalledWith("m1")

    // m2 was queued but never gets a turn - the queue was cleared.
    await flushAsync()
    expect(audioTTS.speak).toHaveBeenCalledTimes(1)
  })

  it("is a no-op when nothing is currently speaking", () => {
    const onSpeechEnd = vi.fn()
    const { audioTTS } = createFakeAudioTTS()
    const handler = createTTSEffectHandler({
      audioTTS,
      componentId: "c1",
      machine: fakeMachine,
      onSpeechEnd,
    })
    // The constructor itself calls stop() once (handles the remount case) -
    // clear that so this test only observes handleStopAudio's own behavior.
    vi.mocked(audioTTS.stop).mockClear()

    handler.handleStopAudio()
    expect(audioTTS.stop).not.toHaveBeenCalled()
    expect(onSpeechEnd).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Construction / destroy
// ═══════════════════════════════════════════════════════════════════════════

describe("TTSEffectHandler - lifecycle", () => {
  it("stops any existing audio on construction (handles the remount case)", () => {
    const { audioTTS } = createFakeAudioTTS()
    createTTSEffectHandler({
      audioTTS,
      componentId: "c1",
      machine: fakeMachine,
    })
    expect(audioTTS.stop).toHaveBeenCalledTimes(1)
  })

  it("destroy stops playback and clears dedup sets", async () => {
    const { audioTTS, calls } = createFakeAudioTTS()
    const handler = createTTSEffectHandler({
      audioTTS,
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
    expect(audioTTS.speak).toHaveBeenCalledTimes(2)
  })
})
