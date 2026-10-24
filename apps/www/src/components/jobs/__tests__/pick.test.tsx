/**
 * @vitest-environment jsdom
 *
 * A pick's Apply step shows what the run drafted from the posting's form:
 * each draft with a copy button, a required question marked, one left to me
 * said so, and a redraft from my fit notes named as one.
 *
 * JB1: a pick left and come back to is as I left it.
 *
 * - Claim: in the phone's Jobs wing, leaving a pick (for the posting, or
 *   halfway through its pass, fit note or debrief) and coming back shows the
 *   step I left with its paste kit and what I typed, and the debrief offers
 *   no time it can't vouch for.
 * - Family: leave-and-return ordering (after the posting opens and before
 *   the debrief is kept; halfway through each of the three forms; passing
 *   halfway, then taking the pick); time away (within a sitting, past two
 *   hours, the next morning, a tab reopened mid-sitting, the clock moving on
 *   mid-form); the page kept or reloaded (a new runtime over the same
 *   storage).
 * - Proof: the tests below, `timedMinutes (JB1)` in
 *   `lib/jobs/__tests__/model.test.ts`, and the drafts tests in
 *   `lib/jobs/__tests__/runtime.test.ts`.
 * - Tolerance: a draft the phone could not write lasts while Jobs stays
 *   open, and the phone says so.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { phoneJobs } from "@/lib/jobs"
import { digest, ports } from "@/lib/jobs/__tests__/fixture"
import type { PickRef } from "@/lib/jobs/model"
import type { JobsRuntime } from "@/lib/jobs/runtime"
import { createJobsRuntime } from "@/lib/jobs/runtime"

vi.mock("@/lib/jobs", () => ({ phoneJobs: vi.fn(), copyText: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const KIT = {
  fields: [],
  answers: [],
  coverLetter: "I build backend services.",
  questions: [
    { label: "Why us?", required: true, draft: "The pipelines." },
    { label: "Anything else?", required: false, draft: null },
  ],
  compensation: { ask: "$110,000", why: "Inside the posted range." },
}

describe("the kit's drafts", () => {
  it("shows each draft with a copy button, and marks what the form requires", async () => {
    const { KitDrafts } = await import("@/components/jobs/pick")
    render(<KitDrafts kit={KIT} />)
    expect(screen.getByText("I build backend services.")).toBeTruthy()
    expect(screen.getByText("The pipelines.")).toBeTruthy()
    expect(screen.getAllByText("Required")).toHaveLength(1)
    expect(screen.getByText("No draft: this one is mine.")).toBeTruthy()
    expect(screen.getByText("$110,000")).toBeTruthy()
    expect(screen.getByText("Inside the posted range.")).toBeTruthy()
    expect(screen.getByTitle("Copy Cover letter")).toBeTruthy()
    expect(screen.getByTitle("Copy Why us?")).toBeTruthy()
    expect(screen.getByTitle("Copy Pay expectation")).toBeTruthy()
    expect(screen.queryByTitle("Copy Anything else?")).toBeNull()
  })

  it("says when a redraft from my fit notes stands in for the run's own", async () => {
    const { KitDrafts } = await import("@/components/jobs/pick")
    render(<KitDrafts kit={KIT} redraftedOn="2026-10-20" />)
    expect(
      screen.getByText("Redrafted from my fit notes in the 2026-10-20 digest.")
    ).toBeTruthy()
  })

  it("shows nothing for a kit the run drafted nothing for", async () => {
    const { KitDrafts } = await import("@/components/jobs/pick")
    const { container } = render(
      <KitDrafts
        kit={{ ...KIT, coverLetter: null, questions: [], compensation: null }}
      />
    )
    expect(container.textContent).toBe("")
  })
})

const DAY = "2026-10-18"
/** When the runtime stamps every event (`ports().now`). */
const STAMPED = Date.parse("2026-10-18T22:00:00Z")

/** A runtime holding `DAY`'s digest, its first pick with a kit to paste. */
async function runtimeWithDigest(): Promise<{
  jobs: JobsRuntime
  relaunch: () => JobsRuntime
}> {
  const p = ports()
  const day = digest(DAY)
  day.picks[0].kit.fields = [{ label: "Email", value: "me@example.com" }]
  const jobs = createJobsRuntime(p)
  // jsdom's Blob has no `text`.
  jobs.open(
    Object.assign(new Blob([]), {
      text: () => Promise.resolve(JSON.stringify(day)),
    })
  )
  await new Promise((resolve) => setTimeout(resolve, 0))
  vi.mocked(phoneJobs).mockReturnValue(jobs)
  return {
    jobs,
    relaunch: (): JobsRuntime => {
      const again = createJobsRuntime(p)
      vi.mocked(phoneJobs).mockReturnValue(again)
      return again
    },
  }
}

