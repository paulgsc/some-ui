import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { ArtifactId, SwitchableArtifact } from "."
import { ArtifactSwitcher } from "."

const ARTIFACTS: ReadonlyArray<SwitchableArtifact> = [
  { id: "algorithm", label: "Algorithm", content: <p>Source of A</p> },
  { id: "constraintDiff", label: "Constraints", content: <p>C to C′</p> },
  { id: "budget", label: "Budget", content: <p>Operation count</p> },
]

/** Def. 9.2's own six artifacts — every id `SwitchableArtifact.id` accepts. */
const ALL_ARTIFACT_IDS: ReadonlyArray<ArtifactId> = [
  "algorithm",
  "constraintDiff",
  "budget",
  "diffSet",
  "optionSet",
  "runResult",
]

const panelOf = (container: HTMLElement): HTMLElement => {
  const panel = container.querySelector<HTMLElement>(".touch-pan-y")
  expect(panel).not.toBeNull()
  return panel!
}

const swipe = (
  target: HTMLElement,
  {
    fromX,
    toX,
    fromY = 0,
    toY = 0,
  }: { fromX: number; toX: number; fromY?: number; toY?: number }
): void => {
  fireEvent.touchStart(target, {
    touches: [{ clientX: fromX, clientY: fromY }],
  })
  fireEvent.touchEnd(target, {
    changedTouches: [{ clientX: toX, clientY: toY }],
  })
}

