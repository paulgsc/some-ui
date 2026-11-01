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
import type { IdeaListener } from "@soundbites/lib/idea/runtime"
import { createIdeaCapture } from "@soundbites/lib/idea/runtime"
import { keptIdeaStore } from "@soundbites/lib/idea/store"
import { afterEach, describe, expect, it, vi } from "vitest"

const NOW = Date.UTC(2026, 10, 1, 9)
const LIMITS = { minMs: 500, maxMs: 60_000 }
const { pollMs, deadlineMs } = HEARING_TIMING

/** The shared take kit as the idea's take port sees it. */
function kitTakes(kit: TakeKit, full = false): IdeaTakes {
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
              },
        full,
      }
    },
    subscribe: kit.subscribe,
    start: kit.start,
    stop: kit.stop,
    leave: kit.leave,
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
}): {
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
  const listener: IdeaListener = homeHearing({
    takes: kitTakes(kit, options.full),
    heard: (id) => {
      asked.push(id)
      const answer =
        (queue.length > 1 ? queue.shift() : queue[0]) ??
        ({ kind: "notHeld" } as const)
      return Promise.resolve(answer)
    },
    now,
    onVisibility: visible.onVisibility,
  })
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
    [{ kind: "notYet" } as const, "keptOnHome"],
    [{ kind: "notHeld" } as const, "keptOnPhone"],
    [{ kind: "unreachable" } as const, "keptOnPhone"],
  ])(
    "keeps the take and takes typed words once the deadline passes (home answering %o)",
    async (answer, notice) => {
      const run = capture({ answers: [answer] })
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
      { type: "ended", now: NOW, ending: "kept", id: "t1", reason: null },
      HEARING_TIMING
    ).state

  it("ignores an answer once let go, and a second answer for one ask", () => {
    const asking = stepHearing(
      kept(initialHearing),
      { type: "tick", now: NOW + pollMs },
      HEARING_TIMING
    )
    expect(asking.effects).toEqual([{ type: "ask", id: "t1" }])
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
          answer: { kind: "heard", text: "late" },
        },
        HEARING_TIMING
      ).effects
    ).toEqual([])
    const answered = stepHearing(
      asking.state,
      { type: "answered", now: NOW + pollMs, answer: { kind: "notYet" } },
      HEARING_TIMING
    )
    expect(
      stepHearing(
        answered.state,
        {
          type: "answered",
          now: NOW + pollMs,
          answer: { kind: "heard", text: "twice" },
        },
        HEARING_TIMING
      ).effects
    ).toEqual([])
  })

  it("never has two asks out: a tick while one is out does nothing", () => {
    const asking = stepHearing(
      kept(initialHearing),
      { type: "tick", now: NOW + pollMs },
      HEARING_TIMING
    )
    expect(
      stepHearing(
        asking.state,
        { type: "tick", now: NOW + 2 * pollMs },
        HEARING_TIMING
      ).effects
    ).toEqual([])
    expect(
      stepHearing(
        stepHearing(asking.state, { type: "hidden" }, HEARING_TIMING).state,
        { type: "shown", now: NOW + 2 * pollMs },
        HEARING_TIMING
      ).effects
    ).toEqual([])
  })
})
