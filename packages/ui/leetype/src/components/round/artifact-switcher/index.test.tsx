import type { FC } from "react"
import { useState } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

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

/** The tab panel `node` sits in. */
const slotOf = (node: HTMLElement): HTMLElement => {
  const slot = node.closest<HTMLElement>('[role="tabpanel"]')
  expect(slot).not.toBeNull()
  return slot!
}

/** `node` is in the current artifact's slot: the one load-bearing slot. */
const expectCurrent = (node: HTMLElement): void => {
  expect(slotOf(node)).not.toHaveAttribute("inert")
  expect(slotOf(node)).not.toHaveAttribute("aria-hidden")
}

/** `node` is mounted, but in a slot that is inert and hidden from assistive tech. */
const expectAway = (node: HTMLElement): void => {
  expect(slotOf(node)).toHaveAttribute("inert")
  expect(slotOf(node)).toHaveAttribute("aria-hidden", "true")
}

/** The pager, laid out at `width` px per page (jsdom has no layout of its own). */
const pagerOf = (container: HTMLElement, width = 360): HTMLElement => {
  const pager =
    container.querySelector<HTMLElement>('[role="tabpanel"]')?.parentElement
  expect(pager).toBeTruthy()
  Object.defineProperty(pager!, "clientWidth", {
    configurable: true,
    value: width,
  })
  return pager!
}

/** Records the pager's programmatic scrolls (jsdom does not implement them). */
const stubScrollTo = (pager: HTMLElement, scrollTo: () => void): void => {
  Object.defineProperty(pager, "scrollTo", {
    configurable: true,
    value: scrollTo,
  })
}

/** A swipe as the pager sees one: the native scroller coming to rest on `page`. */
const settleOn = (pager: HTMLElement, page: number): void => {
  pager.scrollLeft = page * pager.clientWidth
  fireEvent.scroll(pager)
}

