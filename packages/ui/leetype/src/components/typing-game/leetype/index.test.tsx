import { resetWasm } from "@leetype/lib/leetype/leetype-wasm-loader"
import type { Exercise } from "@leetype/types/exercise"
import type { CompletedSessionStats } from "@leetype/types/leetype"
import type { default as wasmInit } from "@some-ui/leetype-wasm"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { Leetype } from "."

/**
 * What `__wbg_init` resolves to — the wasm exports table. Derived from the
 * bindings rather than written as `void` so this mock keeps tracking the
 * real signature; the loader awaits init purely for sequencing and never
 * reads the table, so a stand-in value is enough.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- a stand-in for the wasm exports table, which the loader awaits but never reads
const INIT_OUTPUT = {} as Awaited<ReturnType<typeof wasmInit>>

// ═══════════════════════════════════════════════════════════════════════════
// What is pinned here is the one thing the composition can get wrong in a way
// no unit test would notice: **the runner advances exactly once per completed
// step.**
//
// The hazard is React re-entrancy, not arithmetic. `Leetype`'s completion
// effect depends on the runner, so advancing the runner re-runs the effect —
// and on that second run the snapshot it reads is still the *previous*
// engine state, because the engine's own step-swap effect has scheduled a
// state update rather than applied one. Left unguarded, every finished step
// advances the runner twice and the player skips every other step.
//
// The engine is faked (not the reveal loop — that is proved in Rust) so this
// file can drive completion deterministically: press the exact characters a
// step owes and the fake reports `isComplete`.
// ═══════════════════════════════════════════════════════════════════════════

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
/**
 * `Snapshot.assisted` the fake engine reports for every step (LTY-SEAM S2,
 * #1016). `0` everywhere except "the assistance seam" below, which needs a
 * nonzero value to prove `assisted` still reaches `CompletedSessionStats
 * .assistance` — every other test in this file runs a fluent session and
 * would not notice that pipeline silently dropping the field.
 */
let assistedOverride: number

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
        assisted: assistedOverride,
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
      return this.outcome()
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

