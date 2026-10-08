import { AphTodayEntries } from "@aph/components/aph-today"
import { SEED_SETTINGS } from "@aph/lib/seed"
import { createAphStore } from "@aph/lib/store"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

const noon = new Date(2026, 9, 3, 12, 30)

describe("Today so far", () => {
  it("lists a late-logged 7:00 above noon", () => {
    const store = createAphStore({ settings: SEED_SETTINGS, entries: [] })
    store.save(
      {
        side: "mine",
        digits: "5100",
        approx: false,
        day: null,
        checkpoint: "12",
        pinned: true,
        target: null,
        labels: [],
      },
      { today: "2026-10-03", time: "12:30", id: "noon" }
    )
    store.save(
      {
        side: "mine",
        digits: "4200",
        approx: true,
        day: null,
        checkpoint: "7",
        pinned: true,
        target: null,
        labels: [],
      },
      { today: "2026-10-03", time: "12:31", id: "late" }
    )
    render(
      <ul>
        <AphTodayEntries now={noon} store={store} />
      </ul>
    )
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(
      [
        expect.stringContaining("aph 7:00"),
        expect.stringContaining("aph 12:00"),
      ]
    )
  })
})
