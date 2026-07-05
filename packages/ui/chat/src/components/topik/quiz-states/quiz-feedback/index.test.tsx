import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { QuizFeedback } from "."

describe("QuizFeedback - answer comparison", () => {
  it("shows the user's answer next to the correct one for an incorrect text-input question", () => {
    render(
      <QuizFeedback
        isCorrect={false}
        onNextQuestion={vi.fn()}
        questionNumber={1}
        totalQuestions={5}
        questionType="text-input"
        userAnswer="goodbye"
        correctAnswer="thank you"
        explanation="explanation text"
      />
    )

    expect(screen.getByText("goodbye")).toBeInTheDocument()
    expect(screen.getByText("thank you")).toBeInTheDocument()
  })

  it("hides the answer comparison for a correct answer", () => {
    render(
      <QuizFeedback
        isCorrect
        onNextQuestion={vi.fn()}
        questionNumber={1}
        totalQuestions={5}
        questionType="text-input"
        userAnswer="thank you"
        correctAnswer="thank you"
        explanation="explanation text"
      />
    )

    expect(screen.queryByText("Your Answer")).not.toBeInTheDocument()
  })
})

describe("QuizFeedback - action button", () => {
  it("reads 'Next Question' before the last question and 'View Results' on it", () => {
    const { rerender } = render(
      <QuizFeedback
        isCorrect
        onNextQuestion={vi.fn()}
        questionNumber={2}
        totalQuestions={5}
        questionType="multiple-choice"
        explanation="explanation text"
      />
    )
    expect(
      screen.getByRole("button", { name: /next question/i })
    ).toBeInTheDocument()

    rerender(
      <QuizFeedback
        isCorrect
        onNextQuestion={vi.fn()}
        questionNumber={5}
        totalQuestions={5}
        questionType="multiple-choice"
        explanation="explanation text"
      />
    )
    expect(
      screen.getByRole("button", { name: /view results/i })
    ).toBeInTheDocument()
  })

  it("calls onNextQuestion when the action button is clicked", () => {
    const onNextQuestion = vi.fn()
    render(
      <QuizFeedback
        isCorrect
        onNextQuestion={onNextQuestion}
        questionNumber={1}
        totalQuestions={5}
        questionType="multiple-choice"
        explanation="explanation text"
      />
    )

    fireEvent.click(screen.getByRole("button"))
    expect(onNextQuestion).toHaveBeenCalledTimes(1)
  })
})
