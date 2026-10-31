/**
 * @vitest-environment jsdom
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { PickRef } from "@/lib/jobs/model"

afterEach(() => {
  cleanup()
  vi.resetModules()
})

/** Record, holding one pick taken and sent, with `outcomes` heard since. */
async function showRecord(
  outcomes: ReadonlyArray<"screen" | "rejected">
): Promise<void> {
  vi.doMock("@/lib/jobs", async () => {
    const { createJobsRuntime } = await import("@/lib/jobs/runtime")
    const { ports } = await import("@/lib/jobs/__tests__/fixture")
    const runtime = createJobsRuntime(
      // A fixed clock: the real one made this fail from the day after.
      ports({
        now: () => new Date("2026-10-30T22:00:00Z"),
        dayOf: () => "2026-10-30",
      })
    )
    return { phoneJobs: (): typeof runtime => runtime, copyText: vi.fn() }
  })
  const { phoneJobs } = await import("@/lib/jobs")
  const { digest } = await import("@/lib/jobs/__tests__/fixture")
  const jobs = phoneJobs()
  const d = digest("2026-10-27")
  jobs.keeping.fetched([d])
  const [pick] = d.picks
  const ref: PickRef = {
    day: d.day,
    pickId: pick.id,
    fingerprint: pick.fingerprint,
  }
  jobs.record({ type: "taken", ...ref })
  jobs.record({
    type: "debrief",
    ...ref,
    minutes: 20,
    friction: 2,
    chips: [],
    what: "",
    voice: [],
    result: "submitted",
  })
  for (const event of outcomes) jobs.addOutcome(pick.fingerprint, event)
  const { JobsRecord } = await import("@/components/jobs/record")
  render(<JobsRecord />)
}

const button = (name: string): HTMLElement | null =>
  screen.queryByRole("button", { name })

describe("Record's application cards", () => {
  it("while waiting, offers only the outcomes still ahead", async () => {
    await showRecord(["screen"])
    expect(screen.getByText(/waiting on the next step/)).toBeTruthy()
    expect(button("Interview")).toBeTruthy()
    expect(button("Screen")).toBeNull()
  })

  it("once rejected, offers nothing until I say I heard something since", async () => {
    await showRecord(["screen", "rejected"])
    expect(screen.getByText("Nothing more to wait for.")).toBeTruthy()
    expect(screen.queryByRole("group", { name: "What happened since" })).toBe(
      null
    )
    act(() => {
      fireEvent.click(
        screen.getByRole("button", { name: "Heard something since?" })
      )
    })
    expect(button("Interview")).toBeTruthy()
    expect(button("Rejected")).toBeNull()
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Interview" }))
    })
    expect(screen.getByText(/waiting on the next step/)).toBeTruthy()
    expect(button("Heard something since?")).toBeNull()
  })

  it("takes back a rejection said by mistake, and the card waits again", async () => {
    await showRecord(["screen", "rejected"])
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Rejected Oct 30" }))
    })
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Take it back" }))
    })
    expect(screen.queryByRole("button", { name: "Rejected Oct 30" })).toBeNull()
    expect(screen.getByRole("button", { name: "Screen Oct 30" })).toBeTruthy()
  })

  it("filters by how they stand, says when nothing matches, and pivots into a table", async () => {
    await showRecord(["rejected"])
    const card = (): HTMLElement | null =>
      screen.queryByText("Nothing more to wait for.")
    const chip = (name: RegExp): HTMLElement =>
      screen.getByRole("button", { name })
    expect(chip(/^Waiting 0$/).hasAttribute("disabled")).toBe(true)
    act(() => {
      fireEvent.click(chip(/^Rejected 1$/))
    })
    expect(chip(/^Rejected 1$/).getAttribute("aria-pressed")).toBe("true")
    expect(card()).toBeTruthy()
    act(() => {
      fireEvent.change(screen.getByRole("searchbox"), {
        target: { value: "no such company" },
      })
    })
    expect(card()).toBeNull()
    expect(screen.getByText("No application matches.")).toBeTruthy()
    act(() => {
      fireEvent.change(screen.getByRole("searchbox"), {
        target: { value: "" },
      })
    })
    act(() => {
      fireEvent.click(
        screen.getByRole("button", { name: "Week of Oct 26: Rejected 1" })
      )
    })
    expect(screen.getByText("Week of Oct 26: Rejected 1")).toBeTruthy()
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Show as table" }))
    })
    expect(
      screen.getByRole("rowheader", { name: "Week of Oct 26" })
    ).toBeTruthy()
  })
})
