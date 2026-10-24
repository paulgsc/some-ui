/**
 * @vitest-environment jsdom
 *
 * Today says when the picks on show are not today's (by the Pacific day the
 * morning run goes by) and what brings the rest, and keeps the file picker as
 * the way in only when nothing arrives on its own.
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { PickRef } from "@/lib/jobs/model"

/** A runtime of its own for each test: a mock's factory runs once otherwise. */
function mockJobs(): void {
  vi.doMock("@/lib/jobs", async () => {
    const { createJobsRuntime } = await import("@/lib/jobs/runtime")
    const { ports } = await import("@/lib/jobs/__tests__/fixture")
    const runtime = createJobsRuntime(
      ports({ now: () => new Date(), dayOf: () => "2026-10-22" })
    )
    return { phoneJobs: (): typeof runtime => runtime, copyText: vi.fn() }
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.resetModules()
})

const PICKER = "Open today’s picks from storage"

/** Today, as the phone shows it at `now`, holding the digest of `day` (or none). */
async function showToday(
  now: string,
  day: string | null,
  kept = false
): Promise<void> {
  vi.setSystemTime(new Date(now))
  mockJobs()
  const { phoneJobs } = await import("@/lib/jobs")
  if (day !== null) {
    const { digest } = await import("@/lib/jobs/__tests__/fixture")
    phoneJobs().keeping.fetched([digest(day)])
  }
  const { JobsToday } = await import("@/components/jobs/today")
  const { KeptOnHome } = await import("@/components/jobs/parts")
  render(
    <KeptOnHome value={kept}>
      <JobsToday />
    </KeptOnHome>
  )
}

describe("Today, as the picks arrive", () => {
  it("with no picks yet, says they arrive by themselves and keeps the picker as the other way", async () => {
    await showToday("2026-10-22T14:00:00Z", null)
    expect(screen.getByText("No picks open yet")).toBeTruthy()
    expect(screen.getByText(/tap the home mark at the top/)).toBeTruthy()
    expect(screen.getByText("Or open them from Drive")).toBeTruthy()
    expect(screen.queryByText(PICKER)).toBeNull()
  })

  it("says an earlier day's picks are not today's, and what brings today's", async () => {
    await showToday("2026-10-22T14:00:00Z", "2026-10-18")
    expect(screen.getByText(/These are 2026-10-18’s picks/)).toBeTruthy()
    expect(screen.getByText(/tap the home mark at the top/)).toBeTruthy()
    expect(screen.getByText("Or open them from Drive")).toBeTruthy()
    expect(screen.queryByText(PICKER)).toBeNull()
  })

  it("does not say today's are missing when an older file is opened over them", async () => {
    await showToday("2026-10-22T14:00:00Z", null)
    const { phoneJobs } = await import("@/lib/jobs")
    const { digest } = await import("@/lib/jobs/__tests__/fixture")
    // No picks open on it, so the Queue links to nothing (no router here).
    phoneJobs().keeping.fetched([{ ...digest("2026-10-22"), picks: [] }])
    // jsdom's Blob reads no text; a file chosen in the picker does.
    const json = JSON.stringify(digest("2026-10-18"))
    class Chosen extends Blob {
      override text(): Promise<string> {
        return Promise.resolve(json)
      }
    }
    phoneJobs().open(new Chosen([json]))
    expect(
      await screen.findByText(/Newer ones are on this phone too/)
    ).toBeTruthy()
    expect(screen.queryByText(/aren’t on this phone yet/)).toBeNull()
  })

  it("says nothing of it for today's picks, by the Pacific day", async () => {
    // 23:59 on the 22nd in Los Angeles is already the 23rd in UTC.
    await showToday("2026-10-23T06:59:00Z", "2026-10-22")
    expect(screen.getByText(/^On 2026-10-22,/)).toBeTruthy()
    expect(screen.queryByText(/aren’t on this phone yet/)).toBeNull()
    expect(screen.queryByText(/tap the home mark at the top/)).toBeNull()
    expect(screen.getByText(PICKER)).toBeTruthy()
  })
})

describe("Today, opened", () => {
  it("opens on one pick with its fit in words, says nothing of what isn't done, and keeps every count behind a tap", async () => {
    await showToday("2026-10-22T14:00:00Z", "2026-10-22")
    expect(screen.queryByText(/^Today:/)).toBeNull()
    expect(screen.getByText("Picked for you · Good fit")).toBeTruthy()
    expect(screen.getByText("covers 6 of 10")).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/0\.\d\d/)
    const counts = screen.getByText(/Still open on this phone/)
    expect(counts.closest("details")?.open).toBe(false)
  })

  it("ticks the résumé as ready only once I have its PDF", async () => {
    await showToday("2026-10-22T14:00:00Z", "2026-10-22")
    const { phoneJobs } = await import("@/lib/jobs")
    const { digest } = await import("@/lib/jobs/__tests__/fixture")
    const [first] = digest("2026-10-22").picks
    const ref: PickRef = {
      day: "2026-10-22",
      pickId: first.id,
      fingerprint: first.fingerprint,
    }
    expect(
      screen.getByText("Résumé to build from the pick: backend")
    ).toBeTruthy()
    expect(screen.queryByText("Ready for their form")).toBeNull()
    act(() => {
      phoneJobs().record({ type: "taken", ...ref })
    })
    expect(
      screen.getByText("Résumé to build from the pick: backend")
    ).toBeTruthy()
    expect(screen.queryByText("Ready for their form")).toBeNull()
    act(() => {
      phoneJobs().record({ type: "resume-ready", ...ref })
    })
    expect(screen.getByText("Ready for their form")).toBeTruthy()
    expect(screen.getByText("Résumé PDF in hand: backend")).toBeTruthy()
    expect(screen.queryByText(/Résumé to build/)).toBeNull()
  })

  it("counts what I did today, and closes once no pick is left", async () => {
    await showToday("2026-10-22T14:00:00Z", "2026-10-22")
    const { phoneJobs } = await import("@/lib/jobs")
    const { digest } = await import("@/lib/jobs/__tests__/fixture")
    const [first, second] = digest("2026-10-22").picks
    const ref = (pick: typeof first): PickRef => ({
      day: "2026-10-22",
      pickId: pick.id,
      fingerprint: pick.fingerprint,
    })
    const pass = (pick: typeof first): void => {
      phoneJobs().record({
        type: "passed",
        ...ref(pick),
        reasons: [],
        note: "",
        voice: [],
      })
    }
    act(() => {
      phoneJobs().record({ type: "taken", ...ref(second) })
    })
    expect(screen.getByText("Today: one thing done.")).toBeTruthy()
    act(() => {
      pass(first)
      pass(second)
    })
    expect(screen.getByText("Today: 3 things done.")).toBeTruthy()
    expect(screen.getByText("That’s every pick for now.")).toBeTruthy()
  })
})

