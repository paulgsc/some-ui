import { inMemoryStorage } from "@some-ui/core-utils"
import type { KeyedStorage } from "@some-ui/core-utils"
import { describe, expect, it, vi } from "vitest"

import { isFile } from "@/lib/jobs/files"
import type { PickRef } from "@/lib/jobs/model"
import type { NoticeAsked, NoticePort } from "@/lib/jobs/runtime"
import { createJobsRuntime } from "@/lib/jobs/runtime"
import { STORAGE_KEY } from "@/lib/jobs/stored"

import { digest, ports, run } from "./fixture"

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

    // A record kept before the phone noted when home last answered opens
    // with none.
    const noted = p.storage.getItem(STORAGE_KEY) ?? ""
    expect(noted).toContain(',"lookedAt":null')
    p.storage.setItem(STORAGE_KEY, noted.replace(',"lookedAt":null', ""))
    expect(createJobsRuntime(p).getSnapshot().state.home.lookedAt).toBeNull()

    // A record kept before the phone read the runs' records has none, and a
    // stored run this build can't read is left out, the record kept.
    const before = p.storage.getItem(STORAGE_KEY) ?? ""
    expect(before).toContain(',"runs":null')
    const good = run("2026-10-18T14:52:07Z")
    const odd = { routine: "jobs", outcome: "fine" }
    p.storage.setItem(
      STORAGE_KEY,
      before.replace(',"runs":null', `,"runs":${JSON.stringify([good, odd])}`)
    )
    expect(createJobsRuntime(p).getSnapshot().state).toMatchObject({
      current: "2026-10-18",
      home: { runs: [good] },
    })
    p.storage.setItem(STORAGE_KEY, before.replace(',"runs":null', ""))
    expect(createJobsRuntime(p).getSnapshot().state.home.runs).toBeNull()

    // A record the first Jobs build kept has no `home`: it opens, not kept there.
    const kept: unknown = JSON.parse(p.storage.getItem(STORAGE_KEY) ?? "{}")
    const firstBuild = Object.fromEntries(
      Object.entries(kept ?? {}).filter(([key]) => key !== "home")
    )
    p.storage.setItem(STORAGE_KEY, JSON.stringify(firstBuild))
    expect(createJobsRuntime(p).getSnapshot().state).toMatchObject({
      current: "2026-10-18",
      home: { kept: false, held: [], refused: [], refusedFiles: [] },
    })

    p.storage.setItem(STORAGE_KEY, "{torn")
    const fresh = createJobsRuntime(p)
    expect(fresh.getSnapshot().state.digests).toEqual([])
    expect(fresh.getSnapshot().readOnly).toBe(false)
  })

  it("refuses every change when the storage can't be read", () => {
    const blocked: KeyedStorage = {
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

  it("says nothing of a reading, kept or not, and leaves what the next change I make says", () => {
    const memory = inMemoryStorage()
    let full = false
    const storage: KeyedStorage = {
      ...memory,
      setItem: (key, value) => {
        if (full) throw new Error("full")
        memory.setItem(key, value)
      },
    }
    const runtime = createJobsRuntime(ports({ storage }))
    runtime.keeping.fetched([digest("2026-10-18")])
    const pick = runtime.getSnapshot().state.digests[0].picks[0]
    const ref = {
      day: "2026-10-18",
      pickId: pick.id,
      fingerprint: pick.fingerprint,
    }
    full = true
    expect(runtime.read(ref)).toBe(false)
    expect(runtime.getSnapshot().problem).toBeNull()
    // Home answering with nothing new, unkept, says nothing either.
    runtime.keeping.fetched([])
    expect(runtime.getSnapshot().problem).toBeNull()
    expect(runtime.record({ type: "taken", ...ref })).toBe(false)
    expect(runtime.getSnapshot().problem).not.toBeNull()
    full = false
    expect(runtime.read(ref)).toBe(true)
    expect(runtime.getSnapshot().problem).not.toBeNull()
    expect(runtime.read(ref)).toBe(false)
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

  it("records a file home took as shared and arrived, and offers it no more", async () => {
    const runtime = createJobsRuntime(ports())
    runtime.open(blob(JSON.stringify(digest("2026-10-18"))))
    await settle()
    const pick = runtime.getSnapshot().state.digests[0].picks[1]
    runtime.record({
      type: "passed",
      day: "2026-10-18",
      pickId: pick.id,
      fingerprint: pick.fingerprint,
      reasons: ["pay"],
      note: "",
      voice: [],
    })
    const file = runtime.keeping.outgoing("decisions")
    if (!isFile(file)) throw new Error("expected a file")

    expect(runtime.keeping.filed("decisions", file)).toBe(true)
    const [shared, arrived] = runtime.getSnapshot().state.log.slice(-2)
    expect(shared).toMatchObject({
      type: "shared",
      kind: "decisions",
      file: file.name,
      voice: [],
    })
    expect(arrived).toMatchObject({ type: "arrived", shareId: shared.id })
    expect(runtime.keeping.outgoing("decisions")).toBeNull()
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

  it("keeps each form's draft between launches, apart from the record, until what settles it is kept (JB1)", async () => {
    const p = ports()
    const runtime = createJobsRuntime(p)
    const day = digest("2026-10-18")
    runtime.open(blob(JSON.stringify(day)))
    await settle()
    const [first, second] = day.picks
    const refOf = (pick: typeof first): PickRef => ({
      day: day.day,
      pickId: pick.id,
      fingerprint: pick.fingerprint,
    })
    const record = runtime.getSnapshot().state
    const owner = (pick: typeof first, form: string): string =>
      `${day.day}/${pick.id}/${form}`
    const debrief = {
      form: "debrief",
      minutes: "20",
      friction: 2,
      chips: [],
      what: "Workday",
      result: "submitted",
    } as const
    runtime.draft(owner(first, "pass"), {
      form: "pass",
      reasons: ["pay"],
      note: "Too low",
    })
    runtime.draft(owner(second, "fit"), { form: "fit", note: "I ran it" })
    runtime.draft(owner(second, "debrief"), debrief)
    expect(createJobsRuntime(p).getSnapshot().state).toEqual(record)

    const relaunched = createJobsRuntime(p)
    expect(Object.keys(relaunched.getSnapshot().drafts)).toHaveLength(3)
    relaunched.record({
      type: "passed",
      ...refOf(first),
      reasons: ["pay"],
      note: "Too low",
      voice: [],
    })
    relaunched.record({ type: "taken", ...refOf(second) })
    relaunched.record({ type: "resume-ready", ...refOf(second) })
    relaunched.record({ type: "apply-opened", ...refOf(second) })
    relaunched.record({
      type: "fit-note",
      ...refOf(second),
      note: "I ran it",
      voice: [],
    })
    expect(Object.keys(relaunched.getSnapshot().drafts)).toEqual([
      owner(second, "debrief"),
    ])
    relaunched.record({
      type: "debrief",
      ...refOf(second),
      minutes: 20,
      friction: 2,
      chips: [],
      what: "Workday",
      voice: [],
      result: "submitted",
    })
    expect(createJobsRuntime(p).getSnapshot().drafts).toEqual({})
  })

  it("keeps the drafts it can read, copies the value aside first, and never writes over one it couldn't copy", () => {
    const kept = JSON.stringify({
      "2026-10-18/a/fit": { form: "fit", note: "I ran it" },
      x: { form: "gone" },
    })
    const p = ports()
    p.storage.setItem("some-ui:jobs:drafts", kept)
    const runtime = createJobsRuntime(p)
    expect(runtime.getSnapshot().drafts).toEqual({
      "2026-10-18/a/fit": { form: "fit", note: "I ran it" },
    })
    expect(p.storage.getItem("some-ui:jobs:drafts:unreadable:1")).toBe(kept)

    // A full phone: the copy aside fails, so the value stays as it was.
    const full = ports()
    full.storage.setItem("some-ui:jobs:drafts", kept)
    const setItem = full.storage.setItem.bind(full.storage)
    full.storage.setItem = (key, value): void => {
      if (key.includes(":unreadable:")) throw new Error("full")
      setItem(key, value)
    }
    const cramped = createJobsRuntime(full)
    cramped.draft("2026-10-18/b/fit", { form: "fit", note: "hi" })
    expect(full.storage.getItem("some-ui:jobs:drafts")).toBe(kept)
    expect(cramped.getSnapshot().problem).toMatch(/lasts only while Jobs/)
    expect(cramped.getSnapshot().drafts).toHaveProperty("2026-10-18/b/fit")
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

describe("the arrival notice", () => {
  const asking = (
    ...answers: Array<NoticeAsked>
  ): { port: NoticePort; asked: () => number } => {
    let asked = 0
    return {
      port: {
        register: (): Promise<NoticeAsked> => {
          const answer = answers.at(Math.min(asked, answers.length - 1))
          asked += 1
          return Promise.resolve(answer ?? { kind: "failed" })
        },
      },
      asked: () => asked,
    }
  }

  it("is not offered where this build has no push service", () => {
    expect(createJobsRuntime(ports()).getSnapshot().notice.offered).toBe(false)
  })

  it("turned on, keeps the push service's token and owes it to home", async () => {
    const { port } = asking({ kind: "token", token: "t1" })
    const runtime = createJobsRuntime(ports({ notice: port }))
    expect(runtime.getSnapshot().notice.offered).toBe(true)
    runtime.wantNotice(true)
    expect(runtime.getSnapshot().notice.asking).toBe(true)
    await settle()
    expect(runtime.getSnapshot().state.home.notice).toEqual({
      wanted: true,
      token: "t1",
      filed: null,
    })
    expect(runtime.getSnapshot().notice).toEqual({
      offered: true,
      asking: false,
      why: null,
    })
  })

  it("is withdrawn in a build that can't be told, and says no when notifications are off", async () => {
    const gone = createJobsRuntime(
      ports({ notice: asking({ kind: "unavailable" }).port })
    )
    gone.wantNotice(true)
    await settle()
    expect(gone.getSnapshot().notice.offered).toBe(false)
    expect(gone.getSnapshot().state.home.notice.wanted).toBe(false)

    const refused = createJobsRuntime(
      ports({ notice: asking({ kind: "not-allowed" }).port })
    )
    refused.wantNotice(true)
    await settle()
    expect(refused.getSnapshot().notice.why).toBe("not-allowed")
    expect(refused.getSnapshot().state.home.notice.wanted).toBe(false)
  })

  it("asks again on start while it is on, for a token that changed", async () => {
    const p = ports()
    const first = asking({ kind: "token", token: "t1" })
    const runtime = createJobsRuntime({ ...p, notice: first.port })
    runtime.wantNotice(true)
    await settle()
    const next = asking({ kind: "token", token: "t2" })
    const restarted = createJobsRuntime({ ...p, notice: next.port })
    await settle()
    expect(next.asked()).toBe(1)
    expect(restarted.getSnapshot().state.home.notice.token).toBe("t2")
  })

  it("turned off, keeps no late token as asked for", async () => {
    let answer: (asked: NoticeAsked) => void = () => undefined
    const runtime = createJobsRuntime(
      ports({
        notice: {
          register: () =>
            new Promise<NoticeAsked>((resolve) => {
              answer = resolve
            }),
        },
      })
    )
    runtime.wantNotice(true)
    runtime.wantNotice(false)
    answer({ kind: "token", token: "late" })
    await settle()
    expect(runtime.getSnapshot().state.home.notice).toEqual({
      wanted: false,
      token: null,
      filed: null,
    })
  })
})
