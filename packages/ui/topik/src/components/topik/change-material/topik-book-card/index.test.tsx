import type { TopikMetadata } from "@topik/lib/topik"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { TopikBookCard } from "."

function makeItem(overrides: Partial<TopikMetadata> = {}): TopikMetadata {
  return {
    key: "topik-1",
    displayName: "TOPIK 1 - Basics",
    description: "Introductory material.",
    batchCount: 3,
    totalQuestions: 12,
    totalMessages: 24,
    ...overrides,
  }
}

describe("TopikBookCard", () => {
  it("renders the display name, description, and stats", () => {
    render(<TopikBookCard item={makeItem()} />)
    expect(screen.getByText("TOPIK 1 - Basics")).toBeInTheDocument()
    expect(screen.getByText("Introductory material.")).toBeInTheDocument()
    expect(screen.getByText("3")).toBeInTheDocument()
    expect(screen.getByText("12")).toBeInTheDocument()
  })

  it("calls onClick when clicked", () => {
    const onClick = vi.fn()
    render(<TopikBookCard item={makeItem()} onClick={onClick} />)
    fireEvent.click(screen.getByRole("button"))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("shows a difficulty badge only when difficulty is set", () => {
    const { rerender } = render(
      <TopikBookCard item={makeItem({ difficulty: "beginner" })} />
    )
    expect(screen.getByText("beginner")).toBeInTheDocument()

    rerender(<TopikBookCard item={makeItem({ difficulty: undefined })} />)
    expect(screen.queryByText("beginner")).not.toBeInTheDocument()
  })

  it("hides the description in the 'recommended' variant", () => {
    render(<TopikBookCard item={makeItem()} variant="recommended" />)
    expect(screen.queryByText("Introductory material.")).not.toBeInTheDocument()
  })
})