describe("Today, once picks lapse (J5)", () => {
  it("says a pick left untouched three days lapsed", async () => {
    await showToday("2026-10-22T14:00:00Z", "2026-10-18")
    expect(screen.getByText("That’s every pick for now.")).toBeTruthy()
    fireEvent.click(
      screen.getByRole("button", { name: "See all of these picks" })
    )
    expect(screen.getAllByText("Lapsed")).toHaveLength(2)
  })

  it("names what the morning's picking lapsed, apart from what I decided before it heard, and keeps a way to a lapsed pick", async () => {
    await showToday("2026-10-22T14:00:00Z", null)
    const { phoneJobs } = await import("@/lib/jobs")
    const { digest } = await import("@/lib/jobs/__tests__/fixture")
    const jobs = phoneJobs()
    const old = digest("2026-10-18")
    const [taken, left] = old.picks
    act(() => {
      jobs.keeping.fetched([old])
    })
    act(() => {
      jobs.record({
        type: "taken",
        day: old.day,
        pickId: taken.id,
        fingerprint: taken.fingerprint,
      })
    })
    act(() => {
      jobs.keeping.fetched([
        {
          ...digest("2026-10-22"),
          queue: {
            open: [],
            lapsed: [taken, left].map((p) => ({
              day: old.day,
              pickId: p.id,
              track: p.track,
            })),
          },
        },
      ])
    })
    expect(
      screen.getByText(/1 pick from earlier days lapsed, untouched for 3 days/)
    ).toBeTruthy()
    expect(
      screen.getByText(/1 pick you decided lapsed before the morning’s picking/)
    ).toBeTruthy()
    fireEvent.click(
      screen.getByRole("button", { name: "Show the picks that lapsed (1)" })
    )
    expect(
      screen.getByText(new RegExp(`^2026-10-18 · ${left.posting.title}`))
    ).toBeTruthy()
  })
})
