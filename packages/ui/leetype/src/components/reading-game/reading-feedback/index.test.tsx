import { ReadingFeedback } from "@leetype/components/reading-game/reading-feedback"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

describe("ReadingFeedback", () => {
  it("carries the author's own reason under a 'Why' eyebrow", () => {
    render(
      <ReadingFeedback justification="Only an early return avoids the undefined division." />
    )
    expect(screen.getByText("Why")).toBeInTheDocument()
    expect(
      screen.getByText("Only an early return avoids the undefined division.")
    ).toBeInTheDocument()
  })

  // The verdict lives on the option rows, where the learner's eye already is.
  // Saying it again here would leave this panel reading as a score card
  // rather than as the thing worth reading.
  it("renders no verdict of its own", () => {
    const { container } = render(<ReadingFeedback justification="Because." />)
    expect(container.textContent).not.toMatch(/correct|not quite|wrong|right/i)
  })
})