describe("ArtifactSwitcher", () => {
  it("renders exactly one artifact's content at a time (Def. 9.2: exactly one is load-bearing)", () => {
    render(<ArtifactSwitcher artifacts={ARTIFACTS} roundId="round-1" />)
    expect(screen.getByText("Source of A")).toBeInTheDocument()
    expect(screen.queryByText("C to C′")).not.toBeInTheDocument()
    expect(screen.queryByText("Operation count")).not.toBeInTheDocument()
  })

  it("renders nothing for an empty artifact set rather than crashing", () => {
    const { container } = render(
      <ArtifactSwitcher artifacts={[]} roundId="round-1" />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("an artifact absent from the array never appears — there is no disabled placeholder for it", () => {
    render(
      <ArtifactSwitcher artifacts={ARTIFACTS.slice(0, 2)} roundId="round-1" />
    )
    expect(screen.queryByText("Operation count")).not.toBeInTheDocument()
    // Only two positions exist, so "Next" is reachable exactly once before
    // it disables — an unavailable third artifact is absence, not a control
    // hinting at what is coming.
    fireEvent.click(screen.getByRole("button", { name: "Next artifact" }))
    expect(screen.getByRole("button", { name: "Next artifact" })).toBeDisabled()
  })

  it("moves forward and back on press, disabling at each end", () => {
    render(<ArtifactSwitcher artifacts={ARTIFACTS} roundId="round-1" />)
    const previous = screen.getByRole("button", { name: "Previous artifact" })
    const next = screen.getByRole("button", { name: "Next artifact" })

    expect(previous).toBeDisabled()
    expect(next).not.toBeDisabled()

    fireEvent.click(next)
    expect(screen.getByText("C to C′")).toBeInTheDocument()
    expect(previous).not.toBeDisabled()
    expect(next).not.toBeDisabled()

    fireEvent.click(next)
    expect(screen.getByText("Operation count")).toBeInTheDocument()
    expect(next).toBeDisabled()

    fireEvent.click(previous)
    expect(screen.getByText("C to C′")).toBeInTheDocument()
  })

  it("moves to the next artifact on a leftward swipe past the threshold", () => {
    const { container } = render(
      <ArtifactSwitcher artifacts={ARTIFACTS} roundId="round-1" />
    )
    swipe(panelOf(container), { fromX: 200, toX: 100 })
    expect(screen.getByText("C to C′")).toBeInTheDocument()
  })

  it("moves to the previous artifact on a rightward swipe past the threshold", () => {
    const { container } = render(
      <ArtifactSwitcher artifacts={ARTIFACTS} roundId="round-1" />
    )
    fireEvent.click(screen.getByRole("button", { name: "Next artifact" }))
    expect(screen.getByText("C to C′")).toBeInTheDocument()

    swipe(panelOf(container), { fromX: 100, toX: 200 })
    expect(screen.getByText("Source of A")).toBeInTheDocument()
  })

  it("ignores a drag shorter than the swipe threshold", () => {
    const { container } = render(
      <ArtifactSwitcher artifacts={ARTIFACTS} roundId="round-1" />
    )
    swipe(panelOf(container), { fromX: 200, toX: 180 })
    expect(screen.getByText("Source of A")).toBeInTheDocument()
  })

  it("ignores a mostly-vertical drag — that is a page scroll, not a swipe", () => {
    const { container } = render(
      <ArtifactSwitcher artifacts={ARTIFACTS} roundId="round-1" />
    )
    swipe(panelOf(container), { fromX: 200, toX: 140, fromY: 0, toY: 200 })
    expect(screen.getByText("Source of A")).toBeInTheDocument()
  })

  it("defers to a descendant's own horizontal scroll — LTY-MOBILE's rule, kept verbatim", () => {
    const artifactsWithScroller: ReadonlyArray<SwitchableArtifact> = [
      {
        id: "algorithm",
        label: "Algorithm",
        content: (
          <div data-scroll-intent="code-display" data-testid="scroller">
            long unwrapped source line
          </div>
        ),
      },
      ...ARTIFACTS.slice(1),
    ]
    render(
      <ArtifactSwitcher artifacts={artifactsWithScroller} roundId="round-1" />
    )
    const scroller = screen.getByTestId("scroller")
    swipe(scroller, { fromX: 200, toX: 100 })
    // The gesture started inside the scroll-intent region, so it was never
    // tracked as a switch candidate — the artifact in view is unchanged.
    expect(screen.getByTestId("scroller")).toBeInTheDocument()
    expect(screen.queryByText("C to C′")).not.toBeInTheDocument()
  })

  it("survives a re-render with the same round — a prop change alone never moves position", () => {
    const { rerender } = render(
      <ArtifactSwitcher artifacts={ARTIFACTS} roundId="round-1" />
    )
    fireEvent.click(screen.getByRole("button", { name: "Next artifact" }))
    expect(screen.getByText("C to C′")).toBeInTheDocument()

    // A new array reference, same round, same content — the kind of
    // re-render a phase transition elsewhere in the same round causes.
    rerender(<ArtifactSwitcher artifacts={[...ARTIFACTS]} roundId="round-1" />)
    expect(screen.getByText("C to C′")).toBeInTheDocument()
  })

  it("resets to the first artifact when the round advances", () => {
    const { rerender } = render(
      <ArtifactSwitcher artifacts={ARTIFACTS} roundId="round-1" />
    )
    fireEvent.click(screen.getByRole("button", { name: "Next artifact" }))
    fireEvent.click(screen.getByRole("button", { name: "Next artifact" }))
    expect(screen.getByText("Operation count")).toBeInTheDocument()

    rerender(<ArtifactSwitcher artifacts={ARTIFACTS} roundId="round-2" />)
    expect(screen.getByText("Source of A")).toBeInTheDocument()
  })

  it("announces the current artifact and its position for assistive tech", () => {
    render(<ArtifactSwitcher artifacts={ARTIFACTS} roundId="round-1" />)
    expect(
      screen.getByText("Round artifact: Algorithm, 1 of 3")
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Next artifact" }))
    expect(
      screen.getByText("Round artifact: Constraints, 2 of 3")
    ).toBeInTheDocument()
  })

  it("has no per-artifact branch: the same interactions work regardless of which ids are present", () => {
    const reordered: ReadonlyArray<SwitchableArtifact> = [
      ARTIFACTS[2]!,
      ARTIFACTS[0]!,
      ARTIFACTS[1]!,
    ]
    render(<ArtifactSwitcher artifacts={reordered} roundId="round-1" />)
    expect(screen.getByText("Operation count")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Next artifact" }))
    expect(screen.getByText("Source of A")).toBeInTheDocument()
  })

  it("presses through the real six-artifact set end to end, in canon order", () => {
    const allSix: ReadonlyArray<SwitchableArtifact> = ALL_ARTIFACT_IDS.map(
      (id) => ({ id, label: id, content: <p>content: {id}</p> })
    )
    render(<ArtifactSwitcher artifacts={allSix} roundId="round-1" />)

    for (const id of ALL_ARTIFACT_IDS) {
      expect(screen.getByText(`content: ${id}`)).toBeInTheDocument()
      fireEvent.click(screen.getByRole("button", { name: "Next artifact" }))
    }
    // One press past the last artifact does nothing further — "Next" is
    // already disabled at the end, the same boundary every other test
    // exercises with a shorter set.
    expect(screen.getByRole("button", { name: "Next artifact" })).toBeDisabled()
    expect(screen.getByText("content: runResult")).toBeInTheDocument()
  })
})
