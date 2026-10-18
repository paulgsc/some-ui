/**
 * @vitest-environment jsdom
 *
 * The Scout view answers each scout with the run's verdict, and a scout the
 * run found but didn't pick with its scores, its gaps and the résumé to
 * build for it anyway.
 */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/jobs", async () => {
  const { createJobsRuntime } = await import("@/lib/jobs/runtime")
  const { createInMemoryStorage } = await import("@/lib/tenant/storage")
  const { memoryShelf } = await import("@/lib/jobs/__tests__/fixture")
  let n = 0
  const runtime = createJobsRuntime({
    storage: createInMemoryStorage(),
    audio: memoryShelf(),
    saving: () => undefined,
    isSaving: () => false,
    startRecording: vi.fn(),
    share: vi.fn(),
    now: () => new Date("2026-10-18T22:00:00Z"),
    dayOf: () => "2026-10-18",
    newId: () => `id${(n += 1)}`,
  })
  return { phoneJobs: (): typeof runtime => runtime, copyText: vi.fn() }
})

afterEach(() => {
  cleanup()
  vi.resetModules()
})

describe("a scout the run reviewed", () => {
  it("shows the scores, the gaps and a build of what to send", async () => {
    const { phoneJobs } = await import("@/lib/jobs")
    const { digest } = await import("@/lib/jobs/__tests__/fixture")
    const jobs = phoneJobs()
    expect(
      jobs.addScout(
        {
          url: "https://www.indeed.com/viewjob?jk=1",
          track: "adjacent",
          family: "qa",
          title: "SDET · Second Dinner",
          why: "Games",
          postingText: null,
        },
        []
      )
    ).toBe(true)
    const [scout] = jobs
      .getSnapshot()
      .state.log.flatMap((e) => (e.type === "scout" ? [e.scout] : []))
    const day = {
      ...digest("2026-10-18"),
      scouts: [
        {
          scoutId: scout.id,
          verdict: "agree" as const,
          note: "Ranked third on its track today.",
          pickId: null,
          review: {
            scores: {
              fit: 0.7,
              odds: 0.4,
              fitWhy: "covers 7 of 10 requirements",
              oddsWhy: "posted this week",
            },
            gaps: [{ kind: "learnable" as const, text: "C#" }],
            sends: { variant: "qa" as const, template: "classic" as const },
          },
        },
      ],
    }
    // jsdom's Blob reads no text; the runtime only asks for it.
    const text = JSON.stringify(day)
    jobs.open(
      Object.assign(new Blob([]), {
        text: (): Promise<string> => Promise.resolve(text),
      })
    )
    await vi.waitFor(() => {
      expect(jobs.getSnapshot().state.current).toBe(day.day)
    })

    const { JobsScout } = await import("@/components/jobs/scout")
    render(<JobsScout />)
    expect(screen.getByText("Run agrees")).toBeTruthy()
    expect(screen.getByText("covers 7 of 10 requirements")).toBeTruthy()
    expect(screen.getByText("C#")).toBeTruthy()
    const build = screen.getByRole("link", { name: /Build qa · classic/ })
    const href = new URL(build.getAttribute("href") ?? "")
    expect(Object.fromEntries(href.searchParams)).toEqual({
      variant: "qa",
      template: "classic",
      pick: scout.id,
    })
  })
})
