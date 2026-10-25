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
import type { JobEvent, PickRef } from "@/lib/jobs/model"
import type { JobsPorts, JobsRuntime } from "@/lib/jobs/runtime"
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

/**
 * A runtime holding `DAY`'s digest, its first pick with a kit to paste, on
 * the fixture's day unless `overrides` move its clock.
 */
async function runtimeWithDigest(overrides: Partial<JobsPorts> = {}): Promise<{
  jobs: JobsRuntime
  relaunch: () => JobsRuntime
}> {
  const p = ports(overrides)
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
    expect(screen.getByRole("button", { name: "Sent" })).toBeTruthy()
  })

  it("offers the minutes only for a recent sitting, and keeps them once the form is opened", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    const { jobs } = await runtimeWithDigest()
    for (const i of [0, 1]) {
      readyToApply(jobs, i)
      jobs.record({ type: "apply-opened", ...refOf(jobs, i) })
    }
    const minutes = (): string =>
      screen
        .getByLabelText("How long it took, in minutes")
        .getAttribute("value") ?? ""
    const endingAt = async (i: number, afterMinutes: number): Promise<void> => {
      cleanup()
      vi.setSystemTime(STAMPED + afterMinutes * 60_000)
      await showPick(i, jobs)
      fireEvent.click(screen.getByText("Ending"))
      const add = screen.queryByText("Add how it went")
      if (add) fireEvent.click(add)
    }
    await endingAt(1, 14 * 60)
    expect(minutes()).toBe("")
    await endingAt(0, 115)
    expect(minutes()).toBe("115")
    await endingAt(0, 125)
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
    fireEvent.click(
      screen.getByRole("button", { name: "Not for me, and say why" })
    )
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
    fireEvent.click(screen.getByText("Add how it went"))
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
    fireEvent.click(screen.getByText("Send it"))
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

/** The events of `type` the record holds for pick `i`. */
const eventsOf = (
  jobs: JobsRuntime,
  i: number,
  type: JobEvent["type"]
): ReadonlyArray<JobEvent> =>
  jobs
    .getSnapshot()
    .state.log.filter(
      (e) =>
        e.type === type && "pickId" in e && e.pickId === refOf(jobs, i).pickId
    )

describe("a pick read, decided and ended in a tap each (S1′)", () => {
  it("ends a pick with only how it ended, and the ending survives a reload", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(STAMPED)
    const { jobs, relaunch } = await runtimeWithDigest()
    readyToApply(jobs, 0)
    jobs.record({ type: "apply-opened", ...refOf(jobs, 0) })
    await showPick(0, jobs)
    fireEvent.click(screen.getByText("Done with their form"))
    fireEvent.click(screen.getByRole("button", { name: "Sent" }))
    expect(eventsOf(jobs, 0, "debrief")).toMatchObject([
      {
        minutes: null,
        friction: null,
        chips: [],
        what: "",
        voice: [],
        result: "submitted",
      },
    ])
    cleanup()
    const again = relaunch()
    expect(eventsOf(again, 0, "debrief")).toMatchObject([
      { minutes: null, friction: null, result: "submitted" },
    ])
    await showPick(0, again)
    expect(screen.getByText(/^Ended: Sent\./)).toBeTruthy()
  })

  it("keeps how long it took only when I opened how it went", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(STAMPED + 20 * 60_000)
    const { jobs } = await runtimeWithDigest()
    readyToApply(jobs, 0)
    jobs.record({ type: "apply-opened", ...refOf(jobs, 0) })
    await showPick(0, jobs)
    fireEvent.click(screen.getByText("Done with their form"))
    fireEvent.click(screen.getByText("Add how it went"))
    fireEvent.click(screen.getByRole("button", { name: "4" }))
    fireEvent.click(screen.getByRole("button", { name: "Stopped partway" }))
    expect(eventsOf(jobs, 0, "debrief")).toMatchObject([
      { minutes: 20, friction: 4, result: "gave-up" },
    ])
  })

  it("holds back the ending while the minutes typed don't fit, and takes an emptied box as unsaid", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(STAMPED)
    const { jobs } = await runtimeWithDigest()
    readyToApply(jobs, 0)
    jobs.record({ type: "apply-opened", ...refOf(jobs, 0) })
    await showPick(0, jobs)
    fireEvent.click(screen.getByText("Done with their form"))
    fireEvent.click(screen.getByText("Add how it went"))
    const box = screen.getByLabelText("How long it took, in minutes")
    fireEvent.change(box, { target: { value: "0" } })
    expect(screen.getByRole("button", { name: "Sent" })).toHaveProperty(
      "disabled",
      true
    )
    fireEvent.change(box, { target: { value: "" } })
    fireEvent.click(screen.getByRole("button", { name: "Sent" }))
    expect(eventsOf(jobs, 0, "debrief")).toMatchObject([{ minutes: null }])
  })

  it("passes on a pick with no reason", async () => {
    const { jobs } = await runtimeWithDigest()
    await showPick(0, jobs)
    fireEvent.click(screen.getByText("On to deciding"))
    fireEvent.click(screen.getByRole("button", { name: "Not for me" }))
    expect(eventsOf(jobs, 0, "passed")).toMatchObject([
      { reasons: [], note: "", voice: [] },
    ])
  })

  it("records a reading once a day, with no decision, and moves nothing", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(STAMPED)
    // The phone's clock, read as UTC days.
    const { jobs } = await runtimeWithDigest({
      now: () => new Date(),
      dayOf: (at) => at.toISOString().slice(0, 10),
    })
    await showPick(0, jobs)
    expect(screen.getByText("What they want")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Send it" })).toBeNull()
    cleanup()
    await showPick(0, jobs)
    expect(eventsOf(jobs, 0, "read")).toHaveLength(1)
    expect(eventsOf(jobs, 0, "taken")).toHaveLength(0)
    cleanup()
    vi.setSystemTime(STAMPED + 24 * 60 * 60_000)
    await showPick(0, jobs)
    expect(eventsOf(jobs, 0, "read")).toHaveLength(2)
  })
})
