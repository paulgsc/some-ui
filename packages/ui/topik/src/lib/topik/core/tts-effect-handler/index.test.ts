import type { SayOptions, Speaker } from "@some-ui/speech"
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
  options: SayOptions
  resolveSpeak: () => void
  rejectSpeak: (error: Error) => void
}

/**
 * A `Speaker` whose utterances finish only when a test says so.
 *
 * Each call's callbacks arrive with the call, so nothing has to assume an
 * ordering to associate an onStart/onEnd with the message that asked for
 * it. The fake this replaces had to capture options installed by a
 * preceding `updateOptions` and trust that the pairing held.
 */
function createFakeSpeaker(): {
  speaker: Speaker
  calls: Array<CapturedCall>
} {
  const calls: Array<CapturedCall> = []

  const speaker: Speaker = {
    available: true,
    say: vi.fn((content: string, options: SayOptions) => {
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
    describe: () => ({
      platform: "browser",
      voice: null,
      speaksLanguage: true,
    }),
  }

  return { speaker, calls }
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
  call.resolveSpeak()
}

function errorSpeaking(call: CapturedCall, error: Error): void {
  call.rejectSpeak(error)
}

// ═══════════════════════════════════════════════════════════════════════════
// SERIAL QUEUE
// ═══════════════════════════════════════════════════════════════════════════

describe("TTSEffectHandler - serial queue", () => {
  it("speaks messages one at a time, in FIFO order", async () => {
    const { speaker, calls } = createFakeSpeaker()
    const handler = createTTSEffectHandler({
      speaker,
      componentId: "c1",
      machine: fakeMachine,
    })

    handler.enqueue(makeMessage("m1"), true)
    handler.enqueue(makeMessage("m2"), true)

    // Second message must not start until the first completes.
    expect(speaker.say).toHaveBeenCalledTimes(1)
    expect(calls[0]!.content).toBe("content-m1")

    finishSpeaking(calls[0]!)
    await flushAsync()

    expect(speaker.say).toHaveBeenCalledTimes(2)
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
    const { speaker, calls } = createFakeSpeaker()
    const handler = createTTSEffectHandler({
      speaker,
      componentId: "c1",
      machine: fakeMachine,
    })
    const msg = makeMessage("m1")

    handler.enqueue(msg, true)
    finishSpeaking(calls[0]!)
    await flushAsync()
    expect(speaker.say).toHaveBeenCalledTimes(1)

    // A later effect re-dispatch (e.g. StrictMode double effect) re-enqueues
    // the same already-spoken message.
    handler.enqueue(msg, true)
    await flushAsync()
    expect(speaker.say).toHaveBeenCalledTimes(1)
  })

  it("fires onMessageComplete exactly once for a completed auto message", async () => {
    const onMessageComplete = vi.fn()
    const { speaker, calls } = createFakeSpeaker()
    const handler = createTTSEffectHandler({
      speaker,
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

describe("TTSEffectHandler - a line ends exactly once", () => {
  // A line's promise settles once by the speaker's contract, so the old
  // callback double-fires cannot happen; what can still race is a stop
  // against the line's own end.

  it("ends a heard line once, and a later stop changes nothing", async () => {
    const onSpeechEnd = vi.fn()
    const onMessageComplete = vi.fn()
    const { speaker, calls } = createFakeSpeaker()
    const handler = createTTSEffectHandler({
      speaker,
      componentId: "c1",
      machine: fakeMachine,
      onSpeechEnd,
      onMessageComplete,
    })

    handler.enqueue(makeMessage("m1"), true)
    finishSpeaking(calls[0]!)
    await flushAsync()
    handler.handleStopAudio()

    expect(onSpeechEnd).toHaveBeenCalledTimes(1)
    expect(onMessageComplete).toHaveBeenCalledTimes(1)
  })

  it("ends a line once when it finishes in the same tick it is stopped", async () => {
    const onSpeechEnd = vi.fn()
    const { speaker, calls } = createFakeSpeaker()
    const handler = createTTSEffectHandler({
      speaker,
      componentId: "c1",
      machine: fakeMachine,
      onSpeechEnd,
    })

    handler.enqueue(makeMessage("m1"), true)
    finishSpeaking(calls[0]!)
    handler.handleStopAudio()
    await flushAsync()

    expect(onSpeechEnd).toHaveBeenCalledTimes(1)
  })

  it("ends a failed line once, and reports the failure", async () => {
    const onSpeechEnd = vi.fn()
    const onError = vi.fn()
    const { speaker, calls } = createFakeSpeaker()
    const handler = createTTSEffectHandler({
      speaker,
      componentId: "c1",
      machine: fakeMachine,
      onSpeechEnd,
      onError,
    })

    handler.enqueue(makeMessage("m1"), true)
    errorSpeaking(calls[0]!, new Error("boom"))
    await flushAsync()

    expect(onSpeechEnd).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it("does not report a stopped line as heard or failed", async () => {
    const onSpeechEnd = vi.fn()
    const onError = vi.fn()
    const { speaker, calls } = createFakeSpeaker()
    const handler = createTTSEffectHandler({
      speaker,
      componentId: "c1",
      machine: fakeMachine,
      onSpeechEnd,
      onError,
    })

    handler.enqueue(makeMessage("m1"), true)
    handler.handleStopAudio()
    errorSpeaking(calls[0]!, new DOMException("stopped", "AbortError"))
    await flushAsync()

    // The one end is the stop's own; the cancellation is not a failure.
    expect(onSpeechEnd).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// speakManually - interrupts the queue
// ═══════════════════════════════════════════════════════════════════════════

describe("TTSEffectHandler - speakManually", () => {
  it("stops current playback and clears any queued auto messages", async () => {
    const onMessageComplete = vi.fn()
    const { speaker, calls } = createFakeSpeaker()
    const handler = createTTSEffectHandler({
      speaker,
      componentId: "c1",
      machine: fakeMachine,
      onMessageComplete,
    })

    handler.enqueue(makeMessage("m1"), true) // speaking now (calls[0])
    handler.enqueue(makeMessage("m2"), true) // queued, should never get a turn

    const manualPromise = handler.speakManually(makeMessage("manual"))
    await flushAsync()

    expect(speaker.stop).toHaveBeenCalled()
    // Manual speak fires immediately - it does not wait for the queue.
    expect(speaker.say).toHaveBeenCalledTimes(2)
    expect(calls[1]!.content).toBe("content-manual")

    finishSpeaking(calls[1]!)
    await manualPromise

    // Manual speaks are not auto-play - no completion callback.
    expect(onMessageComplete).not.toHaveBeenCalled()

    // The dropped m2 must never be spoken, even once m1's stale in-flight
    // call is resolved.
    finishSpeaking(calls[0]!)
    await flushAsync()
    expect(speaker.say).toHaveBeenCalledTimes(2)
  })

  it("clears dedup state for the message being spoken manually", async () => {
    const { speaker, calls } = createFakeSpeaker()
    const handler = createTTSEffectHandler({
      speaker,
      componentId: "c1",
      machine: fakeMachine,
    })
    const msg = makeMessage("m1")

    handler.enqueue(msg, true)
    finishSpeaking(calls[0]!)
    await flushAsync()
    expect(speaker.say).toHaveBeenCalledTimes(1)

    // Replay the already-spoken message manually (e.g. a "replay" button).
    const manualPromise = handler.speakManually(msg)
    await flushAsync()
    expect(speaker.say).toHaveBeenCalledTimes(2)

    finishSpeaking(calls[1]!)
    await manualPromise

    // Auto dedup was cleared by the manual speak, so a later auto re-trigger
    // for the same message plays again instead of being silently dropped.
    handler.enqueue(msg, true)
    await flushAsync()
    expect(speaker.say).toHaveBeenCalledTimes(3)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// handleStopAudio - mid-queue stop
// ═══════════════════════════════════════════════════════════════════════════

describe("TTSEffectHandler - handleStopAudio", () => {
  it("stops mid-message playback, clears state, and drops the rest of the queue", async () => {
    const onSpeechEnd = vi.fn()
    const { speaker } = createFakeSpeaker()
    const handler = createTTSEffectHandler({
      speaker,
      componentId: "c1",
      machine: fakeMachine,
      onSpeechEnd,
    })

    handler.enqueue(makeMessage("m1"), true)
    handler.enqueue(makeMessage("m2"), true) // queued behind m1

    expect(handler.isSpeaking()).toBe(true)
    expect(handler.getCurrentMessageId()).toBe("m1")

    handler.handleStopAudio()

    expect(speaker.stop).toHaveBeenCalled()
    expect(handler.isSpeaking()).toBe(false)
    expect(handler.getCurrentMessageId()).toBeNull()
    expect(onSpeechEnd).toHaveBeenCalledWith("m1")

    // m2 was queued but never gets a turn - the queue was cleared.
    await flushAsync()
    expect(speaker.say).toHaveBeenCalledTimes(1)
  })

  it("is a no-op when nothing is currently speaking", () => {
    const onSpeechEnd = vi.fn()
    const { speaker } = createFakeSpeaker()
    const handler = createTTSEffectHandler({
      speaker,
      componentId: "c1",
      machine: fakeMachine,
      onSpeechEnd,
    })
    // The constructor itself calls stop() once (handles the remount case) -
    // clear that so this test only observes handleStopAudio's own behavior.
    vi.mocked(speaker.stop).mockClear()

    handler.handleStopAudio()
    expect(speaker.stop).not.toHaveBeenCalled()
    expect(onSpeechEnd).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Construction / destroy
// ═══════════════════════════════════════════════════════════════════════════

describe("TTSEffectHandler - lifecycle", () => {
  it("stops any existing audio on construction (handles the remount case)", () => {
    const { speaker } = createFakeSpeaker()
    createTTSEffectHandler({
      speaker,
      componentId: "c1",
      machine: fakeMachine,
    })
    expect(speaker.stop).toHaveBeenCalledTimes(1)
  })

  it("destroy stops playback and clears dedup sets", async () => {
    const { speaker, calls } = createFakeSpeaker()
    const handler = createTTSEffectHandler({
      speaker,
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
    expect(speaker.say).toHaveBeenCalledTimes(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// LANGUAGE, NOT VOICE
// ═══════════════════════════════════════════════════════════════════════════

describe("TTSEffectHandler - every line says its language and names no voice", () => {
  it("asks for Korean, and leaves the voice to the page's session", () => {
    const { speaker, calls } = createFakeSpeaker()
    const handler = createTTSEffectHandler({
      speaker,
      componentId: "c1",
      machine: fakeMachine,
    })

    handler.enqueue(makeMessage("m1"), true)

    // Naming a voice here is what overrode the voice chosen in Settings.
    expect(calls[0]!.options.lang).toBe("ko-KR")
    expect(Object.keys(calls[0]!.options)).not.toContain("voice")
  })

  it("keeps asking for Korean across a queue", async () => {
    const { speaker, calls } = createFakeSpeaker()
    const handler = createTTSEffectHandler({
      speaker,
      componentId: "c1",
      machine: fakeMachine,
    })

    handler.enqueue(makeMessage("m1"), true)
    handler.enqueue(makeMessage("m2"), true)
    finishSpeaking(calls[0]!)
    await flushAsync()

    expect(calls[1]!.options.lang).toBe("ko-KR")
  })
})