describe("ArtifactSwitcher", () => {
  it("shows exactly one artifact's content at a time (Def. 9.2: exactly one is load-bearing)", () => {
    render(<ArtifactSwitcher artifacts={ARTIFACTS} roundId="round-1" />)
    expectCurrent(screen.getByText("Source of A"))
    // The neighbour is mounted, so a swipe drags real content in, but inert.
    expectAway(screen.getByText("C to C′"))
    // Two pages away and never visited, so not even mounted — a stronger
    // claim than "not current."
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
    expectCurrent(screen.getByText("C to C′"))
    expectAway(screen.getByText("Source of A"))
    expect(previous).not.toBeDisabled()
    expect(next).not.toBeDisabled()

    fireEvent.click(next)
    expectCurrent(screen.getByText("Operation count"))
    expectAway(screen.getByText("C to C′"))
    expect(next).toBeDisabled()

    fireEvent.click(previous)
    expectCurrent(screen.getByText("C to C′"))
    expectAway(screen.getByText("Operation count"))
    // Every artifact visited this round stays mounted, just hidden — the
    // fix for the state-preservation regression this file also tests below.
    expectAway(screen.getByText("Source of A"))
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

  it("resets to the first artifact when the round advances, dropping every mounted instance", () => {
    const { rerender } = render(
      <ArtifactSwitcher artifacts={ARTIFACTS} roundId="round-1" />
    )
    fireEvent.click(screen.getByRole("button", { name: "Next artifact" }))
    fireEvent.click(screen.getByRole("button", { name: "Next artifact" }))
    expectCurrent(screen.getByText("Operation count"))

    rerender(<ArtifactSwitcher artifacts={ARTIFACTS} roundId="round-2" />)
    expectCurrent(screen.getByText("Source of A"))
    // Not just inert — gone. Carrying a previous round's mounted instances
    // forward would reintroduce the same staleness this file's own
    // "preserves a child's local state" test below proves was fixed, one
    // round later. (`C` is back only as the new current one's neighbour,
    // in a freshly keyed slot.)
    expect(screen.queryByText("Operation count")).not.toBeInTheDocument()
  })

  it("preserves a child's local state across switching away and back — the regression this story's own review found", () => {
    const onCommit = vi.fn()
    const CommitOnce: FC = () => {
      const [committed, setCommitted] = useState(false)
      return (
        <button
          type="button"
          onClick={() => {
            if (committed) return
            setCommitted(true)
            onCommit()
          }}
        >
          {committed ? "Committed" : "Commit"}
        </button>
      )
    }
    const artifactsWithStatefulChild: ReadonlyArray<SwitchableArtifact> = [
      ARTIFACTS[0]!,
      { id: "optionSet", label: "Choice", content: <CommitOnce /> },
    ]
    render(
      <ArtifactSwitcher
        artifacts={artifactsWithStatefulChild}
        roundId="round-1"
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Next artifact" }))
    fireEvent.click(screen.getByRole("button", { name: "Commit" }))
    expectCurrent(screen.getByRole("button", { name: "Committed" }))
    expect(onCommit).toHaveBeenCalledOnce()

    // Away, and back — a remounted `CommitOnce` would show "Commit" again.
    fireEvent.click(screen.getByRole("button", { name: "Previous artifact" }))
    fireEvent.click(screen.getByRole("button", { name: "Next artifact" }))

    expectCurrent(screen.getByRole("button", { name: "Committed" }))
    // And a fresh instance would also let this fire a second time for the
    // same round — the double-commit risk the review finding named.
    fireEvent.click(screen.getByRole("button", { name: "Committed" }))
    expect(onCommit).toHaveBeenCalledOnce()
  })

  it("remounts a child's local state on round advance, even when the first artifact's id is unchanged — round 2 of the same review finding", () => {
    const CommitOnce: FC = () => {
      const [committed, setCommitted] = useState(false)
      return (
        <button type="button" onClick={() => setCommitted(true)}>
          {committed ? "Committed" : "Commit"}
        </button>
      )
    }
    // The realistic shape: `algorithm` is first in both rounds, the same
    // way it is every round — this is exactly the case a plain
    // `key={artifact.id}` reconciles across the round boundary instead of
    // remounting, since the id at position 0 never changes.
    const artifactsWithStatefulFirst: ReadonlyArray<SwitchableArtifact> = [
      { id: "algorithm", label: "Algorithm", content: <CommitOnce /> },
      ARTIFACTS[1]!,
    ]
    const { rerender } = render(
      <ArtifactSwitcher
        artifacts={artifactsWithStatefulFirst}
        roundId="round-1"
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Commit" }))
    expectCurrent(screen.getByRole("button", { name: "Committed" }))

    rerender(
      <ArtifactSwitcher
        artifacts={artifactsWithStatefulFirst}
        roundId="round-2"
      />
    )
    expectCurrent(screen.getByRole("button", { name: "Commit" }))
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
      expectCurrent(screen.getByText(`content: ${id}`))
      fireEvent.click(screen.getByRole("button", { name: "Next artifact" }))
    }
    // One press past the last artifact does nothing further — "Next" is
    // already disabled at the end, the same boundary every other test
    // exercises with a shorter set.
    expect(screen.getByRole("button", { name: "Next artifact" })).toBeDisabled()
    expectCurrent(screen.getByText("content: runResult"))
    // Every one of the six was visited, so all six are mounted by now — but
    // only the last is visible, "exactly one load-bearing" holding even at
    // the full width of the real set.
    for (const id of ALL_ARTIFACT_IDS.slice(0, -1)) {
      expectAway(screen.getByText(`content: ${id}`))
    }
  })

  it("names every artifact in a tab and marks the current one", () => {
    render(<ArtifactSwitcher artifacts={ARTIFACTS} roundId="round-1" />)
    const tabs = screen.getAllByRole("tab")
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Algorithm",
      "Constraints",
      "Budget",
    ])
    expect(tabs[0]).toHaveAttribute("aria-selected", "true")
    expect(tabs[1]).toHaveAttribute("aria-selected", "false")
    // Each tab names its own panel, and the panel is labelled by it.
    const panel = slotOf(screen.getByText("Source of A"))
    expect(tabs[0]).toHaveAttribute("aria-controls", panel.id)
    expect(panel).toHaveAttribute("aria-labelledby", tabs[0]!.id)
  })

  it("moves straight to an artifact on a tab press", () => {
    render(<ArtifactSwitcher artifacts={ARTIFACTS} roundId="round-1" />)
    fireEvent.click(screen.getByRole("tab", { name: "Budget" }))
    expectCurrent(screen.getByText("Operation count"))
    expect(screen.getByRole("tab", { name: "Budget" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
  })

  it("moves between tabs with the arrow, Home and End keys, taking focus along", () => {
    render(<ArtifactSwitcher artifacts={ARTIFACTS} roundId="round-1" />)
    const first = screen.getByRole("tab", { name: "Algorithm" })
    first.focus()
    fireEvent.keyDown(first, { key: "ArrowRight" })
    expectCurrent(screen.getByText("C to C′"))
    expect(screen.getByRole("tab", { name: "Constraints" })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: "End" })
    expectCurrent(screen.getByText("Operation count"))
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" })
    expectCurrent(screen.getByText("Operation count"))
    fireEvent.keyDown(document.activeElement!, { key: "Home" })
    expectCurrent(screen.getByText("Source of A"))
  })

  it("follows a swipe: the pager coming to rest on a page makes that artifact current", () => {
    const { container } = render(
      <ArtifactSwitcher artifacts={ARTIFACTS} roundId="round-1" />
    )
    const pager = pagerOf(container)
    settleOn(pager, 1)
    expectCurrent(screen.getByText("C to C′"))
    settleOn(pager, 2)
    expectCurrent(screen.getByText("Operation count"))
    settleOn(pager, 0)
    expectCurrent(screen.getByText("Source of A"))
    expect(
      screen.getByText("Round artifact: Algorithm, 1 of 3")
    ).toBeInTheDocument()
  })

  it("scrolls the pager to the artifact a press chose", () => {
    const { container } = render(
      <ArtifactSwitcher artifacts={ARTIFACTS} roundId="round-1" />
    )
    const pager = pagerOf(container)
    const scrollTo = vi.fn()
    stubScrollTo(pager, scrollTo)
    fireEvent.click(screen.getByRole("tab", { name: "Budget" }))
    expect(scrollTo).toHaveBeenLastCalledWith(
      expect.objectContaining({ left: 720 })
    )
  })

  it("does not scroll the pager back to where a swipe already left it", () => {
    const { container } = render(
      <ArtifactSwitcher artifacts={ARTIFACTS} roundId="round-1" />
    )
    const pager = pagerOf(container)
    const scrollTo = vi.fn()
    stubScrollTo(pager, scrollTo)
    settleOn(pager, 1)
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it("jumps rather than scrolls back to the first artifact on a round advance", () => {
    const { container, rerender } = render(
      <ArtifactSwitcher artifacts={ARTIFACTS} roundId="round-1" />
    )
    const pager = pagerOf(container)
    settleOn(pager, 2)
    const scrollTo = vi.fn()
    stubScrollTo(pager, scrollTo)
    rerender(<ArtifactSwitcher artifacts={ARTIFACTS} roundId="round-2" />)
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: "instant" })
  })

  it("ignores the pages a press's own scroll passes on its way", () => {
    const { container } = render(
      <ArtifactSwitcher artifacts={ARTIFACTS} roundId="round-1" />
    )
    const pager = pagerOf(container)
    stubScrollTo(pager, vi.fn())
    fireEvent.click(screen.getByRole("tab", { name: "Budget" }))
    // The smooth scroll's first steps still rest nearest the first page.
    settleOn(pager, 0)
    expectCurrent(screen.getByText("Operation count"))
    settleOn(pager, 1)
    expectCurrent(screen.getByText("Operation count"))
    // Arrived: from here a scroll is a swipe again.
    settleOn(pager, 2)
    settleOn(pager, 1)
    expectCurrent(screen.getByText("C to C′"))
  })

  it("hands the pager back to a finger that takes it over mid-scroll", () => {
    const { container } = render(
      <ArtifactSwitcher artifacts={ARTIFACTS} roundId="round-1" />
    )
    const pager = pagerOf(container)
    stubScrollTo(pager, vi.fn())
    fireEvent.click(screen.getByRole("tab", { name: "Budget" }))
    fireEvent.pointerDown(pager)
    settleOn(pager, 1)
    expectCurrent(screen.getByText("C to C′"))
  })

  it("takes wherever the pager comes to rest as current, even short of a press's target", () => {
    const { container } = render(
      <ArtifactSwitcher artifacts={ARTIFACTS} roundId="round-1" />
    )
    const pager = pagerOf(container)
    stubScrollTo(pager, vi.fn())
    fireEvent.click(screen.getByRole("tab", { name: "Budget" }))
    // The press's scroll stops on the middle page instead of the third.
    settleOn(pager, 1)
    expectCurrent(screen.getByText("Operation count"))
    fireEvent(pager, new Event("scrollend"))
    expectCurrent(screen.getByText("C to C′"))
    expect(screen.getByRole("tab", { name: "Constraints" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
  })
})
