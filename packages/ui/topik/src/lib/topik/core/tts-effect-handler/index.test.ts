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
  setMuted: (muted: boolean) => void
} {
  const calls: Array<CapturedCall> = []
  const listeners = new Set<() => void>()
  let muted = false

  const speaker: Speaker = {
    available: true,
    get muted() {
      return muted
    },
    speaking: false,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
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

  const setMuted = (next: boolean): void => {
    muted = next
    for (const listener of listeners) listener()
  }

  return { speaker, calls, setMuted }
}

const aborted = (): DOMException => new DOMException("muted", "AbortError")

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
// A STALE CANCELLATION AFTER A MANUAL REPLAY
// ═══════════════════════════════════════════════════════════════════════════

describe("TTSEffectHandler - a cancelled line cannot settle a replay", () => {
  it("lets the replay end itself when the cut-off line's abort lands first", async () => {
    const onSpeechEnd = vi.fn()
    const { speaker, calls } = createFakeSpeaker()
    const handler = createTTSEffectHandler({
      speaker,
      componentId: "c1",
      machine: fakeMachine,
      onSpeechEnd,
    })
    const msg = makeMessage("m1")

    handler.enqueue(msg, true)
    const replay = handler.speakManually(msg)
    // The stop rejects the auto line asynchronously, after the replay began.
    errorSpeaking(calls[0]!, aborted())
    await flushAsync()

    expect(handler.isSpeaking()).toBe(true)
    expect(handler.getCurrentMessageId()).toBe("m1")

    finishSpeaking(calls[1]!)
    await replay
    expect(onSpeechEnd).toHaveBeenCalledTimes(1)
    expect(handler.isSpeaking()).toBe(false)
  })

  it("does not re-add the dedup a replay cleared, even when its abort lands last", async () => {
    const onMessageComplete = vi.fn()
    const { speaker, calls } = createFakeSpeaker()
    const handler = createTTSEffectHandler({
      speaker,
      componentId: "c1",
      machine: fakeMachine,
      onMessageComplete,
    })
    const msg = makeMessage("m1")

    handler.enqueue(msg, true)
    const replay = handler.speakManually(msg)
    finishSpeaking(calls[1]!)
    await replay
    errorSpeaking(calls[0]!, aborted())
    await flushAsync()

    // The cut-off auto line was never heard: no completion, and a later
    // auto trigger for it still plays.
    expect(onMessageComplete).not.toHaveBeenCalled()
    handler.enqueue(msg, true)
    expect(speaker.say).toHaveBeenCalledTimes(3)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// MUTE HOLDS THE QUEUE
// ═══════════════════════════════════════════════════════════════════════════

describe("TTSEffectHandler - a line refused while muted waits for unmute", () => {
  it("does not mark the line spoken, and replays it, then the rest, on unmute", async () => {
    const onMessageComplete = vi.fn()
    const { speaker, calls, setMuted } = createFakeSpeaker()
    const handler = createTTSEffectHandler({
      speaker,
      componentId: "c1",
      machine: fakeMachine,
      onMessageComplete,
    })

    setMuted(true)
    handler.enqueue(makeMessage("m1"), true)
    handler.enqueue(makeMessage("m2"), true)
    errorSpeaking(calls[0]!, aborted())
    await flushAsync()

    expect(onMessageComplete).not.toHaveBeenCalled()
    expect(speaker.say).toHaveBeenCalledTimes(1)

    setMuted(false)
    await flushAsync()
    expect(calls[1]!.content).toBe("content-m1")

    finishSpeaking(calls[1]!)
    await flushAsync()
    expect(onMessageComplete).toHaveBeenCalledWith("m1")
    expect(calls[2]!.content).toBe("content-m2")
  })

  it("holds a line cut off by muting mid-speech", async () => {
    const { speaker, calls, setMuted } = createFakeSpeaker()
    const handler = createTTSEffectHandler({
      speaker,
      componentId: "c1",
      machine: fakeMachine,
    })

    handler.enqueue(makeMessage("m1"), true)
    setMuted(true)
    errorSpeaking(calls[0]!, aborted())
    await flushAsync()
    expect(handler.isSpeaking()).toBe(false)

    setMuted(false)
    await flushAsync()
    expect(calls[1]!.content).toBe("content-m1")
  })

  it("reports the held line as stopped, not ended, so the lesson waits for it", async () => {
    const onSpeechStopped = vi.fn()
    const onSpeechEnd = vi.fn()
    const { speaker, calls, setMuted } = createFakeSpeaker()
    const handler = createTTSEffectHandler({
      speaker,
      componentId: "c1",
      machine: fakeMachine,
      onSpeechStopped,
      onSpeechEnd,
    })

    handler.enqueue(makeMessage("m1"), true)
    setMuted(true)
    errorSpeaking(calls[0]!, aborted())
    await flushAsync()

    expect(onSpeechStopped).toHaveBeenCalledWith("m1")
    expect(onSpeechEnd).not.toHaveBeenCalled()
  })

  it("does not hold a replay muted mid-speech: it stops, and can be pressed again", async () => {
    const onSpeechStopped = vi.fn()
    const onSpeechEnd = vi.fn()
    const { speaker, calls, setMuted } = createFakeSpeaker()
    const handler = createTTSEffectHandler({
      speaker,
      componentId: "c1",
      machine: fakeMachine,
      onSpeechStopped,
      onSpeechEnd,
    })
    const msg = makeMessage("m1")

    handler.enqueue(msg, true)
    finishSpeaking(calls[0]!)
    await flushAsync()
    onSpeechEnd.mockClear()

    void handler.speakManually(msg)
    setMuted(true)
    errorSpeaking(calls[1]!, aborted())
    await flushAsync()
    expect(onSpeechStopped).toHaveBeenCalledWith("m1")
    expect(handler.isSpeaking()).toBe(false)

    // Held, it would play ahead of lesson lines queued while muted, and
    // each would advance the lesson.
    setMuted(false)
    await flushAsync()
    expect(speaker.say).toHaveBeenCalledTimes(2)
    expect(onSpeechEnd).not.toHaveBeenCalled()
  })

  it("ignores a replay pressed while muted, and keeps the held lesson line", async () => {
    const onSpeechEnd = vi.fn()
    const { speaker, calls, setMuted } = createFakeSpeaker()
    const handler = createTTSEffectHandler({
      speaker,
      componentId: "c1",
      machine: fakeMachine,
      onSpeechEnd,
    })

    setMuted(true)
    handler.enqueue(makeMessage("m2"), true)
    errorSpeaking(calls[0]!, aborted())
    await flushAsync()

    await handler.speakManually(makeMessage("m1"))
    expect(speaker.say).toHaveBeenCalledTimes(1)

    setMuted(false)
    await flushAsync()
    expect(calls[1]!.content).toBe("content-m2")
    finishSpeaking(calls[1]!)
    await flushAsync()
    expect(onSpeechEnd).toHaveBeenCalledWith("m2")
  })

  it("drops a held line on destroy without ending it", async () => {
    const onSpeechEnd = vi.fn()
    const onMessageComplete = vi.fn()
    const { speaker, calls, setMuted } = createFakeSpeaker()
    const handler = createTTSEffectHandler({
      speaker,
      componentId: "c1",
      machine: fakeMachine,
      onSpeechEnd,
      onMessageComplete,
    })

    setMuted(true)
    handler.enqueue(makeMessage("m1"), true)
    errorSpeaking(calls[0]!, aborted())
    await flushAsync()
    handler.destroy()

    // Ending it would advance the session's lesson past a line never heard.
    expect(onSpeechEnd).not.toHaveBeenCalled()
    expect(onMessageComplete).not.toHaveBeenCalled()
  })

  it("ends the held line when the learner stops, and does not replay it", async () => {
    const onSpeechEnd = vi.fn()
    const onMessageComplete = vi.fn()
    const { speaker, calls, setMuted } = createFakeSpeaker()
    const handler = createTTSEffectHandler({
      speaker,
      componentId: "c1",
      machine: fakeMachine,
      onSpeechEnd,
      onMessageComplete,
    })

    setMuted(true)
    handler.enqueue(makeMessage("m1"), true)
    errorSpeaking(calls[0]!, aborted())
    await flushAsync()
    handler.handleStopAudio()

    // Stopping a held line ends it, as stopping a line in flight does.
    expect(onSpeechEnd).toHaveBeenCalledTimes(1)
    expect(onSpeechEnd).toHaveBeenCalledWith("m1")
    expect(onMessageComplete).toHaveBeenCalledWith("m1")

    setMuted(false)
    await flushAsync()
    expect(speaker.say).toHaveBeenCalledTimes(1)
  })

  it("stops listening for unmute once destroyed", async () => {
    const { speaker, calls, setMuted } = createFakeSpeaker()
    const handler = createTTSEffectHandler({
      speaker,
      componentId: "c1",
      machine: fakeMachine,
    })

    setMuted(true)
    handler.enqueue(makeMessage("m1"), true)
    errorSpeaking(calls[0]!, aborted())
    await flushAsync()
    handler.destroy()

    setMuted(false)
    await flushAsync()
    expect(speaker.say).toHaveBeenCalledTimes(1)
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

// ═══════════════════════════════════════════════════════════════════════════
// EVERY INTERLEAVING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A speaker that behaves as the session does, not as a test drives it: a
 * new line cancels the one in flight (another applet's as much as this
 * handler's), `stop` cancels it, muting cancels it and refuses new lines,
 * a line starts the moment it is said, and listeners hear when mute or
 * "speaking" changes.
 */
function createSessionLikeSpeaker(): {
  speaker: Speaker
  setMuted: (muted: boolean) => void
  /** Another applet on the page says a line through the same session. */
  sayOther: () => void
  finish: () => void
  fail: () => void
  /** A line of this handler's is playing. */
  readonly inFlight: boolean
  /** The text of every line said, refused or not, in order. */
  readonly said: ReadonlyArray<string>
} {
  const said: Array<string> = []
  const listeners = new Set<() => void>()
  let muted = false
  let current: {
    resolve: () => void
    reject: (error: Error) => void
    ours: boolean
  } | null = null
  let announcedSpeaking = false
  const announce = (): void => {
    for (const listener of [...listeners]) listener()
  }
  const noteSpeaking = (): void => {
    if (announcedSpeaking === (current !== null)) return
    announcedSpeaking = current !== null
    announce()
  }
  const cancel = (): void => {
    const cancelled = current
    current = null
    cancelled?.reject(aborted())
  }
  const speaker: Speaker = {
    available: true,
    get muted() {
      return muted
    },
    get speaking() {
      return current !== null
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    say: (content: string, options: SayOptions) => {
      said.push(content)
      cancel()
      if (muted) {
        noteSpeaking()
        return Promise.reject(aborted())
      }
      return new Promise<void>((resolve, reject) => {
        current = { resolve, reject, ours: true }
        noteSpeaking()
        options.onStart?.()
      })
    },
    stop: (): void => {
      cancel()
      noteSpeaking()
    },
    describe: () => ({
      platform: "browser",
      voice: null,
      speaksLanguage: true,
    }),
  }
  const settle = (outcome: "ends" | "fails"): void => {
    const settled = current
    current = null
    if (outcome === "ends") settled?.resolve()
    else settled?.reject(new Error("engine failed"))
    noteSpeaking()
  }
  return {
    speaker,
    setMuted: (next): void => {
      muted = next
      if (next) cancel()
      announcedSpeaking = current !== null
      announce()
    },
    sayOther: (): void => {
      cancel()
      if (!muted) {
        current = {
          resolve: (): void => undefined,
          reject: (): void => undefined,
          ours: false,
        }
      }
      noteSpeaking()
    },
    finish: (): void => settle("ends"),
    fail: (): void => settle("fails"),
    get inFlight(): boolean {
      return current?.ours === true
    },
    said,
  }
}

const REPLAY_TEXT = "replayed by the learner"

const settleMicrotasks = async (): Promise<void> => {
  for (let tick = 0; tick < 10; tick += 1) await Promise.resolve()
}

const EVENTS = [
  "auto m1",
  "auto m2",
  "replay m1",
  "stop",
  "mute",
  "unmute",
  "line ends",
  "line fails",
  "another applet speaks",
  "another applet stops",
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

/**
 * Runs `events`, checking after each one that what React shows as speaking
 * is what the handler is doing, then unmutes and lets every line end, and
 * checks the queue still speaks: a wedged queue (stuck `processing`, a hold
 * nobody releases) would say nothing for a new line.
 */
async function runInterleaving(
  events: ReadonlyArray<Event>
): Promise<string | null> {
  const session = createSessionLikeSpeaker()
  let showsSpeaking = false
  const ended = new Map<string, number>()
  const completed = new Map<string, number>()
  const count = (tally: Map<string, number>, id: string): void => {
    tally.set(id, (tally.get(id) ?? 0) + 1)
  }
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  const handler = createTTSEffectHandler({
    speaker: session.speaker,
    componentId: "c1",
    machine: fakeMachine,
    onSpeechStart: () => {
      showsSpeaking = true
    },
    onSpeechEnd: (id) => {
      showsSpeaking = false
      count(ended, id)
    },
    onMessageComplete: (id) => {
      count(completed, id)
    },
    onSpeechStopped: () => {
      showsSpeaking = false
    },
  })

  const act: Readonly<Record<Event, () => void>> = {
    "auto m1": () => handler.enqueue(makeMessage("m1"), true),
    "auto m2": () => handler.enqueue(makeMessage("m2"), true),
    // The same message as the lesson's m1, told apart by its text.
    "replay m1": () =>
      void handler.speakManually(makeMessage("m1", REPLAY_TEXT)),
    stop: () => handler.handleStopAudio(),
    mute: () => session.setMuted(true),
    unmute: () => session.setMuted(false),
    "line ends": () => session.finish(),
    "line fails": () => session.fail(),
    "another applet speaks": () => session.sayOther(),
    "another applet stops": () => session.speaker.stop(),
  }

  const check = (step: string): string | null => {
    if (showsSpeaking !== handler.isSpeaking()) {
      return `${step}: shows speaking=${String(showsSpeaking)}, handler=${String(handler.isSpeaking())}`
    }
    if (handler.isSpeaking() !== session.inFlight) {
      return `${step}: handler speaking=${String(handler.isSpeaking())}, line in flight=${String(session.inFlight)}`
    }
    // The lesson advances on a line's end; a line marked complete without
    // one leaves the lesson waiting on it, and dedup refuses to replay it.
    for (const [id, times] of completed) {
      if (times > (ended.get(id) ?? 0)) {
        return `${step}: ${id} completed without ending`
      }
    }
    return null
  }

  // A replay plays when it is pressed or not at all. Played later, it
  // would land among lesson lines queued since, each advancing the lesson.
  const replayedLate = (step: string, saidBefore: number): string | null =>
    session.said.slice(saidBefore).includes(REPLAY_TEXT)
      ? `${step}: a replay played after it was pressed`
      : null

  for (const event of events) {
    const saidBefore = session.said.length
    act[event]()
    await settleMicrotasks()
    const late = event === "replay m1" ? null : replayedLate(event, saidBefore)
    if (late) return late
    const problem = check(event)
    if (problem) return problem
  }
  const saidBeforeDrain = session.said.length

  session.setMuted(false)
  await settleMicrotasks()
  for (let line = 0; line < 10 && session.speaker.speaking; line += 1) {
    session.finish()
    await settleMicrotasks()
  }
  const drained = replayedLate("drained", saidBeforeDrain) ?? check("drained")
  if (drained) return drained

  handler.enqueue(makeMessage("fresh"), true)
  await settleMicrotasks()
  if (!session.inFlight) return "drained: a new line was not spoken"
  handler.destroy()
  return null
}

describe("TTSEffectHandler - another applet on the page speaks", () => {
  it("holds a lesson line another applet cut off, and plays it once that line ends", async () => {
    const onSpeechEnd = vi.fn()
    const onMessageComplete = vi.fn()
    const session = createSessionLikeSpeaker()
    const handler = createTTSEffectHandler({
      speaker: session.speaker,
      componentId: "c1",
      machine: fakeMachine,
      onSpeechEnd,
      onMessageComplete,
    })

    handler.enqueue(makeMessage("m1"), true)
    session.sayOther()
    await settleMicrotasks()

    // Not heard, so neither ended nor complete: the lesson waits for it.
    expect(onSpeechEnd).not.toHaveBeenCalled()
    expect(onMessageComplete).not.toHaveBeenCalled()
    expect(session.said).toEqual(["content-m1"])

    session.finish()
    await settleMicrotasks()
    expect(session.said).toEqual(["content-m1", "content-m1"])
    session.finish()
    await settleMicrotasks()
    expect(onSpeechEnd).toHaveBeenCalledWith("m1")
    expect(onMessageComplete).toHaveBeenCalledWith("m1")
  })

  it("ends a lesson line another applet stopped, so the lesson moves on", async () => {
    const onSpeechEnd = vi.fn()
    const onMessageComplete = vi.fn()
    const session = createSessionLikeSpeaker()
    const handler = createTTSEffectHandler({
      speaker: session.speaker,
      componentId: "c1",
      machine: fakeMachine,
      onSpeechEnd,
      onMessageComplete,
    })

    handler.enqueue(makeMessage("m1"), true)
    session.speaker.stop()
    await settleMicrotasks()

    expect(onSpeechEnd).toHaveBeenCalledWith("m1")
    expect(onMessageComplete).toHaveBeenCalledWith("m1")
    expect(handler.isSpeaking()).toBe(false)
  })
})

describe("TTSEffectHandler - every interleaving of up to five events", () => {
  it("keeps 'speaking' true to the handler, and never wedges the queue", async () => {
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
