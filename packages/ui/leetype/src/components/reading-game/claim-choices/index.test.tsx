import { ClaimChoices } from "@leetype/components/reading-game/claim-choices"
import type { ReadingOption } from "@leetype/lib/leetype/reading-probe"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const OPTIONS: ReadonlyArray<ReadingOption> = [
  { id: "a", text: "Revoked sessions can no longer authenticate" },
  { id: "b", text: "Expired sessions are now automatically renewed" },
  { id: "c", text: "Session lookup failures are ignored" },
]

const PROMPT = "What invariant does this change add?"

describe("ClaimChoices", () => {
  it("is a real radio group, so keyboard and assistive tech get it for free", () => {
    render(
      <ClaimChoices
        prompt={PROMPT}
        options={OPTIONS}
        selectedId={null}
        onSelect={vi.fn()}
        answerId={null}
      />
    )
    expect(screen.getByRole("group", { name: PROMPT })).toBeInTheDocument()
    expect(screen.getAllByRole("radio")).toHaveLength(3)
  })

  it("makes the whole row the tap target", () => {
    const onSelect = vi.fn()
    render(
      <ClaimChoices
        prompt={PROMPT}
        options={OPTIONS}
        selectedId={null}
        onSelect={onSelect}
        answerId={null}
      />
    )
    // Clicking the label's text, not the (visually hidden) input, is what a
    // thumb actually does.
    fireEvent.click(screen.getByText(OPTIONS[1]!.text))
    expect(onSelect).toHaveBeenCalledWith("b")
  })

  // Before submission the component is never handed an answer at all — there
  // is no render in which it holds one and merely declines to paint it.
  it("reveals nothing about correctness before the player answers", () => {
    render(
      <ClaimChoices
        prompt={PROMPT}
        options={OPTIONS}
        selectedId="b"
        onSelect={vi.fn()}
        answerId={null}
      />
    )
    expect(screen.queryByText("Correct")).not.toBeInTheDocument()
    expect(screen.queryByText("Not this one")).not.toBeInTheDocument()
    expect(
      screen
        .getAllByRole("radio")
        .every((radio) => !radio.hasAttribute("disabled"))
    ).toBe(true)
  })

  it("marks the answer and the missed pick in words, not colour alone", () => {
    render(
      <ClaimChoices
        prompt={PROMPT}
        options={OPTIONS}
        selectedId="b"
        onSelect={vi.fn()}
        answerId="a"
      />
    )
    expect(screen.getByText("Correct")).toBeInTheDocument()
    expect(screen.getByText("Not this one")).toBeInTheDocument()
    // Nothing is said about the option the player neither picked nor needed.
    expect(screen.getAllByText(/Correct|Not this one/)).toHaveLength(2)
  })

  it("says only 'Correct' when the player picked the answer", () => {
    render(
      <ClaimChoices
        prompt={PROMPT}
        options={OPTIONS}
        selectedId="a"
        onSelect={vi.fn()}
        answerId="a"
      />
    )
    expect(screen.getByText("Correct")).toBeInTheDocument()
    expect(screen.queryByText("Not this one")).not.toBeInTheDocument()
  })

  it("locks the group once answered, so an answered card cannot be re-picked", () => {
    render(
      <ClaimChoices
        prompt={PROMPT}
        options={OPTIONS}
        selectedId="a"
        onSelect={vi.fn()}
        answerId="a"
      />
    )
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).toBeDisabled()
    }
  })
})