const refOf = (jobs: JobsRuntime, i: number): PickRef => {
  const pick = jobs.getSnapshot().state.digests[0].picks[i]
  return { day: DAY, pickId: pick.id, fingerprint: pick.fingerprint }
}

/** Taken and résumé ready: the pick opens on Apply. */
function readyToApply(jobs: JobsRuntime, i: number): void {
  jobs.record({ type: "taken", ...refOf(jobs, i) })
  jobs.record({ type: "resume-ready", ...refOf(jobs, i) })
}

async function showPick(i: number, jobs: JobsRuntime): Promise<void> {
  const { PickFlow } = await import("@/components/jobs/pick")
  render(<PickFlow day={DAY} pickId={refOf(jobs, i).pickId} />)
}

describe("a pick left for the posting and come back to (JB1)", () => {
  it("keeps the paste kit on screen after the posting opens, until I say I'm done", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(STAMPED)
    const { jobs, relaunch } = await runtimeWithDigest()
    readyToApply(jobs, 0)
    await showPick(0, jobs)
    expect(screen.queryByText("Done with their form")).toBeNull()

    fireEvent.click(screen.getByText("Open the posting"))
    expect(screen.getByText("me@example.com")).toBeTruthy()
    expect(screen.getByText("Done with their form")).toBeTruthy()

    // Back from the browser to a page the WebView reloaded.
    cleanup()
    await showPick(0, relaunch())
    expect(screen.getByText("me@example.com")).toBeTruthy()
    fireEvent.click(screen.getByText("Done with their form"))
    expect(screen.getByLabelText("How long it took, in minutes")).toBeTruthy()
  })

  it("offers the minutes only for a recent sitting, and keeps them once the form is touched", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    const { jobs } = await runtimeWithDigest()
    readyToApply(jobs, 0)
    jobs.record({ type: "apply-opened", ...refOf(jobs, 0) })
    const minutes = (): string =>
      screen
        .getByLabelText("How long it took, in minutes")
        .getAttribute("value") ?? ""
    const debriefAt = async (afterMinutes: number): Promise<void> => {
      cleanup()
      vi.setSystemTime(STAMPED + afterMinutes * 60_000)
      await showPick(0, jobs)
      fireEvent.click(screen.getByText("Debrief"))
    }
    await debriefAt(14 * 60)
    expect(minutes()).toBe("")
    await debriefAt(115)
    expect(minutes()).toBe("115")
    fireEvent.click(screen.getByRole("button", { name: "2" }))
    await debriefAt(125)
    expect(minutes()).toBe("115")
  })

  it("keeps what I typed in the pass, fit note and debrief when I leave halfway", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(STAMPED)
    const { jobs, relaunch } = await runtimeWithDigest()
    readyToApply(jobs, 1)
    jobs.record({ type: "apply-opened", ...refOf(jobs, 1) })

    await showPick(0, jobs)
    fireEvent.click(screen.getAllByRole("button", { name: "Decide" })[0])
    fireEvent.click(screen.getByRole("button", { name: "Pass" }))
    fireEvent.click(screen.getByRole("button", { name: "Seniority" }))
    fireEvent.change(screen.getByLabelText("In a few words"), {
      target: { value: "Wants a staff engineer" },
    })
    cleanup()
    await showPick(1, jobs)
    fireEvent.change(screen.getByLabelText("Why I fit it"), {
      target: { value: "I ran their stack" },
    })
    fireEvent.click(screen.getByText("Done with their form"))
    fireEvent.change(screen.getByLabelText("What happened"), {
      target: { value: "Workday wanted an account" },
    })
    cleanup()

    const again = relaunch()
    await showPick(0, again)
    fireEvent.click(screen.getAllByRole("button", { name: "Decide" })[0])
    expect(screen.getByLabelText("In a few words")).toHaveProperty(
      "value",
      "Wants a staff engineer"
    )
    expect(
      screen
        .getByRole("button", { name: "Seniority" })
        .getAttribute("aria-pressed")
    ).toBe("true")
    fireEvent.click(screen.getByText("Take it"))
    fireEvent.click(screen.getAllByRole("button", { name: "Decide" })[0])
    expect(screen.queryByLabelText("In a few words")).toBeNull()
    cleanup()

    await showPick(1, again)
    expect(screen.getByLabelText("Why I fit it")).toHaveProperty(
      "value",
      "I ran their stack"
    )
    fireEvent.click(screen.getByText("Done with their form"))
    expect(screen.getByLabelText("What happened")).toHaveProperty(
      "value",
      "Workday wanted an account"
    )
  })
})
