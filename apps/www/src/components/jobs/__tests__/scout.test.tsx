/**
 * @vitest-environment jsdom
 *
 * The Scout view answers each scout with the run's verdict, and a scout the
 * run found but didn't pick with its scores, its gaps and the résumé to
 * build for it anyway.
 */

import { act, cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/jobs", async () => {
  const { createJobsRuntime } = await import("@/lib/jobs/runtime")
  const { ports } = await import("@/lib/jobs/__tests__/fixture")
  const runtime = createJobsRuntime(ports())
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

describe("a scout filed with home without a tap (JB2)", () => {
  it("wears where it is: on the phone, then with home, with nothing left to share", async () => {
    const { phoneJobs } = await import("@/lib/jobs")
    const { isFile } = await import("@/lib/jobs/files")
    const jobs = phoneJobs()
    expect(
      jobs.addScout(
        {
          url: "https://jobs.lever.co/acme/1",
          track: "software",
          family: null,
          title: "Platform Engineer",
          why: "",
          postingText: null,
        },
        []
      )
    ).toBe(true)
    const { JobsScout } = await import("@/components/jobs/scout")
    const { KeptOnHome } = await import("@/components/jobs/parts")
    render(
      <KeptOnHome value>
        <JobsScout />
      </KeptOnHome>
    )
    const card = screen.getByRole("heading", { name: "Platform Engineer" })
    const bar = (): string | null | undefined =>
      card.closest("[data-journey]")?.getAttribute("data-journey")
    const inCard = within(card.closest("section") ?? document.body)
    expect(bar()).toBe("on-phone")
    expect(
      inCard.getByRole("button", { name: "Share scouts to Drive" })
    ).toBeTruthy()

    const file = jobs.keeping.outgoing("scouts")
    if (!isFile(file)) throw new Error("no scouts file")
    act(() => {
      jobs.keeping.filed("scouts", file)
    })
    expect(bar()).toBe("with-home")
    expect(
      inCard.getByRole("button", { name: /^Home has it\. Show where it is/ })
    ).toBeTruthy()
    expect(
      inCard.queryByRole("button", { name: "Share scouts to Drive" })
    ).toBeNull()
    expect(screen.queryByText("Nothing new to share.")).toBeNull()
  })
})

describe("a scouts share nobody confirmed, that a run read (JB2)", () => {
  it("still asks whether it arrived, though every card reads read", async () => {
    const { phoneJobs } = await import("@/lib/jobs")
    const { digest } = await import("@/lib/jobs/__tests__/fixture")
    const jobs = phoneJobs()
    jobs.addScout(
      {
        url: "https://jobs.lever.co/acme/2",
        track: "software",
        family: null,
        title: "Site Reliability Engineer",
        why: "",
        postingText: null,
      },
      []
    )
    const shared = await jobs.share("scouts")
    expect(shared.outcome).toBe("shared")
    const files = jobs
      .getSnapshot()
      .state.log.flatMap((e) => (e.type === "shared" ? [e.file] : []))
    jobs.keeping.fetched([{ ...digest("2026-10-19"), read: files }])

    const { JobsScout } = await import("@/components/jobs/scout")
    const { KeptOnHome } = await import("@/components/jobs/parts")
    render(
      <KeptOnHome value>
        <JobsScout />
      </KeptOnHome>
    )
    const card = screen.getByRole("heading", {
      name: "Site Reliability Engineer",
    })
    expect(card.closest("[data-journey]")?.getAttribute("data-journey")).toBe(
      "read"
    )
    expect(screen.getByRole("button", { name: "It arrived" })).toBeTruthy()
  })
})
