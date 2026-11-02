/**
 * A pull on a Jobs screen (PULL2, #2459): it hears the jobs lane's end in
 * the pull of home, and names this morning’s picks when that run didn’t get in
 * step.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import type { KeptRun } from "@/lib/home-link/kept-model"
import { pulledLane } from "@/lib/home-link/lanes"
import { PULL_HOME } from "@/lib/home-link/words"
import { registerJobsPull } from "@/lib/jobs/pull"
import { PULL_CHECKS } from "@/lib/jobs/words"
import { screenRefreshers } from "@/lib/pull-refresh/refreshers"
import { PULL_WORDS } from "@/lib/pull-refresh/words"

vi.mock("@/lib/home-link/lanes", () => ({ pulledLane: vi.fn() }))
vi.mock("@/lib/home-link/jobs", () => ({ jobsLane: { id: "jobs" } }))

const ran = vi.mocked(pulledLane)

afterEach(() => {
  ran.mockReset()
})

describe("a pull on a Jobs screen", () => {
  it("hears the jobs lane while its screen shows, and names this morning’s picks when its run didn’t get in step", async () => {
    const drop = registerJobsPull()
    const unread = (end: KeptRun | null): Promise<ReadonlyArray<string>> => {
      ran.mockResolvedValueOnce(end)
      return screenRefreshers.checkAll()
    }
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
    drop()
  })

  it("is named after home when the jobs lane's run falls short", () => {
    expect(PULL_WORDS.failed([PULL_HOME.what, PULL_CHECKS])).toBe(
      "Couldn’t check home and this morning’s picks just now"
    )
  })
})
