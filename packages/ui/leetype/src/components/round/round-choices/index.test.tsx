import { RoundChoices } from "@leetype/components/round/round-choices"
import type { PropositionOption } from "@leetype/lib/leetype/round-probe"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const OPTIONS: ReadonlyArray<PropositionOption> = [
  { id: "CW-P1", text: "Sequential composition adds" },
  { id: "CW-P2", text: "Nested repetition multiplies" },
  { id: "CW-P3", text: "The dominant term survives" },
]

const PROMPT = "Which proposition does this diff witness?"

describe("RoundChoices", () => {
  it("renders every option plus an always-present abstention, all as buttons", () => {
    render(
      <RoundChoices
        prompt={PROMPT}
        options={OPTIONS}
        answerId="CW-P1"
        onCommit={vi.fn()}
      />
    )
    expect(screen.getByText(PROMPT)).toBeInTheDocument()
    for (const option of OPTIONS) {
      expect(screen.getByText(option.text)).toBeInTheDocument()
    }
    expect(
      screen.getByRole("button", { name: /not sure/i })
    ).toBeInTheDocument()
    expect(screen.getAllByRole("button")).toHaveLength(OPTIONS.length + 1)
  })

  // Before any tap the component is never handed the answer for paint —
  // there is no render in which it holds one and merely declines to
  // paint it.
  it("reveals nothing about correctness before a commitment lands", () => {
    render(
      <RoundChoices
        prompt={PROMPT}
        options={OPTIONS}
        answerId="CW-P1"
        onCommit={vi.fn()}
      />
    )
    expect(screen.queryByText("Correct")).not.toBeInTheDocument()
    expect(screen.queryByText("Not this one")).not.toBeInTheDocument()
    expect(
      screen
        .getAllByRole("button")
        .every((button) => !button.hasAttribute("disabled"))
    ).toBe(true)
  })

  it("commits and reveals immediately on tap — no separate submit step", () => {
    const onCommit = vi.fn()
    render(
      <RoundChoices
        prompt={PROMPT}
        options={OPTIONS}
        answerId="CW-P2"
        onCommit={onCommit}
      />
    )
    fireEvent.click(screen.getByText("Nested repetition multiplies"))
    expect(onCommit).toHaveBeenCalledExactlyOnceWith({
      kind: "choice",
      id: "CW-P2",
    })
    expect(screen.getByText("Correct")).toBeInTheDocument()
  })

  it("marks the answer and the missed pick in words, not colour alone", () => {
    render(
      <RoundChoices
        prompt={PROMPT}
        options={OPTIONS}
        answerId="CW-P1"
        onCommit={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText("Nested repetition multiplies"))
    expect(screen.getByText("Correct")).toBeInTheDocument()
    expect(screen.getByText("Not this one")).toBeInTheDocument()
    expect(screen.getAllByText(/^Correct$|^Not this one$/)).toHaveLength(2)
  })

  it("says only 'Correct' when the tapped row is the answer", () => {
    render(
      <RoundChoices
        prompt={PROMPT}
        options={OPTIONS}
        answerId="CW-P1"
        onCommit={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText("Sequential composition adds"))
    expect(screen.getByText("Correct")).toBeInTheDocument()
    expect(screen.queryByText("Not this one")).not.toBeInTheDocument()
  })

  // #1220's own acceptance criterion: abstention is an answer, not a
  // forfeit — the learner still sees the answer's row marked correct.
  it("abstention still reveals the answer's row as correct, with no 'Not this one' anywhere", () => {
    const onCommit = vi.fn()
    render(
      <RoundChoices
        prompt={PROMPT}
        options={OPTIONS}
        answerId="CW-P3"
        onCommit={onCommit}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /not sure/i }))
    expect(onCommit).toHaveBeenCalledExactlyOnceWith({ kind: "abstain" })
    expect(
      screen.getByText("The dominant term survives").closest("button")
    ).toHaveTextContent("Correct")
    expect(screen.queryByText("Not this one")).not.toBeInTheDocument()
  })

  it("locks every row once a commitment lands — a second tap changes nothing", () => {
    const onCommit = vi.fn()
    render(
      <RoundChoices
        prompt={PROMPT}
        options={OPTIONS}
        answerId="CW-P1"
        onCommit={onCommit}
      />
    )
    fireEvent.click(screen.getByText("Sequential composition adds"))
    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled()
    }
    fireEvent.click(screen.getByText("Nested repetition multiplies"))
    expect(onCommit).toHaveBeenCalledTimes(1)
  })
})
