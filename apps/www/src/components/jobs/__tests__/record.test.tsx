/**
 * @vitest-environment jsdom
 *
 * Record's application cards wear where each one stands: one waiting to hear
 * offers only what is still ahead of it, and one that ended offers nothing
 * until I say I heard something since.
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
      ports({ now: () => new Date(), dayOf: () => "2026-10-30" })
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
    expect(screen.getByText(/Waiting to hear/)).toBeTruthy()
    expect(button("Interview")).toBeTruthy()
    expect(button("Rejected")).toBeTruthy()
    expect(button("Viewed")).toBeNull()
    expect(button("Screen")).toBeNull()
    // Sent today: a month of silence is still a month off.
    expect(button("No reply in 30 days")).toBeNull()
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
    expect(screen.getByText(/Waiting to hear/)).toBeTruthy()
    expect(button("Heard something since?")).toBeNull()
  })
})
