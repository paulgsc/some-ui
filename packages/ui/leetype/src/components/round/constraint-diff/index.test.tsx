import type { ConstraintDiff as ConstraintDiffValue } from "@leetype/types/constraint"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ConstraintDiff } from "."

describe("ConstraintDiff", () => {
  const mixedDiff: ConstraintDiffValue = {
    before: [
      { dimension: "n", operator: "<=", bound: 100000 },
      { dimension: "m", operator: "<=", bound: 100 },
    ],
    after: [
      { dimension: "n", operator: "<=", bound: 200000 },
      { dimension: "m", operator: "<=", bound: 100 },
    ],
  }

  it("renders a changed dimension as a removed row immediately followed by an added row", () => {
    const { container } = render(<ConstraintDiff diff={mixedDiff} />)
    const kinds = [...container.querySelectorAll("[data-line-kind]")].map(
      (row) => row.getAttribute("data-line-kind")
    )
    expect(kinds).toEqual(["del", "add", "context"])
  })

  it("renders the old bound on the removed row and the new bound on the added row, thousands-separated", () => {
    render(<ConstraintDiff diff={mixedDiff} />)
    expect(screen.getByText("n ≤ 100,000")).toBeInTheDocument()
    expect(screen.getByText("n ≤ 200,000")).toBeInTheDocument()
  })

  it("renders an unchanged dimension once, as context", () => {
    render(<ConstraintDiff diff={mixedDiff} />)
    expect(screen.getByText("m ≤ 100")).toBeInTheDocument()
  })

  it("renders a tightened bound with its own operator's mathematical symbol", () => {
    const diff: ConstraintDiffValue = {
      before: [{ dimension: "k", operator: ">=", bound: 1 }],
      after: [{ dimension: "k", operator: ">=", bound: 4 }],
    }
    render(<ConstraintDiff diff={diff} />)
    expect(screen.getByText("k ≥ 1")).toBeInTheDocument()
    expect(screen.getByText("k ≥ 4")).toBeInTheDocument()
  })

  it("announces removed and added rows to a screen reader", () => {
    render(<ConstraintDiff diff={mixedDiff} />)
    expect(screen.getByText("old bound:")).toBeInTheDocument()
    expect(screen.getByText("new bound:")).toBeInTheDocument()
  })

  // Isolates the context-row rendering path from the del/add pairing above,
  // constructed directly (bypassing `ConstraintDiffSchema`, which requires
  // at least one bound to differ) purely to exercise a card with no changed
  // rows at all — the component itself does not re-enforce that invariant,
  // the schema does.
  it("carries no sr-only announcement when every row is context", () => {
    const unchangedOnly: ConstraintDiffValue = {
      before: [{ dimension: "n", operator: "<=", bound: 100000 }],
      after: [{ dimension: "n", operator: "<=", bound: 100000 }],
    }
    const { container } = render(<ConstraintDiff diff={unchangedOnly} />)
    expect(container.textContent).not.toContain("old bound:")
    expect(container.textContent).not.toContain("new bound:")
  })
})
