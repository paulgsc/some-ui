import type { ComponentProps, JSX } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import type { TopikMetadata } from "@topik/lib/topik"
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

const input = (
  props: Partial<ComponentProps<typeof OmniSearchInput>> = {}
): JSX.Element => (
  <OmniSearchInput
    value=""
    onChange={vi.fn()}
    items={makeItems(3)}
    onHighlight={vi.fn()}
    onSelect={vi.fn()}
    {...props}
  />
)

const press = (key: string): void => {
  fireEvent.keyDown(screen.getByPlaceholderText(/search materials/i), { key })
}

describe("OmniSearchInput - auto-highlight", () => {
  it("highlights the first item on mount when nothing is highlighted yet", () => {
    const onHighlight = vi.fn()
    render(input({ onHighlight }))
    expect(onHighlight).toHaveBeenCalledWith("topik-0")
  })

  it("does not override an existing highlight", () => {
    const onHighlight = vi.fn()
    render(input({ onHighlight, highlightedKey: "topik-1" }))
    expect(onHighlight).not.toHaveBeenCalled()
  })
})

describe("OmniSearchInput - arrow-key navigation", () => {
  it.each([
    [
      "forward past the last item back to the first",
      "topik-2",
      "ArrowDown",
      "topik-0",
    ],
    [
      "backward past the first item to the last",
      "topik-0",
      "ArrowUp",
      "topik-2",
    ],
  ])("wraps %s", (_, highlightedKey, key, expected) => {
    const onHighlight = vi.fn()
    render(input({ onHighlight, highlightedKey }))

    press(key)
    expect(onHighlight).toHaveBeenCalledWith(expected)
  })

  it("selects the highlighted item on Enter", () => {
    const onSelect = vi.fn()
    render(input({ onSelect, highlightedKey: "topik-1" }))

    press("Enter")
    expect(onSelect).toHaveBeenCalledWith("topik-1")
  })

  it("ignores arrow keys when there are no items", () => {
    const onHighlight = vi.fn()
    render(input({ onHighlight, items: [] }))

    press("ArrowDown")
    expect(onHighlight).not.toHaveBeenCalled()
  })
})

describe("OmniSearchInput - results count", () => {
  it("only shows the result count once a query is typed", () => {
    const { rerender } = render(input({ items: makeItems(1) }))
    expect(screen.queryByText(/result/)).not.toBeInTheDocument()

    rerender(input({ value: "a", items: makeItems(1) }))
    expect(screen.getByText("1 result")).toBeInTheDocument()
  })
})
