/**
 * A pull on a Jobs screen (PULL2, #2459): it hears the jobs lane's end in
 * the pull of home, and names the morning run when that run didn't get in
 * step.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import type { KeptRun } from "@/lib/home-link/kept-model"
import { pulledLane } from "@/lib/home-link/lanes"
import { registerJobsPull } from "@/lib/jobs/pull"
import { PULL_CHECKS } from "@/lib/jobs/words"
import { screenRefreshers } from "@/lib/pull-refresh/refreshers"

vi.mock("@/lib/home-link/lanes", () => ({ pulledLane: vi.fn() }))
vi.mock("@/lib/home-link/jobs", () => ({ jobsLane: { id: "jobs" } }))

const ran = vi.mocked(pulledLane)

afterEach(() => {
  ran.mockReset()
})

describe("a pull on a Jobs screen", () => {
  it("hears the jobs lane while its screen shows, and names the morning run when its run didn't get in step", async () => {
    const drop = registerJobsPull()
    const unread = (end: KeptRun | null): Promise<ReadonlyArray<string>> => {
      ran.mockResolvedValueOnce(end)
      return screenRefreshers.checkAll()
    }
    try {
      for (const end of [
        { kind: "synced", at: 1 },
        { kind: "unpaired" },
        null,
      ] as const) {
        expect(await unread(end)).toEqual([])
      }
      for (const end of [
        { kind: "unreachable", at: 1 },
        { kind: "failed", why: "busy" },
        { kind: "forgotten" },
        { kind: "stopped" },
        { kind: "busy" },
      ] as const) {
        expect(await unread(end)).toEqual([PULL_CHECKS])
      }
      expect(ran).toHaveBeenCalledTimes(8)
    } finally {
      drop()
    }
    expect(await screenRefreshers.checkAll()).toEqual([])
    expect(ran).toHaveBeenCalledTimes(8)
  })
})
