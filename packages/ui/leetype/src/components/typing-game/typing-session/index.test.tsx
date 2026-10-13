import { Profiler } from "react"
import { resetWasm } from "@leetype/lib/leetype/leetype-wasm-loader"
import type { Exercise } from "@leetype/types/exercise"
import type { CompletedSessionStats } from "@leetype/types/leetype"
import type { default as wasmInit } from "@some-ui/leetype-wasm"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { TypingSession } from "."

/** What `__wbg_init` resolves to; the loader awaits it but never reads it. */
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- a stand-in for the wasm exports table, which the loader awaits but never reads
const INIT_OUTPUT = {} as Awaited<ReturnType<typeof wasmInit>>

// Pins **each completed step is handled exactly once**: banked, fed into the
// baseline and advanced past, the last step included. The engine is faked so
// completion is deterministic: press the characters a step owes and it
// reports `isComplete`.

type Snapshot = {
  cursorSlot: number
  cursorDisplay: number
  cursorSection: null
  slotCount: number
  filled: number
  correct: number
  firstGapSlot: number | null
  progress: number
  accuracy: number
  wpm: number
  instantWpm: number
  weightedWpm: number
  gateThreshold: number
  attempt: number
  revealK: number
  runCount: number
  manualRevealActive: boolean
  manualRevealFraction: number
  assisted: number
  elapsedTime: number
  sessionElapsedTime: number
  totalErrors: number
  consecutiveErrors: number
  showErrorAlert: boolean
  isComplete: boolean
  started: boolean
}

/** What the fake engine should say when a step finishes. */
let progression: "advance" | "repeat" | "escape"
/** Every source the fake was handed, in order — the record under test. */
let sourcesSeen: Array<string>
/** `Snapshot.assisted` per source: none except in "the assistance seam". */
let assistedBySource: Record<string, number>

vi.mock("@some-ui/leetype-wasm", () => {
  class TypingGame {
    private source: string
    private cursor = 0
    private attempt = 0

    constructor(source: string) {
      this.source = source
      sourcesSeen.push(source)
    }

    private readSnapshot(): Snapshot {
      const slotCount = this.source.length
      return {
        cursorSlot: this.cursor,
        cursorDisplay: this.cursor,
        cursorSection: null,
        slotCount,
        filled: this.cursor,
        correct: this.cursor,
        firstGapSlot: this.cursor < slotCount ? this.cursor : null,
        progress: slotCount === 0 ? 0 : (this.cursor / slotCount) * 100,
        accuracy: 100,
        wpm: 60,
        instantWpm: 60,
        weightedWpm: 40,
        gateThreshold: 20,
        attempt: this.attempt,
        revealK: 1,
        runCount: 3,
        manualRevealActive: false,
        manualRevealFraction: 0,
        assisted: assistedBySource[this.source] ?? 0,
        elapsedTime: 10,
        sessionElapsedTime: 30,
        totalErrors: 0,
        consecutiveErrors: 0,
        showErrorAlert: false,
        isComplete: slotCount > 0 && this.cursor >= slotCount,
        started: true,
      }
    }

    private outcome(): unknown {
      return {
        accepted: true,
        rejection: undefined,
        snapshot: this.readSnapshot(),
      }
    }

    layout(): unknown {
      return {
        displayLen: this.source.length,
        slotCount: this.source.length,
        sections: [],
        displaySource: this.source,
      }
    }
    roles(): Uint8Array {
      return new Uint8Array(this.source.length).fill(1)
    }
    slot_of_display(): Int32Array {
      return Int32Array.from({ length: this.source.length }, (_, i) => i)
    }
    slot_status(): Uint8Array {
      return new Uint8Array(this.source.length)
    }
    visibility(): Uint8Array {
      return new Uint8Array(this.source.length).fill(1)
    }
    progression(): unknown {
      return progression
    }
    snapshot(): unknown {
      return this.readSnapshot()
    }
    start(): unknown {
      this.cursor = 0
      return this.outcome()
    }
    press(): unknown {
      if (this.cursor < this.source.length) this.cursor += 1
      return this.outcome()
    }
    backspace(): unknown {
      if (this.cursor > 0) this.cursor -= 1
      return this.outcome()
    }
    jump_to_slot(): unknown {
      return this.outcome()
    }
    jump_to_section(): unknown {
      return this.outcome()
    }
    resume(): unknown {
      return this.outcome()
    }
    dismiss_alert(): unknown {
      return this.outcome()
    }
    toggle_reveal(): unknown {
      return this.outcome()
    }
    reset(): unknown {
      this.cursor = 0
      return this.outcome()
    }
    reset_game(): unknown {
      this.cursor = 0
      return this.outcome()
    }
    complete_chunk(): unknown {
      return {
        accepted: true,
        rejection: undefined,
        chunk: { charsTyped: this.cursor, errors: 0, elapsedTime: 10 },
        snapshot: this.readSnapshot(),
      }
    }
    start_next_chunk(source: string): unknown {
      this.source = source
      this.cursor = 0
      this.attempt = 0
      sourcesSeen.push(source)
      return this.outcome()
    }
    retry_chunk(): unknown {
      this.cursor = 0
      this.attempt += 1
      sourcesSeen.push(`retry:${this.source}`)
      return this.outcome()
    }
    tick(): unknown {
      return this.outcome()
    }
    calibrate(): unknown {
      return this.outcome()
    }
    section_progress(): unknown {
      return []
    }
    cumulative_stats(): unknown {
      return { charsTyped: 0, errors: 0 }
    }
    free(): void {
      // nothing to release in the fake
    }
  }

  return {
    default: vi.fn(() => Promise.resolve()),
    TypingGame,
    classify_source: vi.fn(() => new Uint8Array()),
    slot_map_from_source: vi.fn(() => new Int32Array()),
  }
})

