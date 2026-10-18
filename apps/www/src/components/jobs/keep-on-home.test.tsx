/**
 * @vitest-environment jsdom
 *
 * LA10 on the Jobs screens: kept on this phone, the Record view offers to
 * keep a copy on home, naming the host and how many events go before the
 * second press that does it; nothing reaches home before that press, and
 * the wing's watch asks nothing while the record is not kept there.
 */

import type * as ReactRouterModule from "@tanstack/react-router"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { HomeCall as NativeCall } from "@/lib/device-backend/native-http"

const home = vi.hoisted(
  (): { sent: Array<unknown>; record: string | null } => ({
    sent: [],
    record: null,
  })
)

vi.mock("@/lib/device-backend/native-http", () => ({
  homeRequest: (
    call: NativeCall
  ): Promise<{ status: number; body: string }> => {
    home.sent.push(call)
    return Promise.reject(new Error("no route to host"))
  },
}))
vi.mock("@/lib/home-link/credential", () => ({
  nativeCredential: {
    read: (): Promise<{ record: string | null; lost: boolean }> =>
      Promise.resolve({ record: home.record, lost: false }),
    write: (): Promise<void> => Promise.resolve(),
    clear: (): Promise<void> => Promise.resolve(),
  },
}))
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
vi.mock(
  "@tanstack/react-router",
  async (importOriginal): Promise<typeof ReactRouterModule> => {
    const { withPlainLink } = await import("@/test-support/router-stubs")
    return withPlainLink(await importOriginal<typeof ReactRouterModule>())
  }
)

afterEach(() => {
  cleanup()
  vi.resetModules()
  home.sent = []
  home.record = null
})

const paired = (): void => {
  home.record = JSON.stringify({
    base: "https://home.example/api/v1",
    token: "t",
  })
}

const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

/**
 * The phone's record with two picks taken, and the wing open on Record.
 * Resolves to how many events the record holds.
 */
async function show(): Promise<number> {
  const { phoneJobs } = await import("@/lib/jobs")
  const { digest } = await import("@/lib/jobs/__tests__/fixture")
  const jobs = phoneJobs()
  const day = digest("2026-10-18")
  // jsdom's Blob reads no text; the runtime only asks for it.
  const text = JSON.stringify(day)
  jobs.open(
    Object.assign(new Blob([]), {
      text: (): Promise<string> => Promise.resolve(text),
    })
  )
  await vi.waitFor(() => {
    expect(jobs.getSnapshot().importing).toEqual({ kind: "idle" })
    expect(jobs.getSnapshot().state.current).toBe(day.day)
  })
  for (const pick of day.picks) {
    expect(
      jobs.record({
        type: "taken",
        day: day.day,
        pickId: pick.id,
        fingerprint: pick.fingerprint,
      })
    ).toBe(true)
  }
  const { JobsHomeWatch, JobsKeepOnHome } = await import(
    "@/components/jobs/keep-on-home"
  )
  render(
    <>
      <JobsHomeWatch />
      <JobsKeepOnHome />
    </>
  )
  await settle()
  return jobs.getSnapshot().state.log.length
}

describe("where the Jobs record is kept", () => {
  it("is on this phone only, and nothing is asked of home until it's kept there", async () => {
    paired()
    await show()
    expect(screen.getByText(/Kept on this phone only/)).toBeTruthy()
    expect(home.sent).toEqual([])
  })

  it("names the host and the count before the second press keeps a copy there", async () => {
    paired()
    const events = await show()
    fireEvent.click(
      screen.getByRole("button", { name: "Keep on home.example..." })
    )
    expect(
      screen.getByText(new RegExp(`Send ${events} events to home\\.example`))
    ).toBeTruthy()
    expect(home.sent).toEqual([])

    fireEvent.click(
      screen.getByRole("button", { name: "Keep on home.example" })
    )
    await settle()
    expect(
      await screen.findByText(
        `${events} changes wait on this phone until home.example answers.`
      )
    ).toBeTruthy()
  })
})
