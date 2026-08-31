import type { Budget } from "@leetype/types/constraint"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { BudgetDisplay } from "."

describe("BudgetDisplay", () => {
  it("renders the operation count, thousands-separated", () => {
    const budget: Budget = { operations: 10_000_000 }
    render(<BudgetDisplay budget={budget} />)
    expect(screen.getByText(/10,000,000 operations/)).toBeInTheDocument()
  })

  it("renders the wall-clock annotation when the budget carries one", () => {
    const budget: Budget = { operations: 10_000_000, wallClock: "~1 second" }
    render(<BudgetDisplay budget={budget} />)
    expect(screen.getByText(/~1 second/)).toBeInTheDocument()
  })

  it("omits any wall-clock text when the budget carries none", () => {
    const budget: Budget = { operations: 10_000_000 }
    const { container } = render(<BudgetDisplay budget={budget} />)
    expect(container.textContent).not.toContain("(~")
  })

  // R2's own acceptance criterion, word for word: "not in a tooltip a
  // learner may never open." The coarseness statement has to be present in
  // the rendered DOM on a bare mount — no click, no hover, no aria-describedby
  // indirection to a `title` attribute a learner would have to discover.
  it("renders the coarseness statement unconditionally, on a bare mount", () => {
    const budget: Budget = { operations: 10_000_000 }
    const { container } = render(<BudgetDisplay budget={budget} />)
    expect(container.querySelector("[title]")).toBeNull()
    expect(container.textContent).toContain("not a promise about a machine")
    expect(container.textContent).toContain("no constant factor")
  })
})
