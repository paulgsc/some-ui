import type { JSX } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { QuizActive } from "."

const MULTIPLE_CHOICE_QUESTION = {
  type: "multiple-choice" as const,
  korean: "안녕하세요",
  question: "What does this greeting mean?",
  options: ["Hello", "Goodbye", "Thank you"],
  correct: 0,
  correctAnswer: "Hello",
  explanation: "It's a standard greeting.",
}

const TEXT_INPUT_QUESTION = {
  type: "text-input" as const,
  korean: "감사합니다",
  question: "Translate this phrase.",
  acceptedAnswers: ["thank you", "thanks"],
  correctAnswer: "thank you",
  explanation: "A common phrase of gratitude.",
}

function renderQuizActive(
  question: typeof MULTIPLE_CHOICE_QUESTION | typeof TEXT_INPUT_QUESTION
): {
  onAnswerSubmit: ReturnType<typeof vi.fn>
  onSpeakMessage: ReturnType<typeof vi.fn>
  container: HTMLElement
  rerenderSpeaking: (nextIsSpeaking: boolean) => void
} {
  const onAnswerSubmit = vi.fn()
  const onSpeakMessage = vi.fn()
  const quiz = (isSpeaking: boolean): JSX.Element => (
    <QuizActive
      questionNumber={1}
      totalQuestions={5}
      question={question}
      isSpeaking={isSpeaking}
      onSpeakMessage={onSpeakMessage}
      onAnswerSubmit={onAnswerSubmit}
    />
  )
  const { container, rerender } = render(quiz(false))
  const rerenderSpeaking = (next: boolean): void => rerender(quiz(next))
  return { onAnswerSubmit, onSpeakMessage, container, rerenderSpeaking }
}

const checkAnswer = (): HTMLElement =>
  screen.getByRole("button", { name: /check answer/i })

describe("QuizActive - multiple-choice answer-submit branch", () => {
  it("disables Check Answer until an option is selected", () => {
    renderQuizActive(MULTIPLE_CHOICE_QUESTION)
    expect(checkAnswer()).toBeDisabled()
  })

  it.each([
    ["the correct option with isCorrect=true", "Hello", true],
    ["a wrong option with isCorrect=false", "Goodbye", false],
  ])("submits %s", (_, option, correct) => {
    const { onAnswerSubmit } = renderQuizActive(MULTIPLE_CHOICE_QUESTION)

    fireEvent.click(screen.getByText(option).closest("button")!)
    fireEvent.click(checkAnswer())

    expect(onAnswerSubmit).toHaveBeenCalledWith(correct, option)
  })
})

describe("QuizActive - text-input answer-submit branch", () => {
  it("disables Check Answer until text is entered", () => {
    renderQuizActive(TEXT_INPUT_QUESTION)
    expect(checkAnswer()).toBeDisabled()
  })

  it.each([
    [
      "normalizes case/punctuation/whitespace when matching accepted answers",
      "  THANK YOU!  ",
      true,
    ],
    ["marks an answer outside acceptedAnswers as incorrect", "goodbye", false],
  ])("%s", (_, value, correct) => {
    const { onAnswerSubmit } = renderQuizActive(TEXT_INPUT_QUESTION)

    fireEvent.change(screen.getByPlaceholderText(/type your answer here/i), {
      target: { value },
    })
    fireEvent.click(checkAnswer())

    expect(onAnswerSubmit).toHaveBeenCalledWith(correct, value)
  })

  it("submits on Enter but not on Shift+Enter", () => {
    const { onAnswerSubmit } = renderQuizActive(TEXT_INPUT_QUESTION)
    const textarea = screen.getByPlaceholderText(/type your answer here/i)

    fireEvent.change(textarea, { target: { value: "thanks" } })
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true })
    expect(onAnswerSubmit).not.toHaveBeenCalled()

    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false })
    expect(onAnswerSubmit).toHaveBeenCalledWith(true, "thanks")
  })
})

describe("QuizActive - speak button", () => {
  it("speaks the Korean context and disables itself while already speaking", () => {
    const { container, onSpeakMessage, rerenderSpeaking } = renderQuizActive(
      MULTIPLE_CHOICE_QUESTION
    )

    const speakButton = container.querySelector("button.flex-shrink-0")!
    fireEvent.click(speakButton)

    expect(onSpeakMessage).toHaveBeenCalledTimes(1)
    expect(onSpeakMessage.mock.calls[0]?.[0]).toMatchObject({
      korean: MULTIPLE_CHOICE_QUESTION.korean,
    })

    rerenderSpeaking(true)
    expect(container.querySelector("button.flex-shrink-0")).toBeDisabled()
  })
})
