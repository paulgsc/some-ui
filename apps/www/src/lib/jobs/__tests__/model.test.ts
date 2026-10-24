import { describe, expect, it } from "vitest"

import type { Draft, JobsState, PickRef, VoiceNote } from "@/lib/jobs/model"
import {
  applicationsOf,
  DIGESTS_KEPT,
  draftVoice,
  EMPTY,
  kitOf,
  openOf,
  pacificDay,
  progressOf,
  releasedVoice,
  step,
  timedMinutes,
  undecidedOf,
  untouchedReported,
} from "@/lib/jobs/model"

import { digest, OPENED_AT } from "./fixture"

const DAY = "2026-10-18"
const D = digest(DAY)
const [SW, AD] = D.picks
const ref = (p = SW): PickRef => ({
  day: DAY,
  pickId: p.id,
  fingerprint: p.fingerprint,
})

let n = 0
function record(state: JobsState, event: Draft): JobsState {
  n += 1
  return step(state, {
    type: "record",
    event,
    stamp: {
      id: `e${n}`,
      at: `2026-10-18T15:${String(n).padStart(2, "0")}:00Z`,
    },
  })
}

const opened = step(EMPTY, { type: "opened", digest: D, at: OPENED_AT })

describe("step", () => {
  it("refuses an event for a pick it hasn't opened, or a step before taking", () => {
    expect(record(EMPTY, { type: "taken", ...ref() })).toBe(EMPTY)
    expect(record(opened, { type: "resume-ready", ...ref() })).toBe(opened)
    expect(
      record(opened, { type: "taken", ...ref(), fingerprint: "a|b|c" })
    ).toBe(opened)
  })

  it("keeps the newest digests and every one the record names, one per day", () => {
    const first = digest("2026-09-01")
    const [pick] = first.picks
    let state = step(EMPTY, { type: "opened", digest: first, at: OPENED_AT })
    state = record(state, {
      type: "taken",
      day: first.day,
      pickId: pick.id,
      fingerprint: pick.fingerprint,
    })
    for (let i = 2; i <= DIGESTS_KEPT + 3; i += 1) {
      const day = `2026-09-${String(i).padStart(2, "0")}`
      // No picks, so none holds a queue slot.
      state = step(state, {
        type: "opened",
        digest: { ...digest(day), picks: [] },
        at: OPENED_AT,
      })
    }
    state = step(state, {
      type: "opened",
      digest: { ...digest("2026-09-05"), picks: [] },
      at: OPENED_AT,
    })
    expect(state.digests).toHaveLength(DIGESTS_KEPT + 1)
    expect(state.digests[0].day).toBe("2026-09-01")
    expect(state.digests.filter((d) => d.day === "2026-09-05")).toHaveLength(1)
    expect(state.current).toBe("2026-09-05")
    expect(applicationsOf(state).map((a) => a.day)).toEqual(["2026-09-01"])
  })

  it("keeps a digest whose picks still hold queue slots, however many follow", () => {
    let state = step(EMPTY, {
      type: "opened",
      digest: digest("2026-08-01"),
      at: OPENED_AT,
    })
    for (let i = 1; i <= DIGESTS_KEPT + 2; i += 1) {
      const day = `2026-09-${String(i).padStart(2, "0")}`
      state = step(state, {
        type: "opened",
        digest: { ...digest(day), picks: [] },
        at: OPENED_AT,
      })
    }
    expect(state.digests[0].day).toBe("2026-08-01")
    expect(undecidedOf(state, "2026-08-01")).toHaveLength(2)
  })

  it("keeps a digest that redrafts an open pick, however many follow", () => {
    const first = digest("2026-08-01")
    const [pick] = first.picks
    let state = step(EMPTY, { type: "opened", digest: first, at: OPENED_AT })
    state = step(state, {
      type: "opened",
      digest: {
        ...digest("2026-08-02"),
        picks: [],
        redrafts: [
          {
            day: first.day,
            pickId: pick.id,
            fit: ["e1"],
            coverLetter: "Redrafted.",
            questions: [],
          },
        ],
      },
      at: OPENED_AT,
    })
    for (let i = 1; i <= DIGESTS_KEPT + 2; i += 1) {
      const day = `2026-09-${String(i).padStart(2, "0")}`
      state = step(state, {
        type: "opened",
        digest: { ...digest(day), picks: [] },
        at: OPENED_AT,
      })
    }
    expect(state.digests.map((d) => d.day).slice(0, 2)).toEqual([
      "2026-08-01",
      "2026-08-02",
    ])
    expect(kitOf(state, first.day, pick).redraftedOn).toBe("2026-08-02")
  })

  it("keeps an old digest with open picks as it is opened", () => {
    let state = EMPTY
    for (let i = 1; i <= DIGESTS_KEPT + 2; i += 1) {
      const day = `2026-09-${String(i).padStart(2, "0")}`
      state = step(state, {
        type: "opened",
        digest: { ...digest(day), picks: [] },
        at: OPENED_AT,
      })
    }
    state = step(state, {
      type: "opened",
      digest: digest("2026-08-01"),
      at: OPENED_AT,
    })
    expect(state.current).toBe("2026-08-01")
    expect(undecidedOf(state, "2026-08-01")).toHaveLength(2)
  })

  it("archives together or not at all", () => {
    const events = [AD, SW].map((p, i) => ({
      event: { type: "archived" as const, ...ref(p) },
      stamp: { id: `all${i}`, at: OPENED_AT },
    }))
    const both = step(opened, { type: "record-all", events })
    expect(both.log.map((e) => e.id)).toEqual(["all0", "all1"])
    const bad = [
      ...events,
      { ...events[0], event: { ...events[0].event, fingerprint: "a|b|c" } },
    ]
    expect(step(opened, { type: "record-all", events: bad })).toBe(opened)
  })

  it("refuses a debrief job-desk would refuse", () => {
    const taken = record(opened, { type: "taken", ...ref() })
    const debrief = (minutes: number): Draft => ({
      type: "debrief",
      ...ref(),
      minutes,
      friction: 3,
      chips: [],
      what: "",
      voice: [],
      result: "submitted",
    })
    expect(record(taken, debrief(1_440))).toBe(taken)
    expect(record(taken, debrief(45)).log).toHaveLength(2)
  })

  it("refuses what home would refuse to keep", () => {
    const pass = (note: string): Draft => ({
      type: "passed",
      ...ref(),
      reasons: [],
      note,
      voice: [],
    })
    expect(record(opened, pass("x".repeat(2_001)))).toBe(opened)
    expect(record(opened, pass("x".repeat(2_000))).log).toHaveLength(1)
    const scout = (url: string): Draft => ({
      type: "scout",
      scout: {
        id: "sc-a1b2c3",
        url,
        track: "software",
        family: null,
        title: "SRE",
        why: "",
        postingText: null,
      },
      voice: [],
    })
    expect(record(opened, scout("HTTPS://www.indeed.com/x"))).toBe(opened)
    expect(record(opened, scout("https://www.indeed.com/x")).log).toHaveLength(
      1
    )
  })

  it("lets a draft's voice note go, and never one the record names", () => {
    const note = (id: string): VoiceNote => ({
      id,
      mimeType: "audio/webm",
      durationMs: 2000,
      owner: "o",
    })
    let state = step(opened, { type: "voice-kept", note: note("v1") })
    state = step(state, { type: "voice-kept", note: note("v2") })
    state = record(state, {
      type: "passed",
      ...ref(),
      reasons: [],
      note: "",
      voice: ["v1"],
    })
    state = step(state, { type: "voice-dropped", ids: ["v1", "v2"] })
    expect(state.voice.map((v) => v.id)).toEqual(["v1"])
    expect(draftVoice(state, "o")).toEqual([])
  })
})