type Step = Exercise["steps"][number]

/** A step at position `index` typing `source`, with goal "Step <index>.". */
function stepOf(
  id: string,
  index: number,
  source: string,
  extra: Partial<Step> = {}
): Step {
  return {
    id,
    goal: `Step ${index}.`,
    concepts: [],
    blocks: [
      { kind: "prompt", lines: [`Prompt ${index}`] },
      { kind: "typing", source, language: "rust" },
    ],
    ...extra,
  }
}

const WITH_CHOICES: Partial<Step> = {
  rationaleChoices: [
    { text: "because borrowing avoids the copy" },
    { text: "because the loop terminates early" },
  ],
}

/** Three steps whose sources are short, distinct, and easy to count. */
const EXERCISE: Exercise = {
  id: "test",
  title: "Three steps",
  steps: ["aaa", "bbb", "ccc"].map((source, index) =>
    stepOf(`s${index}`, index, source)
  ),
}

/** A stored baseline, so the warm-up is not in the way of these assertions. */
function seedBaseline(): void {
  localStorage.setItem(
    "leetyping_progress",
    JSON.stringify({
      version: 2,
      baseline: { wpm: 60, dispersion: 8, samples: 3, updatedAt: 1 },
    })
  )
}

async function begin(): Promise<HTMLElement> {
  const button = await screen.findByRole("button", { name: /begin/i })
  fireEvent.click(button)
  return screen.getByLabelText("Typing input")
}

/** Type a step's worth of characters into the capture element. */
function typeStep(input: HTMLElement, length: number): void {
  for (let index = 0; index < length; index++) {
    fireEvent.keyDown(input, { key: "a" })
  }
}

/** With a stored baseline: render, press Begin, wait for step 0. */
async function startSession(
  props: Parameters<typeof TypingSession>[0]
): Promise<HTMLElement> {
  seedBaseline()
  render(<TypingSession {...props} />)
  const input = await begin()
  await screen.findByText("Step 0.")
  return input
}

