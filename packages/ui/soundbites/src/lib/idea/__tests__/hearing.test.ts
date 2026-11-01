/** @vitest-environment node */
import { inMemoryStorage } from "@some-ui/core-utils"
import type { TakeKit } from "@some-ui/voice-capture"
import { microphoneOwner, takeKit } from "@some-ui/voice-capture"
import type { KeepScript, MicScript } from "@some-ui/voice-capture/testing"
import {
  memoryKeep,
  simulatedMicrophone,
  SPEAKING,
} from "@some-ui/voice-capture/testing"
import type {
  HeardAnswer,
  HearingState,
  IdeaTakes,
} from "@soundbites/lib/idea/hearing"
import {
  HEARING_TIMING,
  homeHearing,
  initialHearing,
  stepHearing,
} from "@soundbites/lib/idea/hearing"
import type { IdeaState } from "@soundbites/lib/idea/machine"
import type { IdeaListener, Listening } from "@soundbites/lib/idea/runtime"
import { createIdeaCapture, NO_LISTENER } from "@soundbites/lib/idea/runtime"
import { keptIdeaStore } from "@soundbites/lib/idea/store"
import { afterEach, describe, expect, it, vi } from "vitest"

const NOW = Date.UTC(2026, 10, 1, 9)
const LIMITS = { minMs: 500, maxMs: 60_000 }
const { pollMs, deadlineMs } = HEARING_TIMING

/**
 * The shared take kit as the idea's take port sees it, home holding what
 * `held` says. www's own port over its desk (`lib/idea-takes`) is run
 * through `homeHearing` in that workspace's test.
 */
function kitTakes(
  kit: TakeKit,
  full: boolean,
  held: (id: string) => boolean
): IdeaTakes {
  return {
    getSnapshot: (): ReturnType<IdeaTakes["getSnapshot"]> => {
      const { take, ended, blocked } = kit.getSnapshot()
      return {
        take: take.kind,
        ended:
          ended === null
            ? null
            : {
                seq: ended.seq,
                ending: ended.ending,
                id: ended.id,
                reason: blocked ?? ended.reason,
                unheard: ended.unheard,
              },
        full,
      }
    },
    subscribe: kit.subscribe,
    start: kit.start,
    stop: kit.stop,
    leave: kit.leave,
    held,
  }
}

/** A page whose visibility the test sets. */
function page(): {
  onVisibility: (listener: (hidden: boolean) => void) => () => void
  hide: (hidden: boolean) => void
} {
  let hidden = false
  const watchers = new Set<(hidden: boolean) => void>()
  return {
    onVisibility: (listener): (() => void) => {
      watchers.add(listener)
      listener(hidden)
      return () => {
        watchers.delete(listener)
      }
    },
    hide: (next): void => {
      hidden = next
      for (const watcher of [...watchers]) watcher(next)
    },
  }
}

/**
 * New idea over the simulated microphone, kept in memory, with a fake home
 * that answers each ask with the next of `answers` (the last, once they run
 * out).
 */
function capture(options: {
  answers: ReadonlyArray<HeardAnswer>
  mic?: ReadonlyArray<MicScript>
  keeps?: ReadonlyArray<KeepScript>
  full?: boolean
  /** How long home takes to answer each ask. */
  answerMs?: number
  /** The screen's listener made from home's hearing. */
  around?: (home: IdeaListener) => IdeaListener
}): {
  /** The takes this phone has read back that home holds. */
  homeHolds: Set<string>
  /** How often the screen asked whether it can listen. */
  voiceChecks: () => number
  state: () => IdeaState
  dispatch: ReturnType<typeof createIdeaCapture>["dispatch"]
  asked: () => ReadonlyArray<string>
  kept: () => ReadonlyArray<string>
  hide: (hidden: boolean) => void
  detach: () => void
} {
  vi.useFakeTimers({ now: NOW })
  const now = (): number => Date.now()
  const mic = simulatedMicrophone({ now })
  mic.script(...(options.mic ?? []))
  const keep = memoryKeep(options.keeps ?? [])
  const kit = takeKit(
    {
      startRecording: mic.startRecording,
      now,
      keep: keep.keep,
      owner: microphoneOwner(),
    },
    LIMITS
  )
  const asked: Array<string> = []
  const queue = [...options.answers]
  const visible = page()
  const homeHolds = new Set<string>()
  let voiceChecks = 0
  const hearing: IdeaListener = homeHearing({
    takes: kitTakes(kit, options.full ?? false, (id) => homeHolds.has(id)),
    heard: (id) => {
      asked.push(id)
      const answer =
        (queue.length > 1 ? queue.shift() : queue[0]) ??
        ({ kind: "notHeld" } as const)
      const { answerMs } = options
      return answerMs === undefined
        ? Promise.resolve(answer)
        : new Promise((resolve) => setTimeout(() => resolve(answer), answerMs))
    },
    now,
    onVisibility: visible.onVisibility,
  })
  const around = options.around?.(hearing) ?? hearing
  const listener: IdeaListener = {
    ...around,
    available: () => {
      voiceChecks += 1
      return around.available()
    },
  }
  const storage = inMemoryStorage()
  const runtime = createIdeaCapture({
    store: keptIdeaStore(() => storage),
    listener,
    now,
    newId: () => "idea-1",
    onVisibility: visible.onVisibility,
  })
  const detach = runtime.attach()
  return {
    homeHolds,
    voiceChecks: () => voiceChecks,
    state: runtime.getSnapshot,
    dispatch: runtime.dispatch,
    asked: () => asked,
    kept: keep.audio,
    hide: visible.hide,
    detach,
  }
}

