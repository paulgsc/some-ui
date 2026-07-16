import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { QuizReady } from "."

describe("QuizReady", () => {
  it("calls onStartQuiz when the Begin Assessment button is clicked", () => {
    const onStartQuiz = vi.fn()
    render(<QuizReady onStartQuiz={onStartQuiz} />)

    fireEvent.click(screen.getByRole("button", { name: /begin assessment/i }))

    expect(onStartQuiz).toHaveBeenCalledTimes(1)
  })
})
