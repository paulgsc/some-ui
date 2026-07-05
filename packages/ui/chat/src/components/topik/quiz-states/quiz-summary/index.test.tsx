import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { QuizSummary } from "."

describe("QuizSummary - pass/fail thresholds", () => {
  it("passes at exactly 70% and calls onAssessmentComplete(true) on continue", () => {
    const onAssessmentComplete = vi.fn()
    render(
      <QuizSummary
        score={7}
        totalQuestions={10}
        onAssessmentComplete={onAssessmentComplete}
      />
    )

    expect(screen.getByText(/assessment passed/i)).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole("button", { name: /continue to next conversation/i })
    )
    expect(onAssessmentComplete).toHaveBeenCalledWith(true)
  })

  it("fails below 70% and calls onAssessmentComplete(false) on retry", () => {
    const onAssessmentComplete = vi.fn()
    render(
      <QuizSummary
        score={6}
        totalQuestions={10}
        onAssessmentComplete={onAssessmentComplete}
      />
    )

    expect(
      screen.getByRole("heading", { name: /keep practicing/i })
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /retry conversation/i }))
    expect(onAssessmentComplete).toHaveBeenCalledWith(false)
  })

  it("labels 80%+ as Advanced and 70-79% as Intermediate", () => {
    const { rerender } = render(
      <QuizSummary
        score={8}
        totalQuestions={10}
        onAssessmentComplete={vi.fn()}
      />
    )
    expect(screen.getByText(/advanced level/i)).toBeInTheDocument()

    rerender(
      <QuizSummary
        score={7}
        totalQuestions={10}
        onAssessmentComplete={vi.fn()}
      />
    )
    expect(screen.getByText(/intermediate level/i)).toBeInTheDocument()
  })
})