function phaseOf(state: IdeaState): string {
  const { screen } = state
  return screen.kind === "ask" ? screen.phase.kind : screen.kind
}

/** Until the take that was stopped has ended, a millisecond at a time. */
async function untilEnded(run: ReturnType<typeof capture>): Promise<void> {
  for (let ms = 0; ms < 1_000 && phaseOf(run.state()) === "finishing"; ms++) {
    await vi.advanceTimersByTimeAsync(1)
  }
}

/** Says an answer: tap, two seconds of talking, tap again, and it's kept. */
async function say(run: ReturnType<typeof capture>): Promise<void> {
  await vi.advanceTimersByTimeAsync(0)
  run.dispatch({ type: "talk" })
  await vi.advanceTimersByTimeAsync(2_000)
  run.dispatch({ type: "stopTalking" })
  await untilEnded(run)
}

afterEach(() => {
  vi.useRealTimers()
})

describe("IH1: an answer said as a take, its words from home", () => {
  it("records through the take kit, says home is hearing it, and gives home's words to That's right", async () => {
    const run = capture({
      answers: [
        { kind: "notHeld" },
        { kind: "notYet" },
        { kind: "heard", text: "a short about the week 8 picks" },
      ],
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(run.state().voice).toBe("ready")
    run.dispatch({ type: "talk" })
    await vi.advanceTimersByTimeAsync(0)
    expect(run.state().screen).toMatchObject({
      phase: { kind: "listening", ready: true },
    })
    await vi.advanceTimersByTimeAsync(2_000)
    run.dispatch({ type: "stopTalking" })
    await untilEnded(run)
    expect(phaseOf(run.state())).toBe("hearing")
    expect(run.kept()).toEqual(["take-1"])
    // The first ask waits a poll: the take is still on its way home.
    expect(run.asked()).toEqual([])
    await vi.advanceTimersByTimeAsync(3 * pollMs)
    expect(run.asked()).toEqual(["take-1", "take-1", "take-1"])
    expect(run.state().screen).toMatchObject({
      phase: { kind: "heard", words: "a short about the week 8 picks" },
    })
    run.dispatch({ type: "right" })
    expect(run.state().idea?.answers[0]?.versions).toEqual([
      expect.objectContaining({
        how: "heard",
        words: "a short about the week 8 picks",
      }),
    ])
    expect(run.state().took).toBe(true)
    // Nothing more is asked once the words came.
    await vi.advanceTimersByTimeAsync(10 * pollMs)
    expect(run.asked()).toHaveLength(3)
  })

  it.each([
    // Home said it holds the take.
    [{ kind: "notYet" } as const, false, "keptOnHome"],
    // Neither home nor the phone's read-back says home holds it.
    [{ kind: "notHeld" } as const, false, "keptOnPhone"],
    // The link was busy at every ask.
    [{ kind: "busy" } as const, false, "keptOnPhone"],
    [{ kind: "busy" } as const, true, "keptOnHome"],
  ])(
    "keeps the take and takes typed words once the deadline passes (home answering %o, read back as held: %s)",
    async (answer, held, notice) => {
      const run = capture({ answers: [answer] })
      if (held) run.homeHolds.add("take-1")
      await say(run)
      await vi.advanceTimersByTimeAsync(deadlineMs - pollMs)
      expect(phaseOf(run.state())).toBe("hearing")
      await vi.advanceTimersByTimeAsync(pollMs)
      expect(phaseOf(run.state())).toBe("typing")
      expect(run.state().notice).toBe(notice)
      expect(run.kept()).toEqual(["take-1"])
      const asks = run.asked().length
      expect(asks).toBe(deadlineMs / pollMs - 1)
      await vi.advanceTimersByTimeAsync(deadlineMs)
      expect(run.asked()).toHaveLength(asks)
    }
  )

  it("stops waiting once the phone has read back that home holds a take home knows no words for", async () => {
    // Home serves no words (a 404 that never stops), and the voice lane
    // delivers the note between the second and third asks.
    const run = capture({ answers: [{ kind: "notHeld" }] })
    await say(run)
    await vi.advanceTimersByTimeAsync(2 * pollMs)
    expect(phaseOf(run.state())).toBe("hearing")
    run.homeHolds.add("take-1")
    await vi.advanceTimersByTimeAsync(pollMs)
    expect(phaseOf(run.state())).toBe("typing")
    expect(run.state().notice).toBe("homeNoWords")
    expect(run.asked()).toHaveLength(3)
    await vi.advanceTimersByTimeAsync(deadlineMs)
    expect(run.asked()).toHaveLength(3)
  })

  it.each([
    [false, "awayOnPhone"],
    [true, "awayOnHome"],
  ] as const)(
    "stops waiting at the first ask home doesn't answer, saying where the take is (read back as held: %s)",
    async (held, notice) => {
      const run = capture({ answers: [{ kind: "unreachable" }] })
      if (held) run.homeHolds.add("take-1")
      await say(run)
      expect(run.voiceChecks()).toBe(1)
      await vi.advanceTimersByTimeAsync(pollMs)
      expect(phaseOf(run.state())).toBe("typing")
      expect(run.state().notice).toBe(notice)
      // What can listen now is asked again (www's `lib/idea-hearing` skips
      // home for a while once it didn't answer).
      expect(run.voiceChecks()).toBe(2)
      expect(run.state().took).toBe(true)
      expect(run.kept()).toEqual(["take-1"])
      await vi.advanceTimersByTimeAsync(deadlineMs)
      expect(run.asked()).toHaveLength(1)
    }
  )

  it("ends the wait at the deadline while an ask is still out, and drops its late words", async () => {
    // The first ask goes a poll after the take is kept, and home answers
    // it only well after the deadline.
    const run = capture({
      answers: [{ kind: "heard", text: "too late" }],
      answerMs: deadlineMs,
    })
    await say(run)
    await vi.advanceTimersByTimeAsync(deadlineMs - 1)
    expect(phaseOf(run.state())).toBe("hearing")
    await vi.advanceTimersByTimeAsync(1)
    expect(phaseOf(run.state())).toBe("typing")
    expect(run.state().notice).toBe("keptOnPhone")
    await vi.advanceTimersByTimeAsync(deadlineMs)
    expect(phaseOf(run.state())).toBe("typing")
    expect(run.asked()).toHaveLength(1)
  })

  it("offers Say it again on the same screen once home is no longer skipped", async () => {
    // As www's `lib/idea-hearing` does on a phone with no recognizer: for
    // a while after home didn't answer, nothing can listen.
    const AWAY = 5 * 60_000
    let until = Number.NEGATIVE_INFINITY
    const run = capture({
      answers: [{ kind: "unreachable" }, { kind: "heard", text: "back" }],
      around: (home): IdeaListener => ({
        available: () => Promise.resolve(Date.now() >= until),
        listen: (onWords, onReady, take): Listening => {
          if (Date.now() < until) return NO_LISTENER.listen(onWords, onReady)
          const listening = home.listen(onWords, onReady, take)
          return {
            ...listening,
            done: listening.done.then((result) => {
              if (result.kind === "kept" && result.why === "away") {
                until = Date.now() + AWAY
              }
              return result
            }),
          }
        },
      }),
    })
    await say(run)
    await vi.advanceTimersByTimeAsync(pollMs)
    expect(run.state().notice).toBe("awayOnPhone")
    expect(run.state().voice).toBe("unavailable")
    run.dispatch({ type: "draft", text: "typed idea" })
    run.dispatch({ type: "save" })
    await vi.advanceTimersByTimeAsync(0)
    expect(phaseOf(run.state())).toBe("typing")
    await vi.advanceTimersByTimeAsync(AWAY)
    run.dispatch({ type: "draft", text: "typed too" })
    run.dispatch({ type: "save" })
    await vi.advanceTimersByTimeAsync(0)
    expect(run.state().voice).toBe("ready")
    expect(phaseOf(run.state())).toBe("idle")
    await say(run)
    await vi.advanceTimersByTimeAsync(pollMs)
    expect(run.state().screen).toMatchObject({
      phase: { kind: "heard", words: "back" },
    })
  })

  it("asks again at the next poll when the link was busy", async () => {
    const run = capture({
      answers: [{ kind: "busy" }, { kind: "heard", text: "picks" }],
    })
    await say(run)
    await vi.advanceTimersByTimeAsync(pollMs)
    expect(phaseOf(run.state())).toBe("hearing")
    await vi.advanceTimersByTimeAsync(pollMs)
    expect(run.state().screen).toMatchObject({
      phase: { kind: "heard", words: "picks" },
    })
    expect(run.asked()).toHaveLength(2)
  })

  it("keeps a silent take and says at once it heard nothing, asking home nothing", async () => {
    const run = capture({
      answers: [{ kind: "notYet" }],
      mic: [{ ...SPEAKING, level: 0 }],
    })
    await say(run)
    expect(phaseOf(run.state())).toBe("idle")
    expect(run.state().notice).toBe("notHeard")
    expect(run.kept()).toEqual(["take-1"])
    expect(run.state().took).toBe(true)
    await vi.advanceTimersByTimeAsync(deadlineMs)
    expect(run.asked()).toEqual([])
  })

  it("counts a take let go while recording: Type instead keeps it, and the idea says so", async () => {
    const run = capture({ answers: [{ kind: "notYet" }] })
    await vi.advanceTimersByTimeAsync(0)
    run.dispatch({ type: "talk" })
    await vi.advanceTimersByTimeAsync(2_000)
    run.dispatch({ type: "type" })
    expect(phaseOf(run.state())).toBe("typing")
    await vi.advanceTimersByTimeAsync(1_000)
    expect(run.kept()).toEqual(["take-1"])
    expect(run.state().took).toBe(true)
    await vi.advanceTimersByTimeAsync(deadlineMs)
    expect(run.asked()).toEqual([])
  })

  it("asks home nothing while the page is hidden, and asks at once when it shows again", async () => {
    const run = capture({
      answers: [
        { kind: "notYet" },
        { kind: "notYet" },
        { kind: "heard", text: "hi" },
      ],
    })
    await say(run)
    await vi.advanceTimersByTimeAsync(pollMs)
    expect(run.asked()).toHaveLength(1)
    run.hide(true)
    await vi.advanceTimersByTimeAsync(20 * pollMs)
    expect(run.asked()).toHaveLength(1)
    expect(phaseOf(run.state())).toBe("hearing")
    run.hide(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(run.asked()).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(pollMs)
    expect(run.state().screen).toMatchObject({
      phase: { kind: "heard", words: "hi" },
    })
  })

  it("ends in typing, the take kept on home, when the page shows again after the deadline", async () => {
    const run = capture({ answers: [{ kind: "notYet" }] })
    await say(run)
    await vi.advanceTimersByTimeAsync(pollMs)
    run.hide(true)
    await vi.advanceTimersByTimeAsync(deadlineMs)
    expect(phaseOf(run.state())).toBe("hearing")
    run.hide(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(phaseOf(run.state())).toBe("typing")
    expect(run.state().notice).toBe("keptOnHome")
    expect(run.asked()).toHaveLength(1)
  })

  it("stops asking once Type instead lets the hearing go, and keeps the take", async () => {
    const run = capture({ answers: [{ kind: "notYet" }] })
    await say(run)
    run.dispatch({ type: "type" })
    expect(phaseOf(run.state())).toBe("typing")
    await vi.advanceTimersByTimeAsync(deadlineMs)
    expect(run.asked()).toEqual([])
    expect(run.kept()).toEqual(["take-1"])
  })

  it("keeps a take still recording when the screen goes", async () => {
    const run = capture({ answers: [{ kind: "notYet" }] })
    await vi.advanceTimersByTimeAsync(0)
    run.dispatch({ type: "talk" })
    await vi.advanceTimersByTimeAsync(2_000)
    run.detach()
    await vi.advanceTimersByTimeAsync(deadlineMs)
    expect(run.kept()).toEqual(["take-1"])
    expect(run.asked()).toEqual([])
  })

  it("says nothing was heard when home heard nothing", async () => {
    const run = capture({ answers: [{ kind: "heard", text: "  " }] })
    await say(run)
    await vi.advanceTimersByTimeAsync(pollMs)
    expect(phaseOf(run.state())).toBe("idle")
    expect(run.state().notice).toBe("notHeard")
  })

  it.each([
    [
      "the microphone refuses",
      {
        mic: [
          { ...SPEAKING, open: { kind: "refuse", reason: "denied", ms: 0 } },
        ],
      },
      { refused: "denied" },
    ],
    [
      "keeping it fails",
      { keeps: [{ outcome: "failed", ms: 0 }] },
      "takeNotKept",
    ],
    ["the phone has no room", { full: true }, "takeFull"],
  ] as const)(
    "says so, asking home nothing, when %s",
    async (_, given, notice) => {
      const run = capture({ answers: [{ kind: "notYet" }], ...given })
      await say(run)
      expect(phaseOf(run.state())).toBe("idle")
      expect(run.state().notice).toEqual(notice)
      await vi.advanceTimersByTimeAsync(deadlineMs)
      expect(run.asked()).toEqual([])
    }
  )

  it("says nothing was heard for a take too short to keep", async () => {
    const run = capture({ answers: [{ kind: "notYet" }] })
    await vi.advanceTimersByTimeAsync(0)
    run.dispatch({ type: "talk" })
    await vi.advanceTimersByTimeAsync(100)
    run.dispatch({ type: "stopTalking" })
    await untilEnded(run)
    expect(phaseOf(run.state())).toBe("idle")
    expect(run.state().notice).toBe("notHeard")
    expect(run.kept()).toEqual([])
  })
})

describe("stepHearing", () => {
  const kept = (state: HearingState): HearingState =>
    stepHearing(
      state,
      {
        type: "ended",
        now: NOW,
        ending: "kept",
        id: "t1",
        reason: null,
        unheard: false,
      },
      HEARING_TIMING
    ).state

  it("ignores an answer once let go, and a second answer for one ask", () => {
    const asking = stepHearing(
      kept(initialHearing),
      { type: "tick", now: NOW + pollMs, holds: false },
      HEARING_TIMING
    )
    expect(asking.effects[0]).toEqual({ type: "ask", id: "t1" })
    const cancelled = stepHearing(
      asking.state,
      { type: "cancel" },
      HEARING_TIMING
    )
    expect(
      stepHearing(
        cancelled.state,
        {
          type: "answered",
          now: NOW + pollMs,
          holds: false,
          answer: { kind: "heard", text: "late" },
        },
        HEARING_TIMING
      ).effects
    ).toEqual([])
    const answered = stepHearing(
      asking.state,
      {
        type: "answered",
        now: NOW + pollMs,
        holds: false,
        answer: { kind: "notYet" },
      },
      HEARING_TIMING
    )
    expect(
      stepHearing(
        answered.state,
        {
          type: "answered",
          now: NOW + pollMs,
          holds: false,
          answer: { kind: "heard", text: "twice" },
        },
        HEARING_TIMING
      ).effects
    ).toEqual([])
  })

  it("takes no words that come at or after the deadline", () => {
    const asking = stepHearing(
      kept(initialHearing),
      { type: "tick", now: NOW + pollMs, holds: false },
      HEARING_TIMING
    )
    expect(asking.effects).toEqual([
      { type: "ask", id: "t1" },
      { type: "wait", ms: deadlineMs - pollMs },
    ])
    expect(
      stepHearing(
        asking.state,
        {
          type: "answered",
          now: NOW + deadlineMs,
          holds: false,
          answer: { kind: "heard", text: "late" },
        },
        HEARING_TIMING
      ).effects
    ).toEqual([
      { type: "clearWait" },
      { type: "settle", result: { kind: "kept", on: "home", why: "late" } },
    ])
  })

  it("never has two asks out: a tick while one is out does nothing", () => {
    const asking = stepHearing(
      kept(initialHearing),
      { type: "tick", now: NOW + pollMs, holds: false },
      HEARING_TIMING
    )
    expect(
      stepHearing(
        asking.state,
        { type: "tick", now: NOW + 2 * pollMs, holds: false },
        HEARING_TIMING
      ).effects
    ).toEqual([])
    expect(
      stepHearing(
        stepHearing(asking.state, { type: "hidden" }, HEARING_TIMING).state,
        { type: "shown", now: NOW + 2 * pollMs, holds: false },
        HEARING_TIMING
      ).effects
      // No second ask: only the deadline timer, which hiding cleared.
    ).toEqual([{ type: "wait", ms: deadlineMs - 2 * pollMs }])
  })
})
