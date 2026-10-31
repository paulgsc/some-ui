/**
 * @vitest-environment jsdom
 *
 * The Scout view answers each scout with the run's verdict, and a scout the
 * run found but didn't pick with its scores, its gaps and the résumé to
 * build for it anyway. Its form asks for the posting's text with a link the
 * run can't open.
 */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/jobs", async () => {
  const { createJobsRuntime } = await import("@/lib/jobs/runtime")
  const { ports } = await import("@/lib/jobs/__tests__/fixture")
  const runtime = createJobsRuntime(ports())
  return { phoneJobs: (): typeof runtime => runtime }
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
  it("wears where it is: on the phone, then with home, and offers Drive at neither (HF2)", async () => {
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
    expect(screen.queryByRole("button", { name: /Drive/ })).toBeNull()

    const file = jobs.keeping.outgoing("scouts")
    if (!isFile(file)) throw new Error("no scouts file")
    act(() => {
      jobs.keeping.filed("scouts", file)
    })
    expect(bar()).toBe("with-home")
    expect(
      inCard.getByRole("button", { name: /^Home has it\. Show where it is/ })
    ).toBeTruthy()
  })
})

describe("the scout form, with a link the run can't open (SC1)", () => {
  it("says so as the link is typed, and waits for the posting's text", async () => {
    const { phoneJobs } = await import("@/lib/jobs")
    const { JobsScout } = await import("@/components/jobs/scout")
    render(<JobsScout />)
    const add = (): HTMLButtonElement =>
      screen.getByRole("button", { name: "Add to my scouts" })
    const cantOpen = "The run can’t open this link: paste the posting itself"
    fireEvent.change(screen.getByLabelText("Title and company"), {
      target: { value: "Junior Software Engineer · Tarpon Health" },
    })

    fireEvent.change(screen.getByLabelText("Link"), {
      target: { value: "https://jobs.lever.co/acme/1" },
    })
    expect(screen.queryByText(cantOpen)).toBeNull()
    expect(screen.getByLabelText("Posting text, optional")).toBeTruthy()
    expect(add().disabled).toBe(false)

    fireEvent.change(screen.getByLabelText("Link"), {
      target: { value: "https://jobs.gusto.com/postings/tarpon-health-1" },
    })
    expect(screen.getByText(cantOpen)).toBeTruthy()
    expect(add().disabled).toBe(true)

    fireEvent.change(screen.getByLabelText("Posting text"), {
      target: { value: "Junior Software Engineer\nTarpon Health · Remote" },
    })
    expect(add().disabled).toBe(false)
    fireEvent.click(add())
    // Earlier tests' scouts stay in the mocked runtime; this one is newest.
    const filed = phoneJobs()
      .getSnapshot()
      .state.log.flatMap((e) => (e.type === "scout" ? [e.scout] : []))
      .at(-1)
    expect(filed?.url).toBe("https://jobs.gusto.com/postings/tarpon-health-1")
    expect(filed?.postingText).toBe(
      "Junior Software Engineer\nTarpon Health · Remote"
    )
  })
})