describe("a file home refused", () => {
  it("is kept by name, once", () => {
    const refused = step(EMPTY, { type: "file-refused", name: "scouts-1.json" })
    expect(refused.home.refusedFiles).toEqual(["scouts-1.json"])
    expect(step(refused, { type: "file-refused", name: "scouts-1.json" })).toBe(
      refused
    )
  })
})

describe("progressOf", () => {
  it("walks the five steps from the log", () => {
    let state = opened
    expect(progressOf(state, DAY, SW.id)).toEqual({ kind: "open", step: 0 })
    state = record(state, { type: "taken", ...ref() })
    expect(progressOf(state, DAY, SW.id)).toEqual({ kind: "open", step: 2 })
    state = record(state, { type: "resume-ready", ...ref() })
    expect(progressOf(state, DAY, SW.id)).toEqual({ kind: "open", step: 3 })
    state = record(state, { type: "apply-opened", ...ref() })
    expect(progressOf(state, DAY, SW.id)).toEqual({ kind: "open", step: 4 })
    state = record(state, {
      type: "debrief",
      ...ref(),
      minutes: 20,
      friction: 3,
      chips: [],
      what: "",
      voice: [],
      result: "submitted",
    })
    expect(progressOf(state, DAY, SW.id)).toEqual({
      kind: "done",
      result: "submitted",
    })
    expect(applicationsOf(state).map((a) => a.pick.id)).toEqual([SW.id])
    expect(progressOf(state, DAY, AD.id)).toEqual({ kind: "open", step: 0 })

    // Passed, then taken again: a new attempt, which the old debrief isn't.
    state = record(state, {
      type: "passed",
      ...ref(),
      reasons: ["pay"],
      note: "",
      voice: [],
    })
    state = record(state, { type: "taken", ...ref() })
    expect(progressOf(state, DAY, SW.id)).toEqual({ kind: "open", step: 2 })
  })
})

