import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ExercisePicker } from "."
import type { ExercisePickerItem } from "./types"

const ITEMS: ReadonlyArray<ExercisePickerItem> = [
  { id: "a", title: "Exercise A" },
  { id: "b", title: "Exercise B", badge: { tone: "popular", count: 42 } },
  { id: "c", title: "Exercise C", badge: { tone: "starved", count: 0 } },
]

describe("ExercisePicker", () => {
  it("lists every item's title", () => {
    render(<ExercisePicker items={ITEMS} onSelect={() => {}} />)
    for (const item of ITEMS) {
      expect(screen.getByText(item.title)).toBeInTheDocument()
    }
  })

  it("calls onSelect with the chosen item's id", () => {
    const onSelect = vi.fn()
    render(<ExercisePicker items={ITEMS} onSelect={onSelect} />)

    fireEvent.click(screen.getByText("Exercise B"))
    expect(onSelect).toHaveBeenCalledWith("b")
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it("renders a badge only for the items the caller supplied one for", () => {
    render(<ExercisePicker items={ITEMS} onSelect={() => {}} />)

    expect(screen.getByText("42")).toBeInTheDocument()
    expect(screen.getByText("0")).toBeInTheDocument()
    // Exercise A carries no badge — nothing to find for it beyond its title.
    const tileA = screen.getByText("Exercise A").closest("button")
    expect(tileA?.textContent).toBe("Exercise A")
  })
})
