import { AphHistory } from "@aph/components/aph-history"
import { SEED_ENTRIES, SEED_SETTINGS } from "@aph/lib/seed"
import type { AphStore } from "@aph/lib/store"
import { createAphStore } from "@aph/lib/store"
import type { EngagementEvent } from "@some-ui/engagement"
import { createVisit } from "@some-ui/engagement"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
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

  it("offer each day within reach on the visit, and take the one logged (ENG9)", () => {
    const sent: Array<EngagementEvent> = []
    const visit = createVisit(
      () => noon,
      (event) => sent.push(event)
    )
    render(
      <AphHistory
        now={noon}
        store={createAphStore({
          settings: SEED_SETTINGS,
          entries: SEED_ENTRIES,
        })}
        onLogDay={vi.fn()}
        onEnterTheirs={vi.fn()}
        visit={visit}
      />
    )
    const missed = (kind: string): number =>
      sent.filter((e) => e.affordance === "missed-day" && e.kind === kind)
        .length
    // Four gaps end within reach (Sep 19, 21, 27 and 30); nothing of the
    // day leaves the phone.
    expect(missed("offered")).toBe(4)
    fireEvent.click(screen.getByRole("button", { name: /Log Sep 30/ }))
    expect(missed("taken")).toBe(1)
    expect(JSON.stringify(sent)).not.toContain("2026-09-30")
    visit.end("moved-on")
    expect(missed("passed-over")).toBe(3)
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

  it("changes my figure from the entry, and clears my call on it", () => {
    const { store } = setup()
    const day = screen.getByRole("region", { name: "Thu Oct 1" })
    fireEvent.click(
      within(day).getByRole("button", { name: "12:00: Your call" })
    )
    fireEvent.click(screen.getByRole("button", { name: "Flag it" }))
    fireEvent.change(screen.getByLabelText("Change mine"), {
      target: { value: "5,2o0" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    const entry = store
      .get()
      .entries.find((e) => e.day === "2026-10-01" && e.checkpoint === "12")
    expect(entry?.mine?.value).toBe(520)
    expect(entry?.review).toBeNull()
  })

  it("removes an entry once asked twice, and the record keeps it", () => {
    const { store } = setup()
    const day = screen.getByRole("region", { name: "Fri Oct 2" })
    fireEvent.click(
      within(day).getByRole("button", { name: "7:00: Awaiting theirs" })
    )
    fireEvent.click(screen.getByRole("button", { name: /Remove from the log/ }))
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }))
    fireEvent.click(screen.getByRole("button", { name: /Remove from the log/ }))
    fireEvent.click(screen.getByRole("button", { name: "Remove" }))
    const entry = store
      .get()
      .entries.find((e) => e.day === "2026-10-02" && e.checkpoint === "7")
    expect(entry?.removed).toBe(true)
    expect(
      within(screen.getByRole("region", { name: "Fri Oct 2" })).queryByRole(
        "button",
        { name: /^7:00/ }
      )
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

  it("shows the note that was kept when the phone refuses a new one", () => {
    const storage = memoryStorage()
    const store = createAphStore(
      { settings: SEED_SETTINGS, entries: SEED_ENTRIES },
      storage
    )
    render(<AphHistory now={noon} store={store} />)
    const day = screen.getByRole("region", { name: "Fri Oct 2" })
    fireEvent.click(within(day).getByRole("button", { name: /7:00/ }))
    storage.full = true
    const note = screen.getByLabelText("Note")
    fireEvent.change(note, { target: { value: "after coffee" } })
    fireEvent.blur(note)
    expect(note).toHaveValue("")
  })
})

describe("History's drafts", () => {
  it("lists drafts, and submits the ones picked together", () => {
    const draft = (
      id: string,
      checkpoint: string
    ): (typeof SEED_ENTRIES)[number] => ({
      ...SEED_ENTRIES.find(
        (e) => e.checkpoint === checkpoint && e.labels.length === 0
      )!,
      id,
      day: "2026-10-02",
      draft: true,
    })
    const store = createAphStore({
      settings: SEED_SETTINGS,
      entries: [
        ...SEED_ENTRIES.filter((e) => e.day !== "2026-10-02"),
        draft("d7", "7"),
        draft("d12", "12"),
      ],
    })
    render(<AphHistory now={noon} store={store} />)
    const drafts = screen.getByRole("region", { name: "Drafts" })
    expect(
      within(drafts).getByText(/2 drafts not yet submitted/)
    ).toBeInTheDocument()
    fireEvent.click(within(drafts).getByRole("button", { name: "Pick all" }))
    fireEvent.click(
      within(drafts).getByRole("button", { name: /Submit 2 drafts/ })
    )
    expect(store.get().entries.filter((e) => e.draft === true)).toEqual([])
    expect(screen.queryByRole("region", { name: "Drafts" })).toBeNull()
  })
})
