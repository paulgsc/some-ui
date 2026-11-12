/**
 * What `StationStrip` owns: its stations in order, the one a thing is at
 * named as the current step, the ones before it passed, and a side track
 * said beside the line only when there is one.
 */
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { StationStrip } from "."

const STATIONS = [
  { id: "line", name: "In line" },
  { id: "oven", name: "In the oven" },
  { id: "ready", name: "Ready for pickup" },
] as const

describe("StationStrip", () => {
  it("lists its stations in order, the current one marked", () => {
    render(<StationStrip label="Where it is" stations={STATIONS} at="oven" />)
    const items = screen.getAllByRole("listitem")
    expect(items.map((item) => item.textContent)).toEqual([
      "In line",
      "In the oven",
      "Ready for pickup",
    ])
    expect(items[1]?.getAttribute("aria-current")).toBe("step")
    expect(items[0]?.hasAttribute("data-passed")).toBe(true)
    expect(items[2]?.hasAttribute("data-passed")).toBe(false)
    expect(screen.getByRole("list", { name: "Where it is" })).toBeTruthy()
  })

  it("marks none for a station not on the line", () => {
    render(<StationStrip label="Where it is" stations={STATIONS} at="gone" />)
    for (const item of screen.getAllByRole("listitem")) {
      expect(item.hasAttribute("aria-current")).toBe(false)
      expect(item.hasAttribute("data-passed")).toBe(false)
    }
  })

  it("says a side track beside the line, and nothing without one", () => {
    const { rerender } = render(
      <StationStrip label="Where it is" stations={STATIONS} at="oven" />
    )
    expect(screen.queryByText(/On the counter/)).toBeNull()
    rerender(
      <StationStrip
        label="Where it is"
        stations={STATIONS}
        at="oven"
        aside={{ name: "On the counter", line: "Paused for now." }}
      />
    )
    expect(screen.getByText(/On the counter/).closest("p")?.textContent).toBe(
      "On the counter: Paused for now."
    )
  })
})
