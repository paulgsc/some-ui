import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { QuizIdle } from "."

describe("QuizIdle", () => {
  it("shows the 'conversation playing' hint while the chat is running", () => {
    render(<QuizIdle chatPlayState="running" />)
    expect(screen.getByText(/conversation playing/i)).toBeInTheDocument()
  })

  it("prompts the learner to press Play while paused, with no playing hint", () => {
    render(<QuizIdle chatPlayState="paused" />)
    expect(
      screen.getByText(/click play in the chat panel/i)
    ).toBeInTheDocument()
    expect(screen.queryByText(/conversation playing/i)).not.toBeInTheDocument()
  })
})
