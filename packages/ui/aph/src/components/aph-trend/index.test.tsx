import { AphTrend } from "@aph/components/aph-trend"
import { SEED_ENTRIES, SEED_SETTINGS } from "@aph/lib/seed"
import { createAphStore } from "@aph/lib/store"
import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

const noon = new Date(2026, 9, 2, 12, 4)

/** The y of each vertex of the goal line drawn in `tone`. */
function goalYs(container: HTMLElement, tone: string): Array<number> {
  const line = [...container.querySelectorAll("polyline")].find(
    (p) =>
      p.getAttribute("stroke") === tone &&
      p.getAttribute("stroke-dasharray") !== null
  )
  return (line?.getAttribute("points") ?? "")
    .split(" ")
    .filter(Boolean)
    .map((xy) => Number(xy.split(",")[1]))
}

describe("Trend's goal line", () => {
  it("is flat while every entry was made under one goal", () => {
    const store = createAphStore({
      settings: SEED_SETTINGS,
      entries: SEED_ENTRIES,
    })
    const { container } = render(<AphTrend now={noon} store={store} />)
    expect(new Set(goalYs(container, "var(--chart-2)")).size).toBe(1)
  })

  it("keeps the past at its own goal after the goal changes", () => {
    const store = createAphStore({
      settings: SEED_SETTINGS,
      entries: SEED_ENTRIES,
    })
    store.editSettings({
      checkpoints: SEED_SETTINGS.checkpoints.map((c) =>
        c.id === "7" ? { ...c, goal: 4600 } : c
      ),
    })
    const { container } = render(<AphTrend now={noon} store={store} />)
    // The paper notes' ~4,100, then a step to today's 4,600 at the end.
    expect(new Set(goalYs(container, "var(--chart-2)")).size).toBe(2)
  })
})
