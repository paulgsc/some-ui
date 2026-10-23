/**
 * @vitest-environment jsdom
 *
 * Today says when the picks on show are not today's (by the Pacific day the
 * morning run goes by) and what brings the rest, and keeps the file picker as
 * the way in only when nothing arrives on its own.
 */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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

  it("says nothing of it for today's picks, by the Pacific day", async () => {
    // 23:59 on the 22nd in Los Angeles is already the 23rd in UTC.
    await showToday("2026-10-23T06:59:00Z", "2026-10-22")
    expect(screen.getByText("2026-10-22")).toBeTruthy()
    expect(screen.queryByText(/aren’t on this phone yet/)).toBeNull()
    expect(screen.queryByText(/tap the home mark at the top/)).toBeNull()
    expect(screen.getByText(PICKER)).toBeTruthy()
  })
})
