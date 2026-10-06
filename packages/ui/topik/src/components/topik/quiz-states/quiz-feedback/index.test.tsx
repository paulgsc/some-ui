import type { ComponentProps, JSX } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { QuizFeedback } from "."

const feedback = (
  props: Partial<ComponentProps<typeof QuizFeedback>> = {}
): JSX.Element => (
  <QuizFeedback
    isCorrect
    onNextQuestion={vi.fn()}
    questionNumber={1}
    totalQuestions={5}
    questionType="multiple-choice"
    explanation="explanation text"
    {...props}
  />
)

describe("QuizFeedback - answer comparison", () => {
  it("shows the user's answer next to the correct one for an incorrect text-input question", () => {
    render(
      feedback({
        isCorrect: false,
        questionType: "text-input",
        userAnswer: "goodbye",
        correctAnswer: "thank you",
      })
    )

    expect(screen.getByText("goodbye")).toBeInTheDocument()
    expect(screen.getByText("thank you")).toBeInTheDocument()
  })

  it("hides the answer comparison for a correct answer", () => {
    render(
      feedback({
        questionType: "text-input",
        userAnswer: "thank you",
        correctAnswer: "thank you",
      })
    )

    expect(screen.queryByText("Your Answer")).not.toBeInTheDocument()
  })
})

describe("QuizFeedback - action button", () => {
  it("reads 'Next Question' before the last question and 'View Results' on it", () => {
    const { rerender } = render(feedback({ questionNumber: 2 }))
    expect(
      screen.getByRole("button", { name: /next question/i })
    ).toBeInTheDocument()

    rerender(feedback({ questionNumber: 5 }))
    expect(
      screen.getByRole("button", { name: /view results/i })
    ).toBeInTheDocument()
  })

  it("calls onNextQuestion when the action button is clicked", () => {
    const onNextQuestion = vi.fn()
    render(feedback({ onNextQuestion }))

    fireEvent.click(screen.getByRole("button"))
    expect(onNextQuestion).toHaveBeenCalledTimes(1)
  })
})
