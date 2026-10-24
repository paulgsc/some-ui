/**
 * @vitest-environment jsdom
 *
 * Today says when the picks on show are not today's (by the Pacific day the
 * morning run goes by) and what brings the rest, and keeps the file picker as
 * the way in only when nothing arrives on its own. It opens on one pick and
 * what is ready for its form, counts what I have done today and never what
 * is left, and keeps every count and how the picks were chosen behind one
 * disclosure.
 */

import { act, cleanup, render, screen } from "@testing-library/react"
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
async function showToday(now: string, day: string | null): Promise<void> {
  vi.setSystemTime(new Date(now))
  mockJobs()
  const { phoneJobs } = await import("@/lib/jobs")
  if (day !== null) {
    const { digest } = await import("@/lib/jobs/__tests__/fixture")
    phoneJobs().keeping.fetched([digest(day)])
  }
  const { JobsToday } = await import("@/components/jobs/today")
  render(<JobsToday />)
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
  it("opens on one pick and what is ready for it, with a fit in words and no count or score on show", async () => {
    await showToday("2026-10-22T14:00:00Z", "2026-10-22")
    expect(
      screen.getByText("Today: nothing yet, and that’s fine.")
    ).toBeTruthy()
    expect(screen.getByText("Picked for you · Good fit")).toBeTruthy()
    expect(screen.getByText("covers 6 of 10")).toBeTruthy()
    expect(screen.getByText("Résumé to send: backend")).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/0\.\d\d/)
    const counts = screen.getByText(/Still open on this phone/)
    expect(counts.closest("details")?.open).toBe(false)
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
    // The pick I started comes first.
    expect(
      screen.getByText(/^Picked for you/).parentElement?.textContent
    ).toContain(second.posting.title)
    act(() => {
      pass(first)
      pass(second)
    })
    expect(screen.getByText("Today: 3 things done.")).toBeTruthy()
    expect(
      screen.getByText(
        "That’s every pick for now. New ones arrive each morning."
      )
    ).toBeTruthy()
  })
})
