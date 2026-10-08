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
    const store = createAphStore({ settings: SEED_SETTINGS, entries: [] })
    const onSaved = vi.fn()
    const { rerender } = render(
      <AphLog
        now={new Date(2026, 9, 2, 23, 58)}
        store={store}
        onSaved={onSaved}
      />
    )
    fireEvent.click(screen.getByRole("radio", { name: /Other/ }))
    for (const d of "4500") {
      fireEvent.click(screen.getByRole("button", { name: d }))
    }
    // Past midnight, the screen still up: the host's clock has moved on.
    rerender(
      <AphLog
        now={new Date(2026, 9, 3, 0, 4)}
        store={store}
        onSaved={onSaved}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /Save mine/ }))
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ day: "2026-10-03", time: "0:04" }),
      "mine"
    )
  })
})

describe("logging a day I missed", () => {
  it("steps back a day, and saves there at the checkpoint still missing", () => {
    // Noon on Oct 3; Oct 2 holds 7:00 but not 12:00.
    const { type, onSaved } = setup({ now: new Date(2026, 9, 3, 12, 4) })
    fireEvent.click(screen.getByRole("button", { name: "Earlier day" }))
    expect(screen.getByText("Yesterday")).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: /12:00/ })).toHaveAttribute(
      "aria-checked",
      "true"
    )
    type("4900")
    fireEvent.click(
      screen.getByRole("button", { name: /Save mine · Oct 2 12:00/ })
    )
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ day: "2026-10-02", checkpoint: "12" }),
      "mine"
    )
  })

  it("stops at the earliest day it can log, and steps forward again", () => {
    // Two days after tracking began (Sep 14).
    setup({ now: new Date(2026, 8, 16, 9, 0) })
    const earlier = screen.getByRole("button", { name: "Earlier day" })
    fireEvent.click(earlier)
    fireEvent.click(earlier)
    expect(screen.getByText("Mon Sep 14")).toBeInTheDocument()
    expect(earlier).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Later day" }))
    expect(screen.getByText("Yesterday")).toBeInTheDocument()
  })

  it("opens on the day a link names", () => {
    setup({ now: new Date(2026, 9, 8, 9, 0), initialDay: "2026-10-05" })
    expect(screen.getByText("Mon Oct 5")).toBeInTheDocument()
  })

  it("opens a linked day now past two weeks as out of reach, not as today", () => {
    const { type } = setup({
      now: new Date(2026, 9, 8, 9, 0),
      initialDay: "2026-09-20",
    })
    expect(screen.getByText("Too far back to log")).toBeInTheDocument()
    type("4400")
    expect(screen.getByRole("button", { name: /Save mine/ })).toBeDisabled()
  })
})

describe("logging theirs", () => {
  it("shows, before saving, that a far-off figure will wait on my call", () => {
    const { type, store } = setup({ initialSide: "theirs" })
    // The newest waiting entry: Oct 2 at 7:00, mine ~4,300.
    type("4900")
    expect(screen.getByText("Your call")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Save theirs/ }))
    const landed = store
      .get()
      .entries.find((e) => e.day === "2026-10-02" && e.checkpoint === "7")
    expect(landed?.theirs).toEqual({ value: 4900 })
  })

  it("won't write over a figure reported since the link was made", () => {
    // Back to "Enter their figure" for Oct 2 at 7:00, already filled.
    const filled = SEED_ENTRIES.map((e) =>
      e.day === "2026-10-02" && e.checkpoint === "7"
        ? { ...e, theirs: { value: 4300 } }
        : e
    )
    const store = createAphStore({ settings: SEED_SETTINGS, entries: filled })
    const target = filled.find(
      (e) => e.day === "2026-10-02" && e.checkpoint === "7"
    )
    render(
      <AphLog
        now={noon}
        store={store}
        initialSide="theirs"
        initialTarget={target?.id}
      />
    )
    for (const d of "4900") {
      fireEvent.click(screen.getByRole("button", { name: d }))
    }
    expect(screen.getByRole("button", { name: /Save theirs/ })).toBeDisabled()
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
    const { type } = setup({ initialSide: "theirs" })
    type("4350")
    expect(screen.getByText("Reconciled")).toBeInTheDocument()
  })
})