describe("timedMinutes (JB1)", () => {
  it("offers the time since the posting last opened, and none past two hours", () => {
    let state = record(opened, { type: "taken", ...ref() })
    const at = (time: string): Date => new Date(`2026-10-18T${time}Z`)
    expect(timedMinutes(state, DAY, SW.id, at("16:00:00"))).toBeNull()
    state = record(state, { type: "apply-opened", ...ref() })
    const openedAt = state.log.at(-1)?.at ?? ""
    const after = (minutes: number): Date =>
      new Date(Date.parse(openedAt) + minutes * 60_000)
    expect(timedMinutes(state, DAY, SW.id, after(0))).toBe(1)
    expect(timedMinutes(state, DAY, SW.id, after(25))).toBe(25)
    expect(timedMinutes(state, DAY, SW.id, after(120))).toBe(120)
    expect(timedMinutes(state, DAY, SW.id, after(121))).toBeNull()
    expect(timedMinutes(state, DAY, SW.id, after(16 * 60))).toBeNull()
    // Opened again the next morning: timed from then.
    state = record(state, { type: "apply-opened", ...ref() })
    expect(
      timedMinutes(
        state,
        DAY,
        SW.id,
        new Date(Date.parse(state.log.at(-1)?.at ?? "") + 9 * 60_000)
      )
    ).toBe(9)
  })
})

describe("an archived pick", () => {
  it("leaves the queue unreviewed, until a later decision replaces it", () => {
    let state = record(opened, { type: "taken", ...ref() })
    expect(undecidedOf(state, DAY).map((p) => p.id)).toEqual([AD.id])
    expect(openOf(state).map((o) => o.pick.id)).toEqual([SW.id, AD.id])

    state = record(state, { type: "archived", ...ref(AD) })
    expect(progressOf(state, DAY, AD.id)).toEqual({ kind: "archived" })
    expect(undecidedOf(state, DAY)).toEqual([])
    expect(openOf(state).map((o) => o.pick.id)).toEqual([SW.id])
    expect(applicationsOf(state).map((a) => a.pick.id)).toEqual([SW.id])

    state = record(state, { type: "taken", ...ref(AD) })
    expect(progressOf(state, DAY, AD.id)).toEqual({ kind: "open", step: 2 })
  })
})

