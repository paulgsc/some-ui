import { RoundFeedback } from "@leetype/components/round/round-feedback"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

describe("RoundFeedback", () => {
  it("carries the register's own statement under a 'Why' eyebrow", () => {
    render(
      <RoundFeedback justification="Sibling control flow executed in sequence contributes the sum of its members' costs." />
    )
    expect(screen.getByText("Why")).toBeInTheDocument()
    expect(
      screen.getByText(
        "Sibling control flow executed in sequence contributes the sum of its members' costs."
      )
    ).toBeInTheDocument()
  })

  it("renders no verdict of its own", () => {
    const { container } = render(<RoundFeedback justification="Because." />)
    expect(container.textContent).not.toMatch(/correct|not quite|wrong|right/i)
  })

  it("renders nothing extra when no gloss is authored", () => {
    render(<RoundFeedback justification="The general claim." />)
    expect(screen.queryByText(/this hunk/i)).not.toBeInTheDocument()
  })

  it("renders an authored gloss beneath the register statement, never instead of it", () => {
    render(
      <RoundFeedback
        justification="The general claim, stated generally."
        gloss="This hunk instantiates it by trading a linear search for a preprocessing pass."
      />
    )
    expect(
      screen.getByText("The general claim, stated generally.")
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "This hunk instantiates it by trading a linear search for a preprocessing pass."
      )
    ).toBeInTheDocument()
  })
})
