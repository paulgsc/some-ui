import type { Speaker, SpeechOutcome } from "@some-ui/speech"
import type { LensAnswer } from "@topik/lib/topik/read-aloud/lens/items"
import {
  currentItem,
  currentOutcome,
} from "@topik/lib/topik/read-aloud/lens/machine"
import type { LensRecordEntry } from "@topik/lib/topik/read-aloud/lens/record"
import type {
  LensRuntime,
  LensSnapshot,
} from "@topik/lib/topik/read-aloud/lens/runtime"
import { createLensRuntime } from "@topik/lib/topik/read-aloud/lens/runtime"
import { REPO_SETS } from "@topik/lib/topik/read-aloud/repo-sets"
import { MAX_SCREEN_MS } from "@topik/lib/topik/read-aloud/timing"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type FakeSpeech = Speaker & { said: Array<string> }

/** Speech that says every line at once, ending it as `outcome`. */
function fakeSpeech(outcome: SpeechOutcome = { kind: "heard" }): FakeSpeech {
  const speech: FakeSpeech = {
    available: true,
    said: [],
    say: (text, options): Promise<SpeechOutcome> => {
      speech.said.push(text)
      options.onStart?.()
      return Promise.resolve(outcome)
    },
    stop: () => undefined,
    muted: false,
    subscribe: () => () => undefined,
    describe: () => ({
      platform: "browser",
      voice: null,
      availability: "available",
    }),
  }
  return speech
}

function harness(speech: Speaker): {
  runtime: LensRuntime
  last: () => LensSnapshot
  entries: Array<LensRecordEntry>
} {
  let snapshot: LensSnapshot | null = null
  const entries: Array<LensRecordEntry> = []
  let set = 0
  const runtime = createLensRuntime(
    {
      current: {
        deck: REPO_SETS,
        level: 1,
        speech,
        onExit: (): void => undefined,
        seedKey: (): string => `runtime-${(set += 1)}`,
        record: (entry): void => {
          entries.push(entry)
        },
      },
    },
    (next): void => {
      snapshot = next
    }
  )
  return {
    runtime,
    entries,
    last: (): LensSnapshot => {
      if (!snapshot) throw new Error("not rendered")
      return snapshot
    },
  }
}

