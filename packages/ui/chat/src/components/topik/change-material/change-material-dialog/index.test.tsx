import type { TopikMetadata } from "@chat/lib/topik"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ChangeMaterialDialog } from "."

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

function makeItems(): Array<TopikMetadata> {
  return [
    {
      key: "topik-3",
      displayName: "TOPIK 3 - Workplace",
      description: "Workplace conversations.",
      // batchCount: 0 keeps this out of the "Recommended for Study" strip,
      // so its card only ever renders once (in the main bookshelf grid).
      batchCount: 0,
      totalQuestions: 15,
      totalMessages: 30,
    },
    {
      key: "topik-4",
      displayName: "TOPIK 4 - Travel",
      description: "Travel and directions.",
      batchCount: 0,
      totalQuestions: 12,
      totalMessages: 24,
    },
  ]
}

function searchField(): HTMLElement {
  return screen.getByPlaceholderText(/search materials/i)
}

// ═══════════════════════════════════════════════════════════════════════════
// search-filter match
// ═══════════════════════════════════════════════════════════════════════════

describe("ChangeMaterialDialog - search filter", () => {
  it("filters the bookshelf to items matching the query", () => {
    render(
      <ChangeMaterialDialog
        open
        onOpenChange={vi.fn()}
        topikItems={makeItems()}
        loading={false}
        onConfirm={vi.fn()}
      />
    )

    fireEvent.change(searchField(), { target: { value: "travel" } })

    expect(screen.getByText("TOPIK 4 - Travel")).toBeInTheDocument()
    expect(screen.queryByText("TOPIK 3 - Workplace")).not.toBeInTheDocument()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// confirm / cancel flow
// ═══════════════════════════════════════════════════════════════════════════

describe("ChangeMaterialDialog - confirm/cancel flow", () => {
  it("disables Start Study Session until a material is selected, then confirms and closes", () => {
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <ChangeMaterialDialog
        open
        onOpenChange={onOpenChange}
        topikItems={makeItems()}
        loading={false}
        onConfirm={onConfirm}
      />
    )

    expect(
      screen.getByRole("button", { name: /start study session/i })
    ).toBeDisabled()

    fireEvent.click(screen.getByText("TOPIK 3 - Workplace").closest("button")!)
    expect(
      screen.getByRole("button", { name: /start study session/i })
    ).not.toBeDisabled()

    fireEvent.click(
      screen.getByRole("button", { name: /start study session/i })
    )

    expect(onConfirm).toHaveBeenCalledWith("topik-3")
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("cancel clears the search without confirming a selection", () => {
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <ChangeMaterialDialog
        open
        onOpenChange={onOpenChange}
        topikItems={makeItems()}
        loading={false}
        onConfirm={onConfirm}
      />
    )

    fireEvent.change(searchField(), { target: { value: "travel" } })
    fireEvent.click(screen.getByText("TOPIK 4 - Travel").closest("button")!)

    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(searchField()).toHaveValue("")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// reset-on-open effect - what the pending set-state-in-effect lint fix touches
// ═══════════════════════════════════════════════════════════════════════════

describe("ChangeMaterialDialog - reset-on-open effect", () => {
  it("clears a stale search query and selection when the dialog is reopened", () => {
    const { rerender } = render(
      <ChangeMaterialDialog
        open
        onOpenChange={vi.fn()}
        topikItems={makeItems()}
        loading={false}
        onConfirm={vi.fn()}
      />
    )

    fireEvent.change(searchField(), { target: { value: "travel" } })
    fireEvent.click(screen.getByText("TOPIK 4 - Travel").closest("button")!)
    expect(
      screen.getByRole("button", { name: /start study session/i })
    ).not.toBeDisabled()

    rerender(
      <ChangeMaterialDialog
        open={false}
        onOpenChange={vi.fn()}
        topikItems={makeItems()}
        loading={false}
        onConfirm={vi.fn()}
      />
    )

    rerender(
      <ChangeMaterialDialog
        open
        onOpenChange={vi.fn()}
        topikItems={makeItems()}
        loading={false}
        onConfirm={vi.fn()}
      />
    )

    expect(searchField()).toHaveValue("")
    expect(
      screen.getByRole("button", { name: /start study session/i })
    ).toBeDisabled()
  })

  it("re-selects currentTopikKey (not a blank slate) on reopen", () => {
    const { rerender } = render(
      <ChangeMaterialDialog
        open
        onOpenChange={vi.fn()}
        topikItems={makeItems()}
        loading={false}
        currentTopikKey="topik-3"
        onConfirm={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText("TOPIK 4 - Travel").closest("button")!)

    rerender(
      <ChangeMaterialDialog
        open={false}
        onOpenChange={vi.fn()}
        topikItems={makeItems()}
        loading={false}
        currentTopikKey="topik-3"
        onConfirm={vi.fn()}
      />
    )
    rerender(
      <ChangeMaterialDialog
        open
        onOpenChange={vi.fn()}
        topikItems={makeItems()}
        loading={false}
        currentTopikKey="topik-3"
        onConfirm={vi.fn()}
      />
    )

    const onConfirm = vi.fn()
    rerender(
      <ChangeMaterialDialog
        open
        onOpenChange={vi.fn()}
        topikItems={makeItems()}
        loading={false}
        currentTopikKey="topik-3"
        onConfirm={onConfirm}
      />
    )
    fireEvent.click(
      screen.getByRole("button", { name: /start study session/i })
    )
    expect(onConfirm).toHaveBeenCalledWith("topik-3")
  })
})
