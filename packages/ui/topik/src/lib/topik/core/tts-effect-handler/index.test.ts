/**
 * The effect handler against the real speech session (`SpeechQueueManager`
 * from `@some-ui/speech`): the session's own policy decides what plays and
 * what each line's outcome is, so these tests check the handler against
 * the owner it runs under, not against an imitation of one. Only the
 * adapter underneath is a test double: one line at a time, ending when a
 * test says.
 */

import type { SpeechAdapter } from "@some-ui/speech"
import { SpeechQueueManager } from "@some-ui/speech"
import type { Message } from "@topik/lib/topik"
import type { ISessionMachine } from "@topik/lib/topik/core/session-types"
import type { Mock } from "vitest"
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

const aborted = (): DOMException => new DOMException("stopped", "AbortError")

type LineAdapter = {
  adapter: SpeechAdapter
  /** Every line handed to the device, in order. */
  readonly said: ReadonlyArray<string>
  /** The line the device is saying (started, not ended), or null. */
  readonly playing: string | null
  /** Starts a line handed over but not yet audible (`startsAt: "later"`). */
  start: () => void
  finish: () => void
  fail: () => void
}

/**
 * A device voice that says one line at a time and ends it when a test says,
 * keeping the adapter settlement laws: a line cancelled by its signal or by
 * `stop` rejects as an `AbortError`. A browser voice starts the moment it
 * is handed a line (`startsAt: "once"`); a hosted one fetches the audio
 * first, so its line starts later, when a test says (`"later"`).
 */
function createLineAdapter(startsAt: "once" | "later" = "once"): LineAdapter {
  const said: Array<string> = []
  let current: {
    text: string
    started: boolean
    onStart: (() => void) | undefined
    resolve: () => void
    reject: (error: Error) => void
  } | null = null
  const stop = (): void => {
    const stopped = current
    current = null
    stopped?.reject(aborted())
  }
  const adapter: SpeechAdapter = {
    id: "web-speech",
    supported: true,
    pending: 0,
    describe: () => ({
      platform: "browser",
      voice: null,
      availability: "available",
    }),
    subscribe: () => () => undefined,
    speak: (text, options = {}) => {
      stop()
      if (options.signal?.aborted) return Promise.reject(aborted())
      said.push(text)
      return new Promise<void>((resolve, reject) => {
        const entry = {
          text,
          started: startsAt === "once",
          onStart: options.onStart,
          resolve,
          reject,
        }
        current = entry
        options.signal?.addEventListener(
          "abort",
          () => {
            if (current === entry) current = null
            reject(aborted())
          },
          { once: true }
        )
        if (entry.started) options.onStart?.()
      })
    },
    stop,
    pause: () => undefined,
    resume: () => undefined,
    setVolume: () => undefined,
    setPlaybackRate: () => undefined,
    dispose: stop,
  }
  return {
    adapter,
    said,
    get playing(): string | null {
      return current?.started === true ? current.text : null
    },
    start: (): void => {
      if (!current || current.started) return
      current.started = true
      current.onStart?.()
    },
    finish: (): void => {
      const finished = current
      current = null
      finished?.resolve()
    },
    fail: (): void => {
      const failed = current
      current = null
      failed?.reject(new Error("engine failed"))
    },
  }
}

type Session = LineAdapter & { manager: SpeechQueueManager }

function createSession(startsAt: "once" | "later" = "once"): Session {
  const line = createLineAdapter(startsAt)
  return Object.assign(line, { manager: new SpeechQueueManager(line.adapter) })
}

/**
 * The session's pump runs on microtasks, an interrupted line goes back in
 * the queue on another, and so on: enough turns for every chain to settle.
 */
const settle = async (): Promise<void> => {
  for (let tick = 0; tick < 40; tick += 1) await Promise.resolve()
}

/**
 * `machine` is part of TTSEffectHandlerConfig but is never read anywhere in
 * the handler, so an empty placeholder that satisfies the type is enough.
 */
function makeFakeMachine(): ISessionMachine {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see comment above
  return {} as ISessionMachine
}

const fakeMachine = makeFakeMachine()

type Callbacks = {
  onSpeechStart: Mock<(messageId: string) => void>
  onSpeechEnd: Mock<(messageId: string) => void>
  onSpeechStopped: Mock<(messageId: string) => void>
  onMessageComplete: Mock<(messageId: string) => void>
  onError: Mock<(error: Error, messageId: string) => void>
}