/** Three steps whose sources are short, distinct, and easy to count. */
const EXERCISE: Exercise = {
  id: "test",
  title: "Three steps",
  steps: ["aaa", "bbb", "ccc"].map((source, index) => ({
    id: `s${index}`,
    goal: `Step ${index}.`,
    concepts: [],
    blocks: [
      { kind: "prompt" as const, lines: [`Prompt ${index}`] },
      { kind: "typing" as const, source, language: "rust" as const },
    ],
  })),
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

beforeEach(async () => {
  localStorage.clear()
  progression = "advance"
  sourcesSeen = []
  assistedOverride = 0
  resetWasm()
  const wasmStub = await import("@some-ui/leetype-wasm")
  vi.mocked(wasmStub.default)
    .mockReset()
    .mockImplementation(() => Promise.resolve(INIT_OUTPUT))
})

describe("the step hand-off", () => {
  it("advances exactly one step per completed step", async () => {
    // The re-entrancy guard, stated as the behaviour it protects. Without it
    // the runner advances twice per completion and the player sees steps 1
    // and 3, never 2.
    seedBaseline()
    render(<Leetype exercise={EXERCISE} />)

    const input = await begin()
    await screen.findByText("Step 0.")

    typeStep(input, 3)
    await screen.findByText("Step 1.")

    typeStep(input, 3)
    await screen.findByText("Step 2.")

    // Every source the engine was handed, in order: no step skipped, none
    // replayed. The first entry is the construction source.
    expect(sourcesSeen).toEqual(["aaa", "bbb", "ccc"])
  })

  it("replays the same step when the gate holds, without skipping ahead", async () => {
    seedBaseline()
    progression = "repeat"
    render(<Leetype exercise={EXERCISE} />)

    const input = await begin()
    await screen.findByText("Step 0.")

    typeStep(input, 3)
    await screen.findByText(/again ×1/)

    // Still step 0, and the engine was told to replay rather than swap.
    expect(screen.getByText("Step 0.")).toBeInTheDocument()
    expect(sourcesSeen).toEqual(["aaa", "retry:aaa"])
  })

  it("reports the sequence once it runs out of steps", async () => {
    seedBaseline()
    const onSessionComplete = vi.fn()
    render(
      <Leetype exercise={EXERCISE} onSessionComplete={onSessionComplete} />
    )

    const input = await begin()
    await screen.findByText("Step 0.")

    for (let step = 0; step < 3; step++) {
      typeStep(input, 3)
      await waitFor(() =>
        expect(sourcesSeen.length).toBeGreaterThanOrEqual(step + 1)
      )
    }

    await screen.findByText(/Exercise complete/i)
    expect(onSessionComplete).toHaveBeenCalledTimes(1)
    expect(onSessionComplete.mock.calls[0]?.[0]).toMatchObject({
      stepsCompleted: 3,
      stepsEscaped: 0,
    })
  })
})

describe("the reason-reaffirmation shim (LTY-WHY W4, #1104)", () => {
  /** One step carries rationaleChoices; the other doesn't, to prove the widget is per-step, not global. */
  const EXERCISE_WITH_RATIONALE: Exercise = {
    id: "test-rationale",
    title: "Two steps, one with rationaleChoices",
    steps: [
      {
        id: "r0",
        goal: "Step 0.",
        concepts: [],
        blocks: [
          { kind: "prompt" as const, lines: ["Prompt 0"] },
          {
            kind: "typing" as const,
            source: "aaa",
            language: "rust" as const,
          },
        ],
        rationaleChoices: [
          { text: "because borrowing avoids the copy" },
          { text: "because the loop terminates early" },
        ],
      },
      {
        id: "r1",
        goal: "Step 1.",
        concepts: [],
        blocks: [
          { kind: "prompt" as const, lines: ["Prompt 1"] },
          {
            kind: "typing" as const,
            source: "bbb",
            language: "rust" as const,
          },
        ],
      },
    ],
  }

  it("renders nothing while a rationaleChoices-bearing step is still in flight", async () => {
    seedBaseline()
    render(<Leetype exercise={EXERCISE_WITH_RATIONALE} />)
    await begin()
    await screen.findByText("Step 0.")
    expect(
      screen.queryByText("Why is this the right fix?")
    ).not.toBeInTheDocument()
  })

  it("renders the accordion once the step's hunk completes", async () => {
    seedBaseline()
    render(<Leetype exercise={EXERCISE_WITH_RATIONALE} />)
    const input = await begin()
    await screen.findByText("Step 0.")

    typeStep(input, 3)
    await screen.findByText("Step 1.")
    await screen.findByText("Why is this the right fix?")
  })

  it("retires the accordion on the player's next keystroke, not before", async () => {
    seedBaseline()
    render(<Leetype exercise={EXERCISE_WITH_RATIONALE} />)
    const input = await begin()
    await screen.findByText("Step 0.")

    typeStep(input, 3)
    await screen.findByText("Step 1.")
    await screen.findByText("Why is this the right fix?")

    // Step 1 carries no rationaleChoices of its own — its first keystroke
    // retires step 0's leftover accordion rather than replacing it.
    typeStep(input, 1)
    await waitFor(() => {
      expect(
        screen.queryByText("Why is this the right fix?")
      ).not.toBeInTheDocument()
    })
  })

  it("never renders for a step without rationaleChoices", async () => {
    seedBaseline()
    render(<Leetype exercise={EXERCISE} />)
    const input = await begin()
    await screen.findByText("Step 0.")
    typeStep(input, 3)
    await screen.findByText("Step 1.")
    expect(
      screen.queryByText("Why is this the right fix?")
    ).not.toBeInTheDocument()
  })
})

describe("the warm-up", () => {
  it("runs first for a player with no stored baseline, and only once", async () => {
    render(<Leetype exercise={EXERCISE} />)

    const input = await begin()
    await screen.findByText(/Warm up/i)

    // The calibration passage, then the exercise's first step — and the
    // exercise must start at step 0, not step 1.
    const passageLength = sourcesSeen[0]?.length ?? 0
    expect(passageLength).toBeGreaterThan(0)

    typeStep(input, passageLength)
    await screen.findByText("Step 0.", {}, { timeout: 10000 })
    expect(screen.queryByText(/Warm up/i)).not.toBeInTheDocument()
  }, 15000)

  it("is skipped entirely once a baseline is stored", async () => {
    seedBaseline()
    render(<Leetype exercise={EXERCISE} />)

    await begin()
    await screen.findByText("Step 0.")
    expect(screen.queryByText(/Warm up/i)).not.toBeInTheDocument()
  })
})

describe("the assistance seam (LTY-SEAM S2, #1016)", () => {
  it("carries a nonzero assisted count through to CompletedSessionStats.assistance", async () => {
    // Nothing consumes `assistance` as a competence claim today — S2 (#1016)
    // forbids that outright — but `adaptive-learning-canon.typ`'s eventual
    // O3 will read it at this exact boundary, and every other test in this
    // file runs a fluent session where `assisted` stays 0 throughout. That
    // makes 0 the value a refactor that silently stopped forwarding
    // `Snapshot.assisted` into this aggregate would *also* produce — so
    // this test forces it nonzero and confirms the whole pipeline
    // (Snapshot.assisted -> assistanceRef -> CompletedSessionStats
    // .assistance) still carries it.
    seedBaseline()
    assistedOverride = 1
    const onSessionComplete = vi.fn<(stats: CompletedSessionStats) => void>()
    render(
      <Leetype exercise={EXERCISE} onSessionComplete={onSessionComplete} />
    )

    const input = await begin()
    await screen.findByText("Step 0.")

    for (let step = 0; step < 3; step++) {
      typeStep(input, 3)
      await waitFor(() =>
        expect(sourcesSeen.length).toBeGreaterThanOrEqual(step + 1)
      )
    }

    await screen.findByText(/Exercise complete/i)
    expect(onSessionComplete).toHaveBeenCalledTimes(1)
    const stats = onSessionComplete.mock.calls[0]?.[0]
    expect(stats?.assistance).toBeGreaterThan(0)
  })
})
