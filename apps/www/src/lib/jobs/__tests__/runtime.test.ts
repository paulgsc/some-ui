import { describe, expect, it, vi } from "vitest"

import { createJobsRuntime } from "@/lib/jobs/runtime"
import { STORAGE_KEY } from "@/lib/jobs/stored"
import type { StorageAdapter } from "@/lib/tenant/storage"

import { digest, ports } from "./fixture"

const blob = (text: string): Blob =>
  new Blob([text], { type: "application/json" })

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0))

describe("createJobsRuntime", () => {
  it("opens a picked digest, and a later pick wins over one still being read", async () => {
    const runtime = createJobsRuntime(ports())
    let release: (text: string) => void = () => undefined
    const slow = Object.assign(new Blob([]), {
      text: (): Promise<string> => new Promise<string>((r) => (release = r)),
    })
    runtime.open(slow)
    runtime.open(blob(JSON.stringify(digest("2026-10-18"))))
    await settle()
    release(JSON.stringify(digest("2026-10-01")))
    await settle()
    expect(runtime.getSnapshot().state.current).toBe("2026-10-18")
    expect(runtime.getSnapshot().state.digests).toHaveLength(1)
  })

  it("says why a file isn't a digest", async () => {
    const runtime = createJobsRuntime(ports())
    runtime.open(blob("{}"))
    await settle()
    expect(runtime.getSnapshot().importing).toMatchObject({ kind: "rejected" })
  })

  it("keeps the record between launches, and starts again past an unreadable one", async () => {
    const p = ports()
    const runtime = createJobsRuntime(p)
    runtime.open(blob(JSON.stringify(digest("2026-10-18"))))
    await settle()
    expect(createJobsRuntime(p).getSnapshot().state.current).toBe("2026-10-18")

    // A record the first Jobs build kept has no `home`: it opens, not kept there.
    const kept: unknown = JSON.parse(p.storage.getItem(STORAGE_KEY) ?? "{}")
    const firstBuild = Object.fromEntries(
      Object.entries(kept ?? {}).filter(([key]) => key !== "home")
    )
    p.storage.setItem(STORAGE_KEY, JSON.stringify(firstBuild))
    expect(createJobsRuntime(p).getSnapshot().state).toMatchObject({
      current: "2026-10-18",
      home: { kept: false, held: [], refused: [] },
    })

    p.storage.setItem(STORAGE_KEY, "{torn")
    const fresh = createJobsRuntime(p)
    expect(fresh.getSnapshot().state.digests).toEqual([])
    expect(fresh.getSnapshot().readOnly).toBe(false)
  })

  it("refuses every change when the storage can't be read", () => {
    const blocked: StorageAdapter = {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    }
    const runtime = createJobsRuntime(ports({ storage: blocked }))
    expect(runtime.getSnapshot().readOnly).toBe(true)
    expect(
      runtime.addOutcome("northwind avionics|software engineer|remote", "reply")
    ).toBe(false)
    expect(runtime.getSnapshot().problem).not.toBeNull()
    expect(runtime.getSnapshot().state.log).toEqual([])
  })

  it("offers a share again until it arrived, by a name of its own", async () => {
    const p = ports()
    const runtime = createJobsRuntime(p)
    runtime.open(blob(JSON.stringify(digest("2026-10-18"))))
    await settle()
    const pick = runtime.getSnapshot().state.digests[0].picks[1]
    const ref = {
      day: "2026-10-18",
      pickId: pick.id,
      fingerprint: pick.fingerprint,
    }
    expect(
      runtime.record({
        type: "passed",
        ...ref,
        reasons: ["pay"],
        note: "",
        voice: [],
      })
    ).toBe(true)

    const shared = await runtime.share("decisions")
    expect(shared.outcome).toBe("shared")
    expect(p.share).toHaveBeenCalledWith("job-decisions", expect.any(String), [
      expect.objectContaining({ name: "decisions-2026-10-18.json" }),
    ])
    // Not yet arrived: the same picks go again, beside the first file.
    const again = await runtime.share("decisions")
    expect(p.share).toHaveBeenLastCalledWith(
      "job-decisions",
      expect.any(String),
      [expect.objectContaining({ name: "decisions-2026-10-18-2.json" })]
    )
    if (again.outcome === "shared") runtime.arrived(again.shareId)
    expect(runtime.getSnapshot().state.log.at(-1)?.type).toBe("arrived")
    expect(await runtime.share("decisions")).toEqual({ outcome: "nothing" })
  })

  it("gives a scout an id of its own, and dates an outcome today", () => {
    const runtime = createJobsRuntime(ports({ dayOf: () => "2026-10-19" }))
    expect(
      runtime.addScout(
        {
          url: "https://www.indeed.com/viewjob?jk=0123456789abcdef",
          title: "SDET · Second Dinner",
          why: "Game testing",
          postingText: null,
          track: "adjacent",
          family: "qa",
        },
        []
      )
    ).toBe(true)
    expect(
      runtime.addOutcome("tidewater analytics|data analyst|remote", "reply")
    ).toBe(true)
    const [scout, outcome] = runtime.getSnapshot().state.log
    expect(scout).toMatchObject({ type: "scout", scout: { id: "sc-id1" } })
    expect(outcome).toMatchObject({ type: "outcome", on: "2026-10-19" })
  })

  it("archives a digest's undecided picks", async () => {
    const runtime = createJobsRuntime(ports())
    const day = digest("2026-10-18")
    runtime.open(blob(JSON.stringify(day)))
    await settle()
    const [taken, left] = day.picks
    runtime.record({
      type: "taken",
      day: day.day,
      pickId: taken.id,
      fingerprint: taken.fingerprint,
    })
    expect(runtime.archive(day.day)).toBe(true)
    expect(runtime.archive(day.day)).toBe(false)
    const archived = runtime
      .getSnapshot()
      .state.log.filter((e) => e.type === "archived")
    expect(archived).toEqual([
      expect.objectContaining({ pickId: left.id, day: day.day }),
    ])
  })

  it("records nothing for a share backed out of", async () => {
    const p = ports({
      share: vi.fn(() => Promise.resolve<"shared" | "cancelled">("cancelled")),
    })
    const runtime = createJobsRuntime(p)
    runtime.open(blob(JSON.stringify(digest("2026-10-17"))))
    await settle()
    expect(await runtime.share("decisions")).toEqual({ outcome: "cancelled" })
    expect(runtime.getSnapshot().state.log).toEqual([])
  })
})