type Setup = Session & {
  handler: ReturnType<typeof createTTSEffectHandler>
  callbacks: Callbacks
}

function setup(): Setup {
  const session = createSession()
  const callbacks: Callbacks = {
    onSpeechStart: vi.fn(),
    onSpeechEnd: vi.fn(),
    onSpeechStopped: vi.fn(),
    onMessageComplete: vi.fn(),
    onError: vi.fn(),
  }
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  const handler = createTTSEffectHandler({
    speaker: session.manager.speakerFor("topik"),
    componentId: "c1",
    machine: fakeMachine,
    ...callbacks,
  })
  return Object.assign(session, { handler, callbacks })
}

// ═══════════════════════════════════════════════════════════════════════════
// SERIAL QUEUE AND DEDUP
// ═══════════════════════════════════════════════════════════════════════════

describe("TTSEffectHandler - serial queue", () => {
  it("speaks messages one at a time, in order", async () => {
    const t = setup()

    t.handler.enqueue(makeMessage("m1"), true)
    t.handler.enqueue(makeMessage("m2"), true)
    await settle()
    expect(t.said).toEqual(["content-m1"])

    t.finish()
    await settle()
    expect(t.said).toEqual(["content-m1", "content-m2"])
    t.finish()
    await settle()
    expect(t.handler.isSpeaking()).toBe(false)
  })
})

