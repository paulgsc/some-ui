import type { TopikMetadata } from "@chat/lib/topik"
import { fireEvent, render, screen } from "@testing-library/react"
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

describe("BookshelfGrid - empty state", () => {
  it("shows a no-results message when there are no items", () => {
    render(
      <BookshelfGrid
        items={[]}
        onSelect={vi.fn()}
        page={1}
        onPageChange={vi.fn()}
      />
    )
    expect(
      screen.getByText(/no materials match your search/i)
    ).toBeInTheDocument()
  })
})

describe("BookshelfGrid - pagination (8 items per page)", () => {
  const items = makeItems(10)

  it("shows only the current page's items and disables Previous on page 1", () => {
    render(
      <BookshelfGrid
        items={items}
        onSelect={vi.fn()}
        page={1}
        onPageChange={vi.fn()}
      />
    )

    expect(screen.getByText("TOPIK 0")).toBeInTheDocument()
    expect(screen.getByText("TOPIK 7")).toBeInTheDocument()
    expect(screen.queryByText("TOPIK 8")).not.toBeInTheDocument()

    expect(
      screen.getByRole("button", { name: /previous page/i })
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: /next page/i })
    ).not.toBeDisabled()
  })

  it("shows the remaining items on page 2 and disables Next on the last page", () => {
    render(
      <BookshelfGrid
        items={items}
        onSelect={vi.fn()}
        page={2}
        onPageChange={vi.fn()}
      />
    )

    expect(screen.queryByText("TOPIK 0")).not.toBeInTheDocument()
    expect(screen.getByText("TOPIK 8")).toBeInTheDocument()
    expect(screen.getByText("TOPIK 9")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /next page/i })).toBeDisabled()
  })

  it("calls onPageChange with the adjacent page when Previous/Next are clicked", () => {
    const onPageChange = vi.fn()
    render(
      <BookshelfGrid
        items={items}
        onSelect={vi.fn()}
        page={2}
        onPageChange={onPageChange}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: /previous page/i }))
    expect(onPageChange).toHaveBeenCalledWith(1)
  })

  it("hides pagination controls entirely when everything fits on one page", () => {
    render(
      <BookshelfGrid
        items={makeItems(3)}
        onSelect={vi.fn()}
        page={1}
        onPageChange={vi.fn()}
      />
    )
    expect(
      screen.queryByRole("button", { name: /previous page/i })
    ).not.toBeInTheDocument()
  })
})

describe("BookshelfGrid - selection", () => {
  it("calls onSelect with the clicked item's key", () => {
    const onSelect = vi.fn()
    render(
      <BookshelfGrid
        items={makeItems(2)}
        onSelect={onSelect}
        page={1}
        onPageChange={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText("TOPIK 0").closest("button")!)
    expect(onSelect).toHaveBeenCalledWith("topik-0")
  })
})
