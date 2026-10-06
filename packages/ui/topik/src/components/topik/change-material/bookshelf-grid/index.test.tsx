import type { ComponentProps, JSX } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import type { TopikMetadata } from "@topik/lib/topik"
import { describe, expect, it, vi } from "vitest"

import { BookshelfGrid } from "."

function makeItems(count: number): Array<TopikMetadata> {
  return Array.from({ length: count }, (_, i) => ({
    key: `topik-${i}`,
    displayName: `TOPIK ${i}`,
    description: `description ${i}`,
    batchCount: 1,
    totalQuestions: 1,
    totalMessages: 1,
  }))
}

const grid = (
  props: Partial<ComponentProps<typeof BookshelfGrid>> = {}
): JSX.Element => (
  <BookshelfGrid
    items={makeItems(10)}
    onSelect={vi.fn()}
    page={1}
    onPageChange={vi.fn()}
    {...props}
  />
)

const pageButton = (name: RegExp): HTMLElement =>
  screen.getByRole("button", { name })

describe("BookshelfGrid - empty state", () => {
  it("shows a no-results message when there are no items", () => {
    render(grid({ items: [] }))
    expect(
      screen.getByText(/no materials match your search/i)
    ).toBeInTheDocument()
  })
})

describe("BookshelfGrid - pagination (8 items per page)", () => {
  it("shows only the current page's items and disables Previous on page 1", () => {
    render(grid())

    expect(screen.getByText("TOPIK 0")).toBeInTheDocument()
    expect(screen.getByText("TOPIK 7")).toBeInTheDocument()
    expect(screen.queryByText("TOPIK 8")).not.toBeInTheDocument()

    expect(pageButton(/previous page/i)).toBeDisabled()
    expect(pageButton(/next page/i)).not.toBeDisabled()
  })

  it("shows the remaining items on page 2 and disables Next on the last page", () => {
    render(grid({ page: 2 }))

    expect(screen.queryByText("TOPIK 0")).not.toBeInTheDocument()
    expect(screen.getByText("TOPIK 8")).toBeInTheDocument()
    expect(screen.getByText("TOPIK 9")).toBeInTheDocument()
    expect(pageButton(/next page/i)).toBeDisabled()
  })

  it("calls onPageChange with the adjacent page when Previous/Next are clicked", () => {
    const onPageChange = vi.fn()
    render(grid({ page: 2, onPageChange }))

    fireEvent.click(pageButton(/previous page/i))
    expect(onPageChange).toHaveBeenCalledWith(1)
  })

  it("hides pagination controls entirely when everything fits on one page", () => {
    render(grid({ items: makeItems(3) }))
    expect(
      screen.queryByRole("button", { name: /previous page/i })
    ).not.toBeInTheDocument()
  })
})

describe("BookshelfGrid - selection", () => {
  it("calls onSelect with the clicked item's key", () => {
    const onSelect = vi.fn()
    render(grid({ items: makeItems(2), onSelect }))

    fireEvent.click(screen.getByText("TOPIK 0").closest("button")!)
    expect(onSelect).toHaveBeenCalledWith("topik-0")
  })
})
