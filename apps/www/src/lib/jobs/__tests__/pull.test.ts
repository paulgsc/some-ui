/**
 * JP1, a pull on a Jobs screen (PULL2, #2459).
 *
 * - Claim: its check reads this morning's picks and home's runs as the
 *   person's own read of home (`askJobsPicks`, the link's `keep`), never by
 *   waiting on a lane's run.
 * - Family: every drain order (lanes queued ahead of the jobs lane), every
 *   pace on the drain's side, a pull joining a run under way: none of them
 *   reach the check, which holds no lane's run.
 * - Proof: here, that the check is answered by `keep`'s read alone, and by
 *   LA15's falsifier (docs/learner-data-authority.md), that its refresher
 *   waits on no lane's run; `readDigests` sending only its two `GET`s is
 *   `./home.test.ts`'s.
 * - Tolerance: the lane's run and the pull's read can each take in home's
 *   runs, and the later to land is kept, so an older list can stand until
 *   the next read; a day's digest is never replaced either way.
 */
import type { HomeAnswer, HomeCall } from "@some-ui/core-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { HomeNoAnswerError } from "@/lib/device-backend/native-http/no-answer"
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
  it("reads this morning's picks itself, as the person's own read of home, not by waiting on a lane's run (JP1)", async () => {
    const drop = registerJobsPull()
    expect(await screenRefreshers.checkAll()).toEqual([])
    expect(fetched).toHaveBeenCalledWith([TODAY], [RUN])
    expect(keep).toHaveBeenCalledTimes(1)
    expect(keep.mock.calls[0]?.[1]).toBeUndefined()
    drop()
  })

  it("names this morning's picks when home could not be read, and nothing unpaired", async () => {
    const drop = registerJobsPull()
    keep.mockResolvedValueOnce({ kind: "refused", why: "unpaired" })
    expect(await screenRefreshers.checkAll()).toEqual([])
    keep.mockResolvedValueOnce({
      kind: "done",
      value: { kind: "failed", why: "busy" },
    })
    expect(await screenRefreshers.checkAll()).toEqual([PULL_CHECKS])
    keep.mockRejectedValueOnce(
      new HomeNoAnswerError({
        kind: "unreachable",
        retryable: true,
        summary: "Couldn't reach the home server.",
        cause: null,
      })
    )
    expect(await screenRefreshers.checkAll()).toEqual([PULL_CHECKS])
    drop()
  })

  it("is named after home when the lanes' runs fall short too", () => {
    expect(PULL_WORDS.failed([PULL_HOME.what, PULL_CHECKS])).toBe(
      "Couldn’t check home and this morning’s picks just now"
    )
  })
})
