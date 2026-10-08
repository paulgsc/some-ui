import { AphHistory } from "@aph/components/aph-history"
import { SEED_ENTRIES, SEED_SETTINGS } from "@aph/lib/seed"
import type { AphStore } from "@aph/lib/store"
import { createAphStore } from "@aph/lib/store"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const noon = new Date(2026, 9, 2, 12, 4)

function setup(): {
  store: AphStore
  onEnterTheirs: ReturnType<typeof vi.fn>
} {
  const store = createAphStore({
    settings: SEED_SETTINGS,
    entries: SEED_ENTRIES.map((e) =>
      e.day === "2026-10-01" && e.checkpoint === "12"
        ? { ...e, theirs: { value: 5200 } }
        : e
    ),
  })
  const onEnterTheirs = vi.fn()
  render(<AphHistory now={noon} store={store} onEnterTheirs={onEnterTheirs} />)
  return { store, onEnterTheirs }
}

describe("History's missed days", () => {
  it("open the logger on a gap's latest day while it is within two weeks", () => {
    const onLogDay = vi.fn()
    render(
      <AphHistory
        now={noon}
        store={createAphStore({
          settings: SEED_SETTINGS,
          entries: SEED_ENTRIES,
        })}
        onLogDay={onLogDay}
      />
    )
    // Sep 30 is within reach of Oct 2; Sep 14 – 15, 17 days back, is not.
    fireEvent.click(screen.getByRole("button", { name: /Log Sep 30/ }))
    expect(onLogDay).toHaveBeenCalledWith("2026-09-30")
    expect(screen.queryByRole("button", { name: /Log Sep 15/ })).toBeNull()
    expect(screen.getByText(/Sep 14 – Sep 15 · 2 days/)).toBeInTheDocument()
  })
})

describe("History", () => {
  it("counts what waits on my call, and filters to it", () => {
    setup()
    const filter = screen.getByRole("button", { name: /1 Your call/ })
    fireEvent.click(filter)
    expect(screen.getAllByRole("region")).toHaveLength(1)
    expect(
      screen.getByRole("region", { name: "Thu Oct 1" })
    ).toBeInTheDocument()
  })

  it("keeps the filter clearable once its last entry is settled", () => {
    setup()
    fireEvent.click(screen.getByRole("button", { name: /1 Your call/ }))
    const day = screen.getByRole("region", { name: "Thu Oct 1" })
    fireEvent.click(
      within(day).getByRole("button", { name: "12:00: Your call" })
    )
    fireEvent.click(screen.getByRole("button", { name: "Agree with theirs" }))
    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    const chip = screen.getByRole("button", { name: /0 Your call/ })
    fireEvent.click(chip)
    expect(
      screen.getByRole("region", { name: "Fri Oct 2" })
    ).toBeInTheDocument()
  })

  it("flags a mismatch from the entry, and takes it back", () => {
    const { store } = setup()
    const day = screen.getByRole("region", { name: "Thu Oct 1" })
    fireEvent.click(
      within(day).getByRole("button", { name: "12:00: Your call" })
    )
    fireEvent.click(screen.getByRole("button", { name: "Flag it" }))
    const entry = store
      .get()
      .entries.find((e) => e.day === "2026-10-01" && e.checkpoint === "12")
    expect(entry?.review).toBe("flagged")
    fireEvent.click(screen.getByRole("button", { name: /Take back/ }))
    expect(
      store.get().entries.find((e) => e.id === entry?.id)?.review
    ).toBeNull()
  })

  it("sends an entry still waiting on them to the logger", () => {
    const { onEnterTheirs } = setup()
    const day = screen.getByRole("region", { name: "Fri Oct 2" })
    fireEvent.click(
      within(day).getByRole("button", { name: "7:00: Awaiting theirs" })
    )
    fireEvent.click(screen.getByRole("button", { name: "Enter their figure" }))
    expect(onEnterTheirs).toHaveBeenCalledWith(expect.stringMatching(/^paper-/))
  })

  it("keeps a comparison's last label while a plain figure sits beside it", () => {
    const { store } = setup()
    const day = screen.getByRole("region", { name: "Tue Sep 22" })
    const [, comparison] = within(day).getAllByRole("button", {
      name: /^12:00:/,
    })
    if (comparison === undefined) throw new Error("two figures at noon")
    fireEvent.click(comparison)
    const label = screen.getByRole("button", { name: "w/o office" })
    expect(label).toBeDisabled()
    fireEvent.click(label)
    const plainAtNoon = store
      .get()
      .entries.filter(
        (e) =>
          e.day === "2026-09-22" &&
          e.checkpoint === "12" &&
          e.labels.length === 0
      )
    expect(plainAtNoon).toHaveLength(1)
  })

  it("keeps a retired label on the entries it tags, and lets them drop it", () => {
    const { store } = setup()
    store.editSettings({
      labels: SEED_SETTINGS.labels.filter((l) => l !== "no-bs"),
    })
    const day = screen.getByRole("region", { name: "Tue Sep 22" })
    fireEvent.click(within(day).getByRole("button", { name: /^7:00:/ }))
    const label = screen.getByRole("button", { name: "no-bs" })
    expect(label).toHaveAttribute("aria-pressed", "true")
    fireEvent.click(label)
    const seven = store
      .get()
      .entries.find((e) => e.day === "2026-09-22" && e.checkpoint === "7")
    expect(seven?.labels).toEqual([])
    // Retired, so not offered back once dropped.
    expect(
      screen.queryByRole("button", { name: "no-bs" })
    ).not.toBeInTheDocument()
  })

  it("folds missed days into one line", () => {
    setup()
    expect(screen.getByText(/Sep 26 – Sep 27 · 2 days/)).toBeInTheDocument()
  })
})