describe("releasedVoice", () => {
  const share = (state: JobsState, voice: ReadonlyArray<string>): JobsState =>
    record(state, {
      type: "shared",
      kind: "decisions",
      day: DAY,
      file: "decisions.json",
      through: state.log.length,
      voice,
    })

  it("lets go of a note a later decision replaced, once a later share arrives", () => {
    let state = record(opened, {
      type: "passed",
      ...ref(),
      reasons: [],
      note: "",
      voice: ["v1"],
    })
    // Shared with v1, never confirmed; then taken, so the next share omits it.
    state = share(state, ["v1"])
    state = record(state, { type: "taken", ...ref() })
    expect(releasedVoice(state)).toEqual(new Set())
    state = share(state, [])
    expect(releasedVoice(state)).toEqual(new Set())
    state = record(state, { type: "arrived", shareId: state.log.at(-1)!.id })
    expect(releasedVoice(state)).toEqual(new Set(["v1"]))
  })
})

describe("a fit note", () => {
  it("is kept only on a pick I took and haven't debriefed, and only when it says something", () => {
    const fit = (note: string): Draft => ({
      type: "fit-note",
      ...ref(),
      note,
      voice: [],
    })
    expect(record(opened, fit("I built it."))).toBe(opened)
    const taken = record(opened, { type: "taken", ...ref() })
    expect(record(taken, fit("  "))).toBe(taken)
    expect(record(taken, fit("\u0085"))).toBe(taken)
    expect(record(taken, fit("I built it.")).log.at(-1)).toEqual(
      expect.objectContaining({ type: "fit-note", note: "I built it." })
    )
    const debriefed = record(taken, {
      type: "debrief",
      ...ref(),
      minutes: 20,
      friction: 2,
      chips: [],
      what: "",
      voice: [],
      result: "submitted",
    })
    expect(record(debriefed, fit("Too late."))).toBe(debriefed)
  })
})

describe("kitOf", () => {
  it("shows the newest redraft of a pick in place of its own drafts", () => {
    const later = (day: string, coverLetter: string): typeof D => ({
      ...digest(day),
      redrafts: [
        { day: DAY, pickId: SW.id, fit: ["e1"], coverLetter, questions: [] },
      ],
    })
    expect(kitOf(opened, DAY, SW)).toEqual({ kit: SW.kit, redraftedOn: null })
    let state = step(opened, {
      type: "opened",
      digest: later("2026-10-19", "First redraft."),
      at: OPENED_AT,
    })
    state = step(state, {
      type: "opened",
      digest: later("2026-10-20", "Second redraft."),
      at: OPENED_AT,
    })
    const { kit, redraftedOn } = kitOf(state, DAY, SW)
    expect(redraftedOn).toBe("2026-10-20")
    expect(kit.coverLetter).toBe("Second redraft.")
    // A redraft that changes nothing is no redraft.
    const own = { ...SW, kit: { ...SW.kit, coverLetter: "Mine." } }
    const blank = {
      ...digest("2026-10-21"),
      redrafts: [
        {
          day: DAY,
          pickId: SW.id,
          fit: ["e1"],
          coverLetter: null,
          questions: [],
        },
      ],
    }
    state = step(state, { type: "opened", digest: blank, at: OPENED_AT })
    expect(kitOf(state, DAY, own)).toEqual({ kit: own.kit, redraftedOn: null })
    // A redrafted answer keeps the question as the pick's form asks it.
    const asked = {
      ...SW,
      kit: {
        ...SW.kit,
        questions: [{ label: "Why us?", required: true, draft: "Mine." }],
      },
    }
    const answered = {
      ...digest("2026-10-22"),
      redrafts: [
        {
          day: DAY,
          pickId: SW.id,
          fit: ["e1"],
          coverLetter: null,
          questions: [{ label: "Why us?", required: false, draft: "Theirs." }],
        },
      ],
    }
    state = step(state, { type: "opened", digest: answered, at: OPENED_AT })
    expect(kitOf(state, DAY, asked).kit.questions).toEqual([
      { label: "Why us?", required: true, draft: "Theirs." },
    ])
    expect(kitOf(state, DAY, AD)).toEqual({ kit: AD.kit, redraftedOn: null })
  })
})