describe("TTSEffectHandler - auto-play dedup", () => {
  it("does not re-speak an auto message that has already been heard", async () => {
    const t = setup()
    const msg = makeMessage("m1")

    t.handler.enqueue(msg, true)
    await settle()
    t.finish()
    await settle()
    // A later effect re-dispatch (React Strict Mode) re-enqueues it.
    t.handler.enqueue(msg, true)
    await settle()

    expect(t.said).toEqual(["content-m1"])
  })

  it("reports a heard auto message complete exactly once", async () => {
    const t = setup()

    t.handler.enqueue(makeMessage("m1"), true)
    await settle()
    t.finish()
    await settle()

    expect(t.callbacks.onMessageComplete).toHaveBeenCalledTimes(1)
    expect(t.callbacks.onMessageComplete).toHaveBeenCalledWith("m1")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// A LINE ENDS ONCE
// ═══════════════════════════════════════════════════════════════════════════

describe("TTSEffectHandler - a line ends exactly once", () => {
  it("ends a heard line once, and a later stop changes nothing", async () => {
    const t = setup()

    t.handler.enqueue(makeMessage("m1"), true)
    await settle()
    t.finish()
    await settle()
    t.handler.handleStopAudio()

    expect(t.callbacks.onSpeechEnd).toHaveBeenCalledTimes(1)
    expect(t.callbacks.onMessageComplete).toHaveBeenCalledTimes(1)
  })

  it("ends a line once when it finishes in the same tick it is stopped", async () => {
    const t = setup()

    t.handler.enqueue(makeMessage("m1"), true)
    await settle()
    t.finish()
    t.handler.handleStopAudio()
    await settle()

    expect(t.callbacks.onSpeechEnd).toHaveBeenCalledTimes(1)
  })

  it("ends a failed line once, and reports the failure", async () => {
    const t = setup()

    t.handler.enqueue(makeMessage("m1"), true)
    await settle()
    t.fail()
    await settle()

    expect(t.callbacks.onSpeechEnd).toHaveBeenCalledTimes(1)
    expect(t.callbacks.onError).toHaveBeenCalledTimes(1)
  })

  it("ends a stopped line once, as the stop's own, and reports no failure", async () => {
    const t = setup()

    t.handler.enqueue(makeMessage("m1"), true)
    await settle()
    t.handler.handleStopAudio()
    await settle()

    expect(t.callbacks.onSpeechEnd).toHaveBeenCalledTimes(1)
    expect(t.callbacks.onError).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// REPLAY
// ═══════════════════════════════════════════════════════════════════════════

describe("TTSEffectHandler - a replay", () => {
  it("replaces the line in hand and the queue, and plays at once", async () => {
    const t = setup()

    t.handler.enqueue(makeMessage("m1"), true)
    t.handler.enqueue(makeMessage("m2"), true)
    await settle()
    const replay = t.handler.speakManually(makeMessage("manual"))
    await settle()
    expect(t.said).toEqual(["content-m1", "content-manual"])

    t.finish()
    await replay
    await settle()
    // A replay is not auto-play: no completion. And m2, dropped, never plays.
    expect(t.callbacks.onMessageComplete).not.toHaveBeenCalled()
    expect(t.said).toEqual(["content-m1", "content-manual"])
  })

  it("clears the message's dedup, so a later auto trigger plays it again", async () => {
    const t = setup()
    const msg = makeMessage("m1")

    t.handler.enqueue(msg, true)
    await settle()
    t.finish()
    await settle()
    const replay = t.handler.speakManually(msg)
    await settle()
    t.finish()
    await replay
    t.handler.enqueue(msg, true)
    await settle()

    expect(t.said).toHaveLength(3)
  })

  it("ends the replay itself, whatever became of the line it replaced", async () => {
    const t = setup()
    const msg = makeMessage("m1")

    t.handler.enqueue(msg, true)
    await settle()
    const replay = t.handler.speakManually(msg)
    await settle()
    expect(t.handler.isSpeaking()).toBe(true)

    t.finish()
    await replay
    expect(t.callbacks.onSpeechEnd).toHaveBeenCalledTimes(1)
    // The cut-off auto line was never heard: no completion.
    expect(t.callbacks.onMessageComplete).not.toHaveBeenCalled()
    expect(t.handler.isSpeaking()).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// MUTE
// ═══════════════════════════════════════════════════════════════════════════

describe("TTSEffectHandler - a lesson line muted waits for unmute", () => {
  it("does not mark a refused line spoken, and says it, then the rest, on unmute", async () => {
    const t = setup()

    t.manager.setMuted(true)
    t.handler.enqueue(makeMessage("m1"), true)
    t.handler.enqueue(makeMessage("m2"), true)
    await settle()
    expect(t.said).toEqual([])
    expect(t.callbacks.onMessageComplete).not.toHaveBeenCalled()

    t.manager.setMuted(false)
    await settle()
    expect(t.said).toEqual(["content-m1"])
    t.finish()
    await settle()
    expect(t.callbacks.onMessageComplete).toHaveBeenCalledWith("m1")
    expect(t.said).toEqual(["content-m1", "content-m2"])
  })

  it("holds a line cut off by muting, reported as stopped, not ended", async () => {
    const t = setup()

    t.handler.enqueue(makeMessage("m1"), true)
    await settle()
    t.manager.setMuted(true)
    await settle()

    expect(t.callbacks.onSpeechStopped).toHaveBeenCalledWith("m1")
    expect(t.callbacks.onSpeechEnd).not.toHaveBeenCalled()
    expect(t.handler.isSpeaking()).toBe(false)

    t.manager.setMuted(false)
    await settle()
    expect(t.said).toEqual(["content-m1", "content-m1"])
  })

  it("clears 'speaking' for the line a replay replaces, though the replay never starts", async () => {
    const t = createSession("later")
    const onSpeechStopped = vi.fn()
    let speaking = false
    const handler = createTTSEffectHandler({
      speaker: t.manager.speakerFor("topik"),
      componentId: "c1",
      machine: fakeMachine,
      onSpeechStart: () => {
        speaking = true
      },
      onSpeechStopped: (id) => {
        speaking = false
        onSpeechStopped(id)
      },
    })

    handler.enqueue(makeMessage("m1"), true)
    await settle()
    t.start()
    expect(speaking).toBe(true)
    void handler.speakManually(makeMessage("m2"))
    await settle()
    // Muted while the replay's audio is still on its way.
    t.manager.setMuted(true)
    await settle()

    expect(onSpeechStopped).toHaveBeenCalledWith("m1")
    expect(speaking).toBe(false)
  })

  it("does not hold a replay muted mid-speech: it stops, and can be pressed again", async () => {
    const t = setup()

    void t.handler.speakManually(makeMessage("m1"))
    await settle()
    t.manager.setMuted(true)
    await settle()
    expect(t.callbacks.onSpeechStopped).toHaveBeenCalledWith("m1")

    // Held, it would play ahead of lesson lines queued while muted, and
    // each would advance the lesson.
    t.manager.setMuted(false)
    await settle()
    expect(t.said).toEqual(["content-m1"])
    expect(t.callbacks.onSpeechEnd).not.toHaveBeenCalled()
  })

  it("ignores a replay pressed while muted, and keeps the held lesson line", async () => {
    const t = setup()

    t.manager.setMuted(true)
    t.handler.enqueue(makeMessage("m2"), true)
    await settle()
    await t.handler.speakManually(makeMessage("m1"))

    t.manager.setMuted(false)
    await settle()
    expect(t.said).toEqual(["content-m2"])
    t.finish()
    await settle()
    expect(t.callbacks.onSpeechEnd).toHaveBeenCalledWith("m2")
  })

  it("ends the held line when the learner stops, and does not say it", async () => {
    const t = setup()

    t.manager.setMuted(true)
    t.handler.enqueue(makeMessage("m1"), true)
    await settle()
    t.handler.handleStopAudio()

    expect(t.callbacks.onSpeechEnd).toHaveBeenCalledTimes(1)
    expect(t.callbacks.onMessageComplete).toHaveBeenCalledWith("m1")
    t.manager.setMuted(false)
    await settle()
    expect(t.said).toEqual([])
  })

  it("drops a held line on destroy without ending it, and stops listening", async () => {
    const t = setup()

    t.manager.setMuted(true)
    t.handler.enqueue(makeMessage("m1"), true)
    await settle()
    t.handler.destroy()

    // Ending it would advance the session's lesson past a line never heard.
    expect(t.callbacks.onSpeechEnd).not.toHaveBeenCalled()
    t.manager.setMuted(false)
    await settle()
    expect(t.said).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// ANOTHER APPLET ON THE PAGE
// ═══════════════════════════════════════════════════════════════════════════

describe("TTSEffectHandler - another applet on the page speaks", () => {
  it("lets a tapped word interrupt a lesson line, which plays again after it and ends once", async () => {
    const t = setup()
    const words = t.manager.speakerFor("honeycomb")

    t.handler.enqueue(makeMessage("m1"), true)
    await settle()
    void words.say("사과", { language: "korean", urgency: "now" })
    await settle()

    // Not playing meanwhile, and not ended: the lesson waits for it.
    expect(t.handler.isSpeaking()).toBe(false)
    expect(t.callbacks.onSpeechStopped).toHaveBeenCalledWith("m1")
    expect(t.callbacks.onSpeechEnd).not.toHaveBeenCalled()

    t.finish()
    await settle()
    expect(t.said).toEqual(["content-m1", "사과", "content-m1"])
    expect(t.handler.isSpeaking()).toBe(true)
    t.finish()
    await settle()
    expect(t.callbacks.onSpeechEnd).toHaveBeenCalledTimes(1)
    expect(t.callbacks.onMessageComplete).toHaveBeenCalledWith("m1")
  })

  it("is not stopped by another applet's stop", async () => {
    const t = setup()

    t.handler.enqueue(makeMessage("m1"), true)
    await settle()
    t.manager.speakerFor("honeycomb").stop()
    await settle()
    expect(t.handler.isSpeaking()).toBe(true)

    t.finish()
    await settle()
    expect(t.callbacks.onSpeechEnd).toHaveBeenCalledWith("m1")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// STOP AND LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════

describe("TTSEffectHandler - handleStopAudio", () => {
  it("stops the line playing, ends it, and drops the rest of the queue", async () => {
    const t = setup()

    t.handler.enqueue(makeMessage("m1"), true)
    t.handler.enqueue(makeMessage("m2"), true)
    await settle()
    expect(t.handler.getCurrentMessageId()).toBe("m1")

    t.handler.handleStopAudio()
    await settle()

    expect(t.handler.isSpeaking()).toBe(false)
    expect(t.handler.getCurrentMessageId()).toBeNull()
    expect(t.callbacks.onSpeechEnd).toHaveBeenCalledWith("m1")
    expect(t.playing).toBeNull()
    expect(t.said).toEqual(["content-m1"])
  })

  it("is a no-op when nothing is in hand", () => {
    const t = setup()

    t.handler.handleStopAudio()
    expect(t.callbacks.onSpeechEnd).not.toHaveBeenCalled()
  })
})

describe("TTSEffectHandler - lifecycle", () => {
  it("destroy stops what it says without ending it, and clears dedup", async () => {
    const t = setup()
    const msg = makeMessage("m1")

    t.handler.enqueue(msg, true)
    await settle()
    t.finish()
    await settle()
    t.handler.enqueue(makeMessage("m2"), true)
    await settle()
    t.handler.destroy()
    await settle()
    expect(t.callbacks.onSpeechEnd).toHaveBeenCalledTimes(1)
    expect(t.playing).toBeNull()

    // Dedup was cleared, so the same id plays again.
    t.handler.enqueue(msg, true)
    await settle()
    expect(t.said).toEqual(["content-m1", "content-m2", "content-m1"])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// EVERY INTERLEAVING
// ═══════════════════════════════════════════════════════════════════════════

const REPLAY_TEXT = "replayed by the learner"
const WORD_TEXT = "a word another applet says"

const EVENTS = [
  "auto m1",
  "auto m2",
  "replay m1",
  "stop",
  "mute",
  "unmute",
  "line ends",
  "line fails",
  "another applet says a word",
  "another applet stops",
  "the voice starts",
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
 * Runs `events` against the real session, checking after each one that
 * what React would show as speaking is what the handler is doing and what
 * the device is saying, that no line is complete without having ended, and
 * that a replay plays when it is pressed or not at all. Then it unmutes,
 * lets every line end, and checks the queue still speaks a new line.
 */
async function runInterleaving(
  events: ReadonlyArray<Event>
): Promise<string | null> {
  // A hosted voice: a line is handed over, then starts when its audio
  // arrives, so anything can happen in between.
  const session = createSession("later")
  const words = session.manager.speakerFor("honeycomb")
  let showsSpeaking = false
  const ended = new Map<string, number>()
  const completed = new Map<string, number>()
  const count = (tally: Map<string, number>, id: string): void => {
    tally.set(id, (tally.get(id) ?? 0) + 1)
  }
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  const handler = createTTSEffectHandler({
    speaker: session.manager.speakerFor("topik"),
    componentId: "c1",
    machine: fakeMachine,
    onSpeechStart: () => {
      showsSpeaking = true
    },
    onSpeechEnd: (id) => {
      showsSpeaking = false
      count(ended, id)
    },
    onSpeechStopped: () => {
      showsSpeaking = false
    },
    onMessageComplete: (id) => {
      count(completed, id)
    },
  })

  const act: Readonly<Record<Event, () => void>> = {
    "auto m1": () => handler.enqueue(makeMessage("m1"), true),
    "auto m2": () => handler.enqueue(makeMessage("m2"), true),
    // The same message as the lesson's m1, told apart by its text.
    "replay m1": () =>
      void handler.speakManually(makeMessage("m1", REPLAY_TEXT)),
    stop: () => handler.handleStopAudio(),
    mute: () => session.manager.setMuted(true),
    unmute: () => session.manager.setMuted(false),
    "line ends": () => session.finish(),
    "line fails": () => session.fail(),
    "another applet says a word": () =>
      void words.say(WORD_TEXT, { language: "korean", urgency: "now" }),
    "another applet stops": () => words.stop(),
    "the voice starts": () => session.start(),
  }

  const ours = (): boolean =>
    session.playing !== null && session.playing !== WORD_TEXT

  const check = (step: string): string | null => {
    if (showsSpeaking !== handler.isSpeaking()) {
      return `${step}: shows speaking=${String(showsSpeaking)}, handler=${String(handler.isSpeaking())}`
    }
    if (handler.isSpeaking() !== ours()) {
      return `${step}: handler speaking=${String(handler.isSpeaking())}, saying ours=${String(ours())}`
    }
    // The lesson advances on a line's end; a line complete without one
    // leaves the lesson waiting on it, and dedup refuses to say it again.
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
    await settle()
    const late = event === "replay m1" ? null : replayedLate(event, saidBefore)
    if (late) return late
    const problem = check(event)
    if (problem) return problem
  }
  const saidBeforeDrain = session.said.length

  session.manager.setMuted(false)
  await settle()
  for (let line = 0; line < 10; line += 1) {
    session.start()
    if (session.playing === null) break
    session.finish()
    await settle()
  }
  const drained = replayedLate("drained", saidBeforeDrain) ?? check("drained")
  if (drained) return drained

  handler.enqueue(makeMessage("fresh"), true)
  await settle()
  session.start()
  if (session.playing !== "content-fresh") {
    return "drained: a new line was not spoken"
  }
  handler.destroy()
  session.manager.dispose()
  return null
}

describe("TTSEffectHandler - every interleaving of up to four events", () => {
  it("keeps 'speaking' true to the session, ends every completed line, and never wedges", async () => {
    const failures: Array<string> = []
    for (let length = 1; length <= 4; length += 1) {
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