/** Types all three steps of `EXERCISE` (or of `stepLength` each), then waits for the results card. */
async function completeExercise(
  input: HTMLElement,
  stepLength = 3
): Promise<void> {
  for (let step = 0; step < 3; step++) {
    typeStep(input, stepLength)
    await waitFor(() =>
      expect(sourcesSeen.length).toBeGreaterThanOrEqual(step + 1)
    )
  }
  await screen.findByText(/Exercise complete/i)
}

const WHY = "Why is this the right fix?"

beforeEach(async () => {
  localStorage.clear()
  progression = "advance"
  sourcesSeen = []
  assistedBySource = {}
  resetWasm()
  const wasmStub = await import("@some-ui/leetype-wasm")
  vi.mocked(wasmStub.default)
    .mockReset()
    .mockImplementation(() => Promise.resolve(INIT_OUTPUT))
})

describe("the step hand-off", () => {
  it("advances exactly one step per completed step", async () => {
    const input = await startSession({ exercise: EXERCISE })

    typeStep(input, 3)
    await screen.findByText("Step 1.")

    typeStep(input, 3)
    await screen.findByText("Step 2.")

    // No step skipped, none replayed; the first is the construction source.
    expect(sourcesSeen).toEqual(["aaa", "bbb", "ccc"])
  })

  it("advances even when the engine reports the gate held (Ax. 9.1: revelation is unconditional)", async () => {
    progression = "repeat"
    const input = await startSession({ exercise: EXERCISE })

    typeStep(input, 3)
    await screen.findByText("Step 1.")

    // The engine said "repeat"; `readProgression` does not consult it.
    expect(sourcesSeen).toEqual(["aaa", "bbb"])
  })

  it("feeds each finished step into the stored baseline exactly once, the last included", async () => {
    // Long enough that each step yields a sample (`sampleFromStep`).
    const long: Exercise = {
      id: "long",
      title: "Three long steps",
      steps: ["a", "b", "c"].map((char, index) =>
        stepOf(`l${index}`, index, char.repeat(40))
      ),
    }
    await completeExercise(await startSession({ exercise: long }), 40)
    const stored: unknown = JSON.parse(
      localStorage.getItem("leetyping_progress") ?? "null"
    )
    // Seeded with 3 samples; one blend per step.
    expect(stored).toMatchObject({ baseline: { samples: 6 } })
  })

  it("reports the sequence once it runs out of steps", async () => {
    const onSessionComplete = vi.fn()
    await completeExercise(
      await startSession({ exercise: EXERCISE, onSessionComplete })
    )
    expect(onSessionComplete).toHaveBeenCalledTimes(1)
    expect(onSessionComplete.mock.calls[0]?.[0]).toMatchObject({
      stepsCompleted: 3,
      stepsEscaped: 0,
    })
  })
})

describe("the reason-reaffirmation shim (LTY-WHY W4)", () => {
  /** Only step 0 carries rationaleChoices: the widget is per-step. */
  const EXERCISE_WITH_RATIONALE: Exercise = {
    id: "test-rationale",
    title: "Two steps, one with rationaleChoices",
    steps: [stepOf("r0", 0, "aaa", WITH_CHOICES), stepOf("r1", 1, "bbb")],
  }

  it("renders nothing while a rationaleChoices-bearing step is still in flight", async () => {
    await startSession({ exercise: EXERCISE_WITH_RATIONALE })
    expect(screen.queryByText(WHY)).not.toBeInTheDocument()
  })

  it("renders the accordion once the step's hunk completes", async () => {
    const input = await startSession({ exercise: EXERCISE_WITH_RATIONALE })
    typeStep(input, 3)
    await screen.findByText("Step 1.")
    await screen.findByText(WHY)
  })

  it("retires the accordion on the player's next keystroke, not before", async () => {
    const input = await startSession({ exercise: EXERCISE_WITH_RATIONALE })
    typeStep(input, 3)
    await screen.findByText("Step 1.")
    await screen.findByText(WHY)

    // Step 1 has no choices of its own: its first keystroke retires step 0's.
    typeStep(input, 1)
    await waitFor(() => {
      expect(screen.queryByText(WHY)).not.toBeInTheDocument()
    })
  })

  it("never renders for a step without rationaleChoices", async () => {
    const input = await startSession({ exercise: EXERCISE })
    typeStep(input, 3)
    await screen.findByText("Step 1.")
    expect(screen.queryByText(WHY)).not.toBeInTheDocument()
  })

  it("stays reachable when its step is the last one in the sequence", async () => {
    // The last step's completion finishes the run in the same tick; the
    // accordion must survive the swap to the results card.
    const input = await startSession({
      exercise: {
        id: "test-rationale-last",
        title: "One step, with rationaleChoices, and nothing after it",
        steps: [stepOf("last", 0, "aaa", WITH_CHOICES)],
      },
    })
    typeStep(input, 3)
    await screen.findByText(/Exercise complete/i)
    await screen.findByText(WHY)
  })
})

