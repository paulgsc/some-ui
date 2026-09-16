import type { SwitchableArtifact } from "@leetype/components/round/artifact-switcher"
import {
  FIXTURE_EXERCISE_ID,
  nextExercise,
} from "@leetype/lib/leetype/exercises"
import type { Commitment } from "@leetype/types/commitment"
import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { WideRoundSurface } from "."

// Same rationale as `components/leetype/index.test.tsx`: the wasm binary is
// a workspace crate with no `dist/` in a test run, and the point of this
// file is when the probe mounts — not what it does once mounted. Mocking the
// loader is what lets the probe render at all, and counting its calls is
// what proves "loads on open, never on mount."
const loadWasm = vi.fn()
vi.mock("@leetype/lib/leetype/leetype-wasm-loader", () => ({
  loadWasm: (): Promise<never> => {
    loadWasm()
    return Promise.reject(new Error("engine unavailable in this test"))
  },
  resetWasm: (): void => {},
}))

beforeEach(() => {
  loadWasm.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const PROBE_EXERCISE = nextExercise({ preferId: FIXTURE_EXERCISE_ID })

const ARTIFACTS: ReadonlyArray<SwitchableArtifact> = [
  { id: "algorithm", label: "Algorithm", content: <p>Source of A</p> },
  { id: "constraintDiff", label: "Constraints", content: <p>C to C′</p> },
]

const REVEAL_ARTIFACTS: ReadonlyArray<SwitchableArtifact> = [
  { id: "diffSet", label: "Candidate patches", content: <p>D, revealed</p> },
]

const CHOICE_COMMITMENT: Commitment = { kind: "choice", id: "CW-P6" }

describe("WideRoundSurface", () => {
  it("renders exactly one switcher before a commitment, even with revealArtifacts supplied", () => {
    render(
      <WideRoundSurface
        roundId="round-1"
        artifacts={ARTIFACTS}
        revealArtifacts={REVEAL_ARTIFACTS}
        commitment={null}
        probeExercise={PROBE_EXERCISE}
      />
    )
    expect(screen.getAllByLabelText("Previous artifact")).toHaveLength(1)
  })

  it("renders two switchers once a commitment lands and revealArtifacts is non-empty", () => {
    render(
      <WideRoundSurface
        roundId="round-1"
        artifacts={ARTIFACTS}
        revealArtifacts={REVEAL_ARTIFACTS}
        commitment={CHOICE_COMMITMENT}
        probeExercise={PROBE_EXERCISE}
      />
    )
    expect(screen.getAllByLabelText("Previous artifact")).toHaveLength(2)
  })

  it("stays at one switcher after a commitment when no revealArtifacts are given — simultaneity is permitted, not forced", () => {
    render(
      <WideRoundSurface
        roundId="round-1"
        artifacts={ARTIFACTS}
        commitment={CHOICE_COMMITMENT}
        probeExercise={PROBE_EXERCISE}
      />
    )
    expect(screen.getAllByLabelText("Previous artifact")).toHaveLength(1)
  })

  it("preserves the primary switcher's position across the commitment transition", () => {
    const { rerender } = render(
      <WideRoundSurface
        roundId="round-1"
        artifacts={ARTIFACTS}
        revealArtifacts={REVEAL_ARTIFACTS}
        commitment={null}
        probeExercise={PROBE_EXERCISE}
      />
    )
    fireEvent.click(screen.getByLabelText("Next artifact"))
    expect(screen.getByText("Constraints")).toBeInTheDocument()

    rerender(
      <WideRoundSurface
        roundId="round-1"
        artifacts={ARTIFACTS}
        revealArtifacts={REVEAL_ARTIFACTS}
        commitment={CHOICE_COMMITMENT}
        probeExercise={PROBE_EXERCISE}
      />
    )
    // Still on the second artifact — the primary switcher's own instance
    // (and its position state) survived the second switcher appearing,
    // rather than being remounted from scratch.
    expect(screen.getByText("Constraints")).toBeInTheDocument()
  })

  it("gates the production probe behind a deliberate open action", () => {
    render(
      <WideRoundSurface
        roundId="round-1"
        artifacts={ARTIFACTS}
        commitment={null}
        probeExercise={PROBE_EXERCISE}
      />
    )
    expect(screen.queryByLabelText("Typing input")).not.toBeInTheDocument()
    expect(loadWasm).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText("Open production probe"))

    expect(screen.getByLabelText("Typing input")).toBeInTheDocument()
    expect(loadWasm).toHaveBeenCalled()
  })

  it("closes the production probe on request, discarding it", () => {
    render(
      <WideRoundSurface
        roundId="round-1"
        artifacts={ARTIFACTS}
        commitment={null}
        probeExercise={PROBE_EXERCISE}
      />
    )
    fireEvent.click(screen.getByText("Open production probe"))
    expect(screen.getByLabelText("Typing input")).toBeInTheDocument()

    fireEvent.click(screen.getByText("Close production probe"))
    expect(screen.queryByLabelText("Typing input")).not.toBeInTheDocument()
  })

  it("closes an open production probe when the round advances", () => {
    const { rerender } = render(
      <WideRoundSurface
        roundId="round-1"
        artifacts={ARTIFACTS}
        commitment={null}
        probeExercise={PROBE_EXERCISE}
      />
    )
    fireEvent.click(screen.getByText("Open production probe"))
    expect(screen.getByLabelText("Typing input")).toBeInTheDocument()

    rerender(
      <WideRoundSurface
        roundId="round-2"
        artifacts={ARTIFACTS}
        commitment={null}
        probeExercise={PROBE_EXERCISE}
      />
    )
    expect(screen.queryByLabelText("Typing input")).not.toBeInTheDocument()
  })
})
