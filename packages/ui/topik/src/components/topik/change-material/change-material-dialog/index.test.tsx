import type { ComponentProps, JSX } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import type { TopikMetadata } from "@topik/lib/topik"
import { describe, expect, it, vi } from "vitest"

import { ChangeMaterialDialog } from "."

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

const dialog = (
  props: Partial<ComponentProps<typeof ChangeMaterialDialog>> = {}
): JSX.Element => (
  <ChangeMaterialDialog
    open
    onOpenChange={vi.fn()}
    topikItems={makeItems()}
    loading={false}
    onConfirm={vi.fn()}
    {...props}
  />
)

const searchField = (): HTMLElement =>
  screen.getByPlaceholderText(/search materials/i)
const startButton = (): HTMLElement =>
  screen.getByRole("button", { name: /start study session/i })
const pickCard = (name: string): void => {
  fireEvent.click(screen.getByText(name).closest("button")!)
}
const search = (value: string): void => {
  fireEvent.change(searchField(), { target: { value } })
}

describe("ChangeMaterialDialog - search filter", () => {
  it("filters the bookshelf to items matching the query", () => {
    render(dialog())
    search("travel")

    expect(screen.getByText("TOPIK 4 - Travel")).toBeInTheDocument()
    expect(screen.queryByText("TOPIK 3 - Workplace")).not.toBeInTheDocument()
  })
})

describe("ChangeMaterialDialog - confirm/cancel flow", () => {
  it("disables Start Study Session until a material is selected, then confirms and closes", () => {
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(dialog({ onConfirm, onOpenChange }))

    expect(startButton()).toBeDisabled()
    pickCard("TOPIK 3 - Workplace")
    expect(startButton()).not.toBeDisabled()
    fireEvent.click(startButton())

    expect(onConfirm).toHaveBeenCalledWith("topik-3")
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("cancel clears the search without confirming a selection", () => {
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(dialog({ onConfirm, onOpenChange }))

    search("travel")
    pickCard("TOPIK 4 - Travel")
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(searchField()).toHaveValue("")
  })
})

describe("ChangeMaterialDialog - reset-on-open effect", () => {
  it("clears a stale search query and selection when the dialog is reopened", () => {
    const { rerender } = render(dialog())

    search("travel")
    pickCard("TOPIK 4 - Travel")
    expect(startButton()).not.toBeDisabled()

    rerender(dialog({ open: false }))
    rerender(dialog())

    expect(searchField()).toHaveValue("")
    expect(startButton()).toBeDisabled()
  })

  it("re-selects currentTopikKey (not a blank slate) on reopen", () => {
    const current = { currentTopikKey: "topik-3" }
    const { rerender } = render(dialog(current))

    pickCard("TOPIK 4 - Travel")

    rerender(dialog({ ...current, open: false }))
    rerender(dialog(current))

    const onConfirm = vi.fn()
    rerender(dialog({ ...current, onConfirm }))
    fireEvent.click(startButton())
    expect(onConfirm).toHaveBeenCalledWith("topik-3")
  })
})