describe("the warm-up", () => {
  it("runs first for a player with no stored baseline, and only once", async () => {
    render(<TypingSession exercise={EXERCISE} />)

    const input = await begin()
    await screen.findByText(/Warm up/i)

    // The calibration passage, then the exercise from step 0, not step 1.
    const passageLength = sourcesSeen[0]?.length ?? 0
    expect(passageLength).toBeGreaterThan(0)

    typeStep(input, passageLength)
    await screen.findByText("Step 0.", {}, { timeout: 10000 })
    expect(screen.queryByText(/Warm up/i)).not.toBeInTheDocument()
  }, 15000)

  it("is skipped entirely once a baseline is stored", async () => {
    await startSession({ exercise: EXERCISE })
    expect(screen.queryByText(/Warm up/i)).not.toBeInTheDocument()
  })
})

describe("the session term", () => {
  it("does not re-render the session while the term runs", async () => {
    seedBaseline()
    const onRender = vi.fn()
    render(
      <Profiler id="session" onRender={onRender}>
        <TypingSession exercise={EXERCISE} />
      </Profiler>
    )
    await screen.findByRole("button", { name: /begin/i })
    onRender.mockClear()
    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(onRender).not.toHaveBeenCalled()
  })

  it("ends the session at the deadline with the steps completed so far", async () => {
    const onSessionComplete = vi.fn<(stats: CompletedSessionStats) => void>()
    const input = await startSession({
      exercise: EXERCISE,
      sessionDurationMs: 1000,
      onSessionComplete,
    })
    typeStep(input, 3)
    await screen.findByText("Step 1.")
    await screen.findByText(/Exercise complete/i, {}, { timeout: 3000 })
    expect(onSessionComplete).toHaveBeenCalledTimes(1)
    expect(onSessionComplete.mock.calls[0]?.[0]).toMatchObject({
      stepsCompleted: 1,
    })
  })

  it("ends at Begin when the term ran out before it", async () => {
    const onSessionComplete = vi.fn()
    seedBaseline()
    render(
      <TypingSession
        exercise={EXERCISE}
        sessionDurationMs={0}
        onSessionComplete={onSessionComplete}
      />
    )
    fireEvent.click(await screen.findByRole("button", { name: /begin/i }))
    await screen.findByText(/Exercise complete/i)
    expect(onSessionComplete).toHaveBeenCalledTimes(1)
  })
})

describe("the assistance seam (LTY-SEAM S2)", () => {
  it("banks each step's assisted share once into CompletedSessionStats.assistance", async () => {
    // Only the last step is assisted (3 of 3), so the mean over three steps
    // is 1/3 exactly when each step is banked once. A dropped pipeline
    // (Snapshot.assisted -> assistanceRef -> assistance) would give 0.
    assistedBySource = { ccc: 3 }
    const onSessionComplete = vi.fn<(stats: CompletedSessionStats) => void>()
    await completeExercise(
      await startSession({ exercise: EXERCISE, onSessionComplete })
    )
    expect(onSessionComplete).toHaveBeenCalledTimes(1)
    const stats = onSessionComplete.mock.calls[0]?.[0]
    expect(stats?.assistance).toBeCloseTo(1 / 3)
  })
})