const firstAnswer = (snapshot: LensSnapshot): LensAnswer =>
  currentItem(snapshot.state)?.shape.kind === "pick"
    ? { kind: "pick", candidate: 0 }
    : { kind: "fine" }

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("createLensRuntime", () => {
  it("speaks only cues and lines as authored, never a misform (Cor. 4.8 (ii))", () => {
    const speech = fakeSpeech()
    const { runtime, last } = harness(speech)
    runtime.begin()
    const allowed = new Set<string>()
    for (const item of last().state.items) {
      allowed.add(item.korean)
      if (item.cue) allowed.add(item.cue.korean)
    }
    while (last().state.phase.name !== "summary") {
      const { state } = last()
      const at = runtime.now()
      if (state.phase.name === "item") {
        runtime.hearCue()
        runtime.dispatch({ type: "answer", at, answer: firstAnswer(last()) })
      } else if (state.phase.name === "step-down") {
        runtime.dispatch({ type: "skip-probes", at })
      } else {
        runtime.hearLine()
        runtime.dispatch({ type: "next", at })
      }
    }
    expect(speech.said.length).toBeGreaterThan(0)
    for (const text of speech.said) expect(allowed).toContain(text)
  })

  it("shows a cue drawn to be heard once speaking it fails", async () => {
    const { runtime, last } = harness(fakeSpeech({ kind: "muted" }))
    runtime.begin()
    // Skip to an item with a cue.
    while (!currentItem(last().state)?.cue) {
      const at = runtime.now()
      runtime.dispatch({ type: "answer", at, answer: firstAnswer(last()) })
      if (last().state.phase.name === "step-down") {
        runtime.dispatch({ type: "skip-probes", at })
      }
      runtime.dispatch({ type: "next", at })
    }
    expect(last().cueRead).toBe(false)
    runtime.hearCue()
    await vi.advanceTimersByTimeAsync(0)
    expect(last().cueRead).toBe(true)
  })

  it("leaves no clock running once hidden or disposed", () => {
    const { runtime, last } = harness(fakeSpeech())
    runtime.begin()
    runtime.hide()
    vi.advanceTimersByTime(MAX_SCREEN_MS * 2)
    expect(currentOutcome(last().state)?.expired).toBe(false)
    runtime.show()
    runtime.dispose()
    vi.advanceTimersByTime(MAX_SCREEN_MS * 2)
    expect(currentOutcome(last().state)?.expired).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("records each answered item, its last write replacing the earlier, and nothing unanswered", () => {
    const { runtime, last, entries } = harness(fakeSpeech())
    runtime.begin()
    // Answered, then hidden before it closes: kept now, in case the app is.
    runtime.dispatch({
      type: "answer",
      at: runtime.now(),
      answer: firstAnswer(last()),
    })
    runtime.hide()
    runtime.show()
    expect(entries).toHaveLength(1)
    while (last().state.phase.name !== "summary") {
      const at = runtime.now()
      const { phase } = last().state
      if (phase.name === "item") {
        runtime.dispatch({ type: "answer", at, answer: firstAnswer(last()) })
      } else if (phase.name === "step-down") {
        runtime.dispatch({ type: "skip-probes", at })
      } else {
        runtime.dispatch({ type: "next", at })
      }
    }
    const items = new Set(entries.map((e) => `${e.line}@${e.shownAt}`))
    expect(items.size).toBe(last().state.items.length)
    expect(new Set(entries.map((e) => e.session)).size).toBe(1)
  })

  it("leaves an item's pauses out of its time to answer", () => {
    const { runtime, last, entries } = harness(fakeSpeech())
    runtime.begin()
    runtime.hide()
    vi.advanceTimersByTime(60_000)
    runtime.show()
    vi.advanceTimersByTime(2_000)
    runtime.dispatch({
      type: "answer",
      at: runtime.now(),
      answer: firstAnswer(last()),
    })
    if (last().state.phase.name === "step-down") {
      runtime.dispatch({ type: "skip-probes", at: runtime.now() })
    }
    runtime.dispatch({ type: "next", at: runtime.now() })
    expect(entries.at(-1)?.answerMs).toBe(2_000)
  })

  it("keeps a step-down a sitting cut off when the app is put away, then the item as it ends", () => {
    const { runtime, last, entries } = harness(fakeSpeech())
    runtime.begin()
    // On to the first miss that steps down.
    while (last().state.phase.name !== "step-down") {
      const at = runtime.now()
      if (last().state.phase.name === "item") {
        runtime.dispatch({ type: "answer", at, answer: firstAnswer(last()) })
      } else runtime.dispatch({ type: "next", at })
    }
    const cursor = last().state.cursor
    const before = entries.length
    // Held two minutes on screen, the sitting ends inside the step-down.
    runtime.hold()
    vi.advanceTimersByTime(MAX_SCREEN_MS)
    expect(last().state.phase.name).toBe("sitting-over")
    // The app put away there: the item is kept as it stands.
    runtime.hide()
    expect(entries.at(-1)?.stepDown?.end).toBe("left")
    runtime.show()
    runtime.dispatch({ type: "start-sitting", at: runtime.now() })
    expect(last().state).toMatchObject({ cursor, phase: { name: "step-down" } })
    runtime.dispatch({ type: "skip-probes", at: runtime.now() })
    runtime.dispatch({ type: "next", at: runtime.now() })
    const item = entries.at(-1)
    expect(item?.stepDown?.end).toBe("skipped")
    // Every write for it names the same showing: the store keeps the last.
    const writes = entries
      .slice(before)
      .filter((e) => e.line === item?.line && e.shownAt === item.shownAt)
    expect(writes.length).toBeGreaterThan(1)
  })

  it("records nothing across a remount before an answer, and keeps one session across sets", () => {
    const { runtime, last, entries } = harness(fakeSpeech())
    runtime.begin()
    runtime.dispose()
    runtime.begin()
    runtime.show()
    expect(entries).toEqual([])
    while (last().state.phase.name !== "summary") {
      const at = runtime.now()
      const { phase } = last().state
      if (phase.name === "item")
        runtime.dispatch({ type: "answer", at, answer: firstAnswer(last()) })
      else if (phase.name === "step-down")
        runtime.dispatch({ type: "skip-probes", at })
      else runtime.dispatch({ type: "next", at })
    }
    runtime.dispatch({ type: "next-set", at: runtime.now() })
    runtime.dispatch({
      type: "answer",
      at: runtime.now(),
      answer: firstAnswer(last()),
    })
    runtime.dispatch({ type: "next", at: runtime.now() })
    expect(new Set(entries.map((e) => e.session)).size).toBe(1)
  })

  it("records a cue it could not voice as read", async () => {
    const { runtime, last, entries } = harness(fakeSpeech({ kind: "muted" }))
    runtime.begin()
    while (last().state.phase.name !== "summary") {
      await vi.advanceTimersByTimeAsync(0)
      const at = runtime.now()
      const { phase } = last().state
      if (phase.name === "item")
        runtime.dispatch({ type: "answer", at, answer: firstAnswer(last()) })
      else if (phase.name === "step-down")
        runtime.dispatch({ type: "skip-probes", at })
      else runtime.dispatch({ type: "next", at })
    }
    const cued = entries.filter((e) => e.cue !== null)
    expect(cued.length).toBeGreaterThan(0)
    for (const entry of cued) expect(entry.cue).toBe("glyph")
  })
})
