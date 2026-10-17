import type { Speaker, SpeechOutcome } from "@some-ui/speech"
import type { LensAnswer } from "@topik/lib/topik/read-aloud/lens/items"
import {
  currentItem,
  currentOutcome,
} from "@topik/lib/topik/read-aloud/lens/machine"
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
} {
  let snapshot: LensSnapshot | null = null
  const runtime = createLensRuntime(
    {
      current: {
        deck: REPO_SETS,
        level: 1,
        speech,
        onExit: (): void => undefined,
        seedKey: (): string => "runtime",
      },
    },
    (next): void => {
      snapshot = next
    }
  )
  return {
    runtime,
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
})
