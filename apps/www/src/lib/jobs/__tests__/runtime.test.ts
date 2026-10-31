import { inMemoryStorage } from "@some-ui/core-utils"
import type { KeyedStorage } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

import { isFile } from "@/lib/jobs/files"
import type { PickRef } from "@/lib/jobs/model"
import { EMPTY, step } from "@/lib/jobs/model"
import type { NoticeAsked, NoticePort } from "@/lib/jobs/runtime"
import { createJobsRuntime } from "@/lib/jobs/runtime"
import { STORAGE_KEY, writeStored } from "@/lib/jobs/stored"

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
      home: { held: [], refused: [], refusedFiles: [] },
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

  it("files what a share nobody said arrived carried, by a name of its own", async () => {
    const p = ports()
    const before = createJobsRuntime(p)
    before.open(blob(JSON.stringify(digest("2026-10-18"))))
    await settle()
    const pick = before.getSnapshot().state.digests[0].picks[1]
    before.record({
      type: "passed",
      day: "2026-10-18",
      pickId: pick.id,
      fingerprint: pick.fingerprint,
      reasons: ["pay"],
      note: "",
      voice: [],
    })
    // A Drive share from before HF2 that nobody said arrived.
    const held = before.getSnapshot().state
    writeStored(
      p.storage,
      step(held, {
        type: "record",
        event: {
          type: "shared",
          kind: "decisions",
          day: "2026-10-18",
          file: "decisions-2026-10-18.json",
          through: held.log.length,
          voice: [],
        },
        stamp: { id: "s1", at: "2026-10-18T21:00:00.000Z" },
      })
    )
    const runtime = createJobsRuntime(p)
    const file = runtime.keeping.outgoing("decisions")
    if (!isFile(file)) throw new Error("expected a file")
    expect(file.name).toBe("decisions-2026-10-18-2.json")
    expect(JSON.parse(file.json).picks).toEqual([
      expect.objectContaining({ pickId: pick.id, decision: "passed" }),
    ])
  })

  it("lets a voice note's audio go on home's word alone, never on its file's filing (LG1)", async () => {
    const p = ports()
    const note = { mimeType: "audio/webm", durationMs: 3_000, owner: "o" }
    writeStored(p.storage, {
      ...EMPTY,
      voice: [
        { ...note, id: "v1" },
        { ...note, id: "v2" },
      ],
    })
    await p.audio.put("v1", new Blob(["opus"]))
    await p.audio.put("v2", new Blob(["opus"]))
    const runtime = createJobsRuntime(p)
    runtime.open(blob(JSON.stringify(digest("2026-10-18"))))
    await settle()
    const pick = runtime.getSnapshot().state.digests[0].picks[1]
    expect(
      runtime.record({
        type: "passed",
        day: "2026-10-18",
        pickId: pick.id,
        fingerprint: pick.fingerprint,
        reasons: ["pay"],
        note: "",
        voice: ["v1"],
      })
    ).toBe(true)
    const file = runtime.keeping.outgoing("decisions")
    if (!isFile(file)) throw new Error("expected a file")
    expect(runtime.keeping.filed("decisions", file)).toBe(true)
    // The file names the note; its audio stays until home holds the note.
    await settle()
    expect(await p.audio.ids()).toEqual(["v1", "v2"])
    // Home's word lets it go, and only the note home holds.
    runtime.letGo(new Set(["v1", "never-heard"]))
    await settle()
    expect(await p.audio.ids()).toEqual(["v2"])
    expect(runtime.getSnapshot().state.voice.map((n) => n.id)).toEqual(["v2"])
    // What nothing names any more is swept; a note still listed stays.
    runtime.sweep()
    await settle()
    expect(await p.audio.ids()).toEqual(["v2"])
  })

  it("files a note home holds by its id alone (LG1)", async () => {
    const p = ports()
    const note = { mimeType: "audio/webm", durationMs: 3_000, owner: "o" }
    writeStored(p.storage, { ...EMPTY, voice: [{ ...note, id: "v1" }] })
    await p.audio.put("v1", new Blob(["opus"]))
    const runtime = createJobsRuntime(p)
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
      voice: ["v1"],
    })
    // Home holds the note before its file is filed.
    runtime.letGo(new Set(["v1"]))
    await settle()
    expect(await p.audio.ids()).toEqual([])
    const file = runtime.keeping.outgoing("decisions")
    if (!isFile(file)) throw new Error("expected a file")
    expect(JSON.parse(file.json)).toMatchObject({
      notes: { "2026-10-18_tid-7f2a_voice-1.webm": "v1" },
    })
    expect(runtime.keeping.filed("decisions", file)).toBe(true)
  })

  it("files what a run missed again, with the audio still on the phone (LG1)", async () => {
    let now = new Date("2026-10-18T19:00:00Z")
    const p = ports({ now: () => now })
    const note = { mimeType: "audio/webm", durationMs: 3_000, owner: "o" }
    writeStored(p.storage, { ...EMPTY, voice: [{ ...note, id: "v1" }] })
    await p.audio.put("v1", new Blob(["opus"]))
    const runtime = createJobsRuntime(p)
    runtime.open(blob(JSON.stringify(digest("2026-10-18"))))
    await settle()
    const [sw, ad] = runtime.getSnapshot().state.digests[0].picks
    runtime.record({
      type: "taken",
      day: "2026-10-18",
      pickId: sw.id,
      fingerprint: sw.fingerprint,
    })
    const first = runtime.keeping.outgoing("decisions")
    if (!isFile(first)) throw new Error("expected a file")
    expect(runtime.keeping.filed("decisions", first)).toBe(true)
    runtime.record({
      type: "passed",
      day: "2026-10-18",
      pickId: ad.id,
      fingerprint: ad.fingerprint,
      reasons: ["pay"],
      note: "",
      voice: ["v1"],
    })
    const second = runtime.keeping.outgoing("decisions")
    if (!isFile(second)) throw new Error("expected a file")
    expect(runtime.keeping.filed("decisions", second)).toBe(true)
    expect(runtime.keeping.outgoing("decisions")).toBeNull()

    // The next morning's run went by without reading what home filed, so
    // the next exchange files it all again, the note's audio still here.
    now = new Date("2026-10-19T17:00:00Z")
    runtime.keeping.fetched([digest("2026-10-19")], undefined)
    const again = runtime.keeping.outgoing("decisions")
    if (!isFile(again)) throw new Error("expected a file")
    expect(
      JSON.parse(again.json).picks.map((pk: { pickId: string }) => pk.pickId)
    ).toEqual(expect.arrayContaining([sw.id, ad.id]))
    expect(await p.audio.ids()).toEqual(["v1"])
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
