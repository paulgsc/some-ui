/**
 * A pull on a Jobs screen (PULL2, #2459; JP1): it reads this morning's picks
 * and home's record of the runs as the person's own read of home, beside
 * the drain, and names this morning's picks when that read found no answer.
 */
import type { HomeAnswer, HomeCall } from "@some-ui/core-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Run } from "@/lib/home-link/model"
import { PULL_HOME } from "@/lib/home-link/words"
import type { JobsRecordPort } from "@/lib/jobs/home"
import type { JobsState } from "@/lib/jobs/model"
import { registerJobsPull } from "@/lib/jobs/pull"
import { PULL_CHECKS } from "@/lib/jobs/words"
import { screenRefreshers } from "@/lib/pull-refresh/refreshers"
import { PULL_WORDS } from "@/lib/pull-refresh/words"

import { digest, run } from "./fixture"

const { fetched, keep } = vi.hoisted(() => ({
  fetched: vi.fn<JobsRecordPort["fetched"]>(),
  keep: vi.fn<
    (
      run: (send: HomeCall) => Promise<unknown>,
      options?: { readonly onItsOwn?: boolean }
    ) => Promise<Run<unknown>>
  >(),
}))

vi.mock("@/lib/home-link", () => ({
  homeLink: (): { readonly keep: typeof keep } => ({ keep }),
}))
vi.mock("@/lib/jobs", async () => {
  const { EMPTY } = await import("@/lib/jobs/model")
  return {
    phoneJobs: (): {
      readonly keeping: Pick<JobsRecordPort, "state" | "fetched">
    } => ({ keeping: { state: (): JobsState => EMPTY, fetched } }),
  }
})
// The jobs lane's run in the drain: queued behind the other lanes' writes
// on a slowed pace (#3140, #3135), so it has not ended while the pull checks.
vi.mock("@/lib/home-link/lanes", () => ({
  pulledLane: vi.fn(() => new Promise(() => {})),
}))

const TODAY = digest("2026-11-21")
const RUN = run("2026-11-21T15:52:00.000Z")

const ok = (body: unknown): HomeAnswer => ({
  status: 200,
  body: JSON.stringify(body),
})

/** Home as it answers the two reads of a pull on Jobs. */
const home: HomeCall = (method, path) => {
  if (method === "GET" && path === "/jobs/runs") {
    return Promise.resolve(ok({ runs: [{ name: "r1", run: RUN }] }))
  }
  if (method === "GET" && path.startsWith("/jobs/digests")) {
    return Promise.resolve(ok({ digests: [{ day: TODAY.day, digest: TODAY }] }))
  }
  return Promise.resolve({ status: 500, body: "" })
}

beforeEach(() => {
  keep.mockImplementation(async (read) => ({
    kind: "done",
    value: await read(home),
  }))
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("a pull on a Jobs screen", () => {
  it("brings this morning's picks in while the jobs lane's run still waits its turn (JP1)", async () => {
    const drop = registerJobsPull()
    expect(await screenRefreshers.checkAll()).toEqual([])
    expect(fetched).toHaveBeenCalledWith([TODAY], [RUN])
    drop()
  })

  it("reads as the person's own ask of home, sending nothing of the phone's", async () => {
    const sent: Array<string> = []
    keep.mockImplementation(async (read) => ({
      kind: "done",
      value: await read((method, path, body) => {
        sent.push(`${method} ${path}`)
        return home(method, path, body)
      }),
    }))
    const drop = registerJobsPull()
    await screenRefreshers.checkAll()
    expect(keep).toHaveBeenCalledTimes(1)
    expect(keep.mock.calls[0]?.[1]).toBeUndefined()
    expect(sent).toEqual(["GET /jobs/runs", "GET /jobs/digests"])
    drop()
  })

  it("names this morning's picks when home could not be read, and nothing unpaired", async () => {
    const drop = registerJobsPull()
    const unread = (
      answer: () => Promise<Run<unknown>>
    ): Promise<ReadonlyArray<string>> => {
      keep.mockImplementationOnce(answer)
      return screenRefreshers.checkAll()
    }
    expect(
      await unread(() => Promise.resolve({ kind: "refused", why: "unpaired" }))
    ).toEqual([])
    const answers: ReadonlyArray<() => Promise<Run<unknown>>> = [
      // Home busy, or a fault on home.
      (): Promise<Run<unknown>> =>
        Promise.resolve({
          kind: "done" as const,
          value: { kind: "failed", why: "busy" },
        }),
      // Home forgot this phone.
      (): Promise<Run<unknown>> =>
        Promise.resolve({
          kind: "done" as const,
          value: { kind: "forgotten" },
        }),
      // No answer.
      (): Promise<Run<unknown>> => Promise.reject(new Error("no answer")),
    ]
    for (const answer of answers) {
      expect(await unread(answer)).toEqual([PULL_CHECKS])
    }
    // A read stopped before it went is asked again, as a busy link's is.
    fetched.mockClear()
    expect(
      await unread(() => Promise.resolve({ kind: "stopped" as const }))
    ).toEqual([])
    expect(keep).toHaveBeenCalledTimes(6)
    expect(fetched).toHaveBeenCalledWith([TODAY], [RUN])
    drop()
  })

  it("is named after home when the lanes' runs fall short too", () => {
    expect(PULL_WORDS.failed([PULL_HOME.what, PULL_CHECKS])).toBe(
      "Couldn’t check home and this morning’s picks just now"
    )
  })
})
