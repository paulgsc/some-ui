import { AphLog } from "@aph/components/aph-log"
import { SEED_ENTRIES, SEED_SETTINGS } from "@aph/lib/seed"
import type { AphStore } from "@aph/lib/store"
import { createAphStore } from "@aph/lib/store"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const noon = new Date(2026, 9, 2, 12, 4)

function setup(props: Partial<Parameters<typeof AphLog>[0]> = {}): {
  store: AphStore
  onSaved: ReturnType<typeof vi.fn>
  type: (digits: string) => void
} {
  const store = createAphStore({
    settings: SEED_SETTINGS,
    entries: SEED_ENTRIES,
  })
  const onSaved = vi.fn()
  render(<AphLog now={noon} store={store} onSaved={onSaved} {...props} />)
  const type = (digits: string): void => {
    for (const d of digits)
      fireEvent.click(screen.getByRole("button", { name: d }))
  }
  return { store, onSaved, type }
}

describe("logging mine", () => {
  it("opens on the checkpoint that is due, and says the delta before saving", () => {
    const { type } = setup()
    expect(screen.getByRole("radio", { name: /12:00/ })).toHaveAttribute(
      "aria-checked",
      "true"
    )
    type("4600")
    expect(screen.getByText("−500")).toBeInTheDocument()
  })

  it("saves an approximate figure with its labels", () => {
    const { type, onSaved } = setup()
    type("4600")
    fireEvent.click(screen.getByRole("button", { name: "no-bs" }))
    fireEvent.click(screen.getByRole("button", { name: /Save mine · 12:00/ }))
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({
        day: "2026-10-02",
        checkpoint: "12",
        mine: { value: 4600, approx: true },
        goal: 5100,
        labels: ["no-bs"],
      }),
      "mine"
    )
  })

  it("corrects an already-logged figure and still reports the save", () => {
    // 7:00 on Oct 2 is logged (~4,300); logging it again corrects it.
    const { type, onSaved, store } = setup()
    fireEvent.click(screen.getByRole("radio", { name: /7:00/ }))
    type("4400")
    fireEvent.click(screen.getByRole("button", { name: /Correct mine · 7:00/ }))
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^paper-/),
        mine: { value: 4400, approx: true },
      }),
      "mine"
    )
    expect(store.get().entries).toHaveLength(SEED_ENTRIES.length)
  })

  it("warns about a figure outside the usual range", () => {
    const { type } = setup()
    type("460")
    expect(screen.getByText(/Typo\?/)).toBeInTheDocument()
  })
})

describe("a logger left open", () => {
  it("moves its default checkpoint with the clock, until I pick one", () => {
    const store = createAphStore({ settings: SEED_SETTINGS, entries: [] })
    const morning = new Date(2026, 9, 3, 9, 0)
    const { rerender } = render(<AphLog now={morning} store={store} />)
    const checked = (name: RegExp): string | null =>
      screen.getByRole("radio", { name }).getAttribute("aria-checked")
    expect(checked(/7:00/)).toBe("true")

    rerender(<AphLog now={new Date(2026, 9, 3, 11, 30)} store={store} />)
    expect(checked(/12:00/)).toBe("true")

    fireEvent.click(screen.getByRole("radio", { name: /7:00/ }))
    rerender(<AphLog now={new Date(2026, 9, 3, 11, 45)} store={store} />)
    expect(checked(/7:00/)).toBe("true")
  })

  it("saves under the day of the tap, not of the mount", () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(2026, 9, 2, 23, 58))
    const store = createAphStore({ settings: SEED_SETTINGS, entries: [] })
    const onSaved = vi.fn()
    render(<AphLog store={store} onSaved={onSaved} />)
    fireEvent.click(screen.getByRole("radio", { name: /Other/ }))
    for (const d of "4500") {
      fireEvent.click(screen.getByRole("button", { name: d }))
    }
    // Past midnight, the screen still up.
    vi.setSystemTime(new Date(2026, 9, 3, 0, 4))
    fireEvent.click(screen.getByRole("button", { name: /Save mine/ }))
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ day: "2026-10-03", time: "0:04" }),
      "mine"
    )
  })
})

describe("logging theirs", () => {
  it("shows, before saving, that a far-off figure will wait on my call", () => {
    const { type, store } = setup({ side: "theirs" })
    // The newest waiting entry: Oct 2 at 7:00, mine ~4,300.
    type("4900")
    expect(screen.getByText("Your call")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Save theirs/ }))
    const landed = store
      .get()
      .entries.find((e) => e.day === "2026-10-02" && e.checkpoint === "7")
    expect(landed?.theirs).toEqual({ value: 4900 })
  })

  it("reports the side it saved, not the side it opened on", () => {
    // Opened on mine (Home's due card), switched to theirs before saving.
    const { type, onSaved } = setup()
    fireEvent.click(screen.getByRole("radio", { name: /^Theirs/ }))
    type("4900")
    fireEvent.click(screen.getByRole("button", { name: /Save theirs/ }))
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ theirs: { value: 4900 } }),
      "theirs"
    )
  })

  it("shows a close figure as reconciled", () => {
    const { type } = setup({ side: "theirs" })
    type("4350")
    expect(screen.getByText("Reconciled")).toBeInTheDocument()
  })
})
