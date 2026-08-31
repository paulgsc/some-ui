import type { FC } from "react"
import type { Commitment, CommitmentOption } from "@leetype/types/commitment"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { CommitmentControl } from "."

const OPTIONS: ReadonlyArray<CommitmentOption> = [
  { id: "correct", label: "Correct" },
  { id: "incorrect", label: "Incorrect" },
]

/**
 * Calls `onRender` synchronously during its own render — not in an effect —
 * so a test can prove *when* a reveal actually painted relative to some
 * other event, not just that it eventually did.
 */
const RevealProbe: FC<{ onRender: () => void }> = ({ onRender }) => {
  onRender()
  return <div data-testid="reveal">Answer</div>
}

describe("CommitmentControl", () => {
  it("renders the closed set plus an always-present abstention, no reveal yet", () => {
    render(<CommitmentControl options={OPTIONS} onCommit={vi.fn()} />)
    expect(screen.getByRole("button", { name: "Correct" })).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Incorrect" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /not sure/i })
    ).toBeInTheDocument()
    expect(screen.queryByTestId("reveal")).not.toBeInTheDocument()
  })

  it("styles abstention identically to a real option — same size, same weight, no muted affordance", () => {
    render(<CommitmentControl options={OPTIONS} onCommit={vi.fn()} />)
    const real = screen.getByRole("button", { name: "Correct" })
    const abstain = screen.getByRole("button", { name: /not sure/i })
    // Same class list modulo the icon markup abstention alone carries —
    // asserted structurally (same base classes) rather than by snapshot, so
    // this fails loudly if a future edit gives abstention its own, smaller
    // treatment instead of composing it from the same option classes.
    expect(abstain.className).toBe(real.className)
    expect(abstain.className).toMatch(/min-h-11/)
    expect(real.className).toMatch(/min-h-11/)
  })

  it("records the commitment before the reveal renders — the one place the whole assessment's validity lives", () => {
    const order: Array<string> = []
    const onCommit = vi.fn((commitment: Commitment) => {
      order.push(`commit:${commitment.kind}`)
    })
    render(
      <CommitmentControl
        options={OPTIONS}
        onCommit={onCommit}
        reveal={<RevealProbe onRender={() => order.push("reveal")} />}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Correct" }))

    expect(order).toEqual(["commit:choice", "reveal"])
  })

  it("reveals immediately on any commitment, abstention included — no confirmation, no delay", () => {
    render(
      <CommitmentControl
        options={OPTIONS}
        onCommit={vi.fn()}
        reveal={<div data-testid="reveal">Answer</div>}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /not sure/i }))
    expect(screen.getByTestId("reveal")).toBeInTheDocument()
  })

  it("emits abstention as its own observation — never null, never folded into a choice", () => {
    const onCommit = vi.fn()
    render(<CommitmentControl options={OPTIONS} onCommit={onCommit} />)
    fireEvent.click(screen.getByRole("button", { name: /not sure/i }))
    expect(onCommit).toHaveBeenCalledExactlyOnceWith({ kind: "abstain" })
  })

  it("passes a real choice's id through unchanged", () => {
    const onCommit = vi.fn()
    render(<CommitmentControl options={OPTIONS} onCommit={onCommit} />)
    fireEvent.click(screen.getByRole("button", { name: "Incorrect" }))
    expect(onCommit).toHaveBeenCalledExactlyOnceWith({
      kind: "choice",
      id: "incorrect",
    })
  })

  it("is a single, one-shot action — a second tap after committing changes nothing", () => {
    const onCommit = vi.fn()
    render(<CommitmentControl options={OPTIONS} onCommit={onCommit} />)
    fireEvent.click(screen.getByRole("button", { name: "Correct" }))
    // Every option, abstention included, is disabled once committed — the
    // control itself, not caller discipline, is what makes the tap single.
    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled()
    }
    fireEvent.click(screen.getByRole("button", { name: "Incorrect" }))
    expect(onCommit).toHaveBeenCalledTimes(1)
  })
})
