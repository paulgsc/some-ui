import type { TopikMetadata } from "@topik/lib/topik"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { OmniSearchInput } from "."

function makeItems(count: number): Array<TopikMetadata> {
  return Array.from({ length: count }, (_, i) => ({
    key: `topik-${i}`,
    displayName: `TOPIK ${i}`,
    description: "d",
    batchCount: 1,
    totalQuestions: 1,
    totalMessages: 1,
  }))
}

function searchField(): HTMLElement {
  return screen.getByPlaceholderText(/search materials/i)
}

describe("OmniSearchInput - auto-highlight", () => {
  it("highlights the first item on mount when nothing is highlighted yet", () => {
    const onHighlight = vi.fn()
    render(
      <OmniSearchInput
        value=""
        onChange={vi.fn()}
        items={makeItems(3)}
        onHighlight={onHighlight}
        onSelect={vi.fn()}
      />
    )
    expect(onHighlight).toHaveBeenCalledWith("topik-0")
  })

  it("does not override an existing highlight", () => {
    const onHighlight = vi.fn()
    render(
      <OmniSearchInput
        value=""
        onChange={vi.fn()}
        items={makeItems(3)}
        onHighlight={onHighlight}
        onSelect={vi.fn()}
        highlightedKey="topik-1"
      />
    )
    expect(onHighlight).not.toHaveBeenCalled()
  })
})

describe("OmniSearchInput - arrow-key navigation", () => {
  it("wraps forward past the last item back to the first", () => {
    const onHighlight = vi.fn()
    render(
      <OmniSearchInput
        value=""
        onChange={vi.fn()}
        items={makeItems(3)}
        onHighlight={onHighlight}
        onSelect={vi.fn()}
        highlightedKey="topik-2"
      />
    )

    fireEvent.keyDown(searchField(), { key: "ArrowDown" })
    expect(onHighlight).toHaveBeenCalledWith("topik-0")
  })

  it("wraps backward past the first item to the last", () => {
    const onHighlight = vi.fn()
    render(
      <OmniSearchInput
        value=""
        onChange={vi.fn()}
        items={makeItems(3)}
        onHighlight={onHighlight}
        onSelect={vi.fn()}
        highlightedKey="topik-0"
      />
    )

    fireEvent.keyDown(searchField(), { key: "ArrowUp" })
    expect(onHighlight).toHaveBeenCalledWith("topik-2")
  })

  it("selects the highlighted item on Enter", () => {
    const onSelect = vi.fn()
    render(
      <OmniSearchInput
        value=""
        onChange={vi.fn()}
        items={makeItems(3)}
        onHighlight={vi.fn()}
        onSelect={onSelect}
        highlightedKey="topik-1"
      />
    )

    fireEvent.keyDown(searchField(), { key: "Enter" })
    expect(onSelect).toHaveBeenCalledWith("topik-1")
  })

  it("ignores arrow keys when there are no items", () => {
    const onHighlight = vi.fn()
    render(
      <OmniSearchInput
        value=""
        onChange={vi.fn()}
        items={[]}
        onHighlight={onHighlight}
        onSelect={vi.fn()}
      />
    )

    fireEvent.keyDown(searchField(), { key: "ArrowDown" })
    expect(onHighlight).not.toHaveBeenCalled()
  })
})

describe("OmniSearchInput - results count", () => {
  it("only shows the result count once a query is typed", () => {
    const { rerender } = render(
      <OmniSearchInput
        value=""
        onChange={vi.fn()}
        items={makeItems(1)}
        onHighlight={vi.fn()}
        onSelect={vi.fn()}
      />
    )
    expect(screen.queryByText(/result/)).not.toBeInTheDocument()

    rerender(
      <OmniSearchInput
        value="a"
        onChange={vi.fn()}
        items={makeItems(1)}
        onHighlight={vi.fn()}
        onSelect={vi.fn()}
      />
    )
    expect(screen.getByText("1 result")).toBeInTheDocument()
  })
})