describe("digests home holds (fetched)", () => {
  const FETCHED_AT = "2026-10-21T15:00:00Z"
  const fetch = (state: JobsState, ...days: Array<string>): JobsState =>
    step(state, {
      type: "fetched",
      digests: days.map((day) => digest(day)),
      at: FETCHED_AT,
    })
  const days = (state: JobsState): Array<string> =>
    state.digests.map((d) => d.day)

  it("keeps a digest for a new day and makes it the one Today shows", () => {
    const state = fetch(opened, "2026-10-19")
    expect(days(state)).toEqual([DAY, "2026-10-19"])
    expect(state.current).toBe("2026-10-19")
    expect(state.firstOpened).toEqual({
      [DAY]: OPENED_AT,
      "2026-10-19": FETCHED_AT,
    })
    expect(fetch(EMPTY, "2026-10-19").current).toBe("2026-10-19")
  })

  it("changes the digests, the day shown and when each came, and nothing else", () => {
    const logged = record(opened, { type: "taken", ...ref() })
    const state = fetch(logged, "2026-10-19")
    const { digests: _d, current: _c, firstOpened: _f, ...rest } = state
    const { log, voice, home } = logged
    expect(rest).toEqual({ log, voice, home })
  })

  it("takes no digest for a day the phone holds", () => {
    const other = { ...digest(DAY), picks: [], seen: 99 }
    const state = step(opened, {
      type: "fetched",
      digests: [other],
      at: FETCHED_AT,
    })
    expect(state).toBe(opened)
    expect(state.digests[0]).toBe(D)
  })

  it("does not move the day Today shows back to an older one", () => {
    const state = fetch(opened, "2026-10-10")
    expect(days(state)).toEqual(["2026-10-10", DAY])
    expect(state.current).toBe(DAY)
    // Several at once: the newest of them leads.
    expect(fetch(EMPTY, "2026-10-12", "2026-10-14", "2026-10-13").current).toBe(
      "2026-10-14"
    )
  })

  it("lets go at once of a digest older than everything kept", () => {
    const bare = (day: string): typeof D => ({ ...digest(day), picks: [] })
    let full = EMPTY
    for (let i = 1; i <= DIGESTS_KEPT; i += 1) {
      const day = `2026-09-${String(i).padStart(2, "0")}`
      full = step(full, { type: "opened", digest: bare(day), at: OPENED_AT })
    }
    expect(
      step(full, {
        type: "fetched",
        digests: [bare("2026-08-01")],
        at: FETCHED_AT,
      })
    ).toBe(full)
  })

  it("returns the same state when nothing is new", () => {
    expect(step(opened, { type: "fetched", digests: [], at: FETCHED_AT })).toBe(
      opened
    )
    // The same day twice in one answer is taken once.
    expect(fetch(EMPTY, "2026-10-19", "2026-10-19").digests).toHaveLength(1)
  })

  it("counts a digest as new to the phone from when it was taken in", () => {
    const shared = record(opened, {
      type: "shared",
      kind: "decisions",
      day: "2026-10-20",
      file: "decisions-2026-10-20.json",
      through: 0,
      voice: [],
    })
    const sharedId = shared.log.find((e) => e.type === "shared")?.id ?? ""
    const arrived = record(shared, { type: "arrived", shareId: sharedId })
    // That share was made before the phone had the 19th, so it can't have
    // reported its picks; the 18th was open then.
    const state = step(arrived, {
      type: "fetched",
      digests: [digest("2026-10-19")],
      at: "2026-10-21T08:00:00Z",
    })
    expect(untouchedReported(state, DAY)).toBe(true)
    expect(untouchedReported(state, "2026-10-19")).toBe(false)
  })
})

describe("pacificDay", () => {
  it("reads the Pacific day across both offsets", () => {
    expect(pacificDay(new Date("2026-10-22T06:59:00Z"))).toBe("2026-10-21")
    expect(pacificDay(new Date("2026-10-22T07:00:00Z"))).toBe("2026-10-22")
    expect(pacificDay(new Date("2026-12-01T07:59:00Z"))).toBe("2026-11-30")
    expect(pacificDay(new Date("2026-12-01T08:00:00Z"))).toBe("2026-12-01")
  })
})
