import { describe, expect, it } from "vitest"

import type { Outgoing, OutgoingFile } from "@/lib/jobs/files"
import { decisionsFile, isFile, scoutsFile } from "@/lib/jobs/files"
import type { Draft, JobsState, PickRef, VoiceNote } from "@/lib/jobs/model"
import { EMPTY, step } from "@/lib/jobs/model"

import { digest, OPENED_AT } from "./fixture"

function fileOf(outgoing: Outgoing): OutgoingFile {
  if (!isFile(outgoing)) throw new Error(`no file: ${JSON.stringify(outgoing)}`)
  return outgoing
}

let n = 0
function record(
  state: JobsState,
  event: Draft,
  at = "2026-10-18T16:00:00Z"
): JobsState {
  n += 1
  return step(state, { type: "record", event, stamp: { id: `e${n}`, at } })
}

const voice = (id: string): { type: "voice-kept"; note: VoiceNote } => ({
  type: "voice-kept",
  note: {
    id,
    mimeType: "audio/webm;codecs=opus",
    durationMs: 3000,
    owner: "o",
  },
})

describe("decisionsFile", () => {
  const D = digest("2026-10-18")
  const [SW, AD] = D.picks
  const ref = (p = SW): PickRef => ({
    day: D.day,
    pickId: p.id,
    fingerprint: p.fingerprint,
  })
  let state = step(EMPTY, { type: "opened", digest: D, at: OPENED_AT })
  state = step(state, voice("v1"))
  state = record(state, {
    type: "passed",
    ...ref(AD),
    reasons: ["customer-facing"],
    note: "Calls",
    voice: ["v1"],
  })
  state = record(state, { type: "taken", ...ref() })
  state = record(state, {
    type: "debrief",
    ...ref(),
    minutes: 23,
    friction: 4,
    chips: ["company-ats"],
    what: "Workday",
    voice: [],
    result: "submitted",
  })

  it("says each pick as it stands, and names its voice notes", () => {
    const file = fileOf(
      decisionsFile(state, "2026-10-18", "2026-10-18T22:00:00Z")
    )
    expect(file.name).toBe("decisions-2026-10-18.json")
    const json = JSON.parse(file.json)
    expect(json.picks).toEqual([
      expect.objectContaining({
        pickId: SW.id,
        decision: "taken",
        debrief: expect.objectContaining({ minutes: 23, result: "submitted" }),
      }),
      expect.objectContaining({
        pickId: AD.id,
        decision: "passed",
        reasons: ["customer-facing"],
        voice: ["2026-10-18_tid-7f2a_voice-1.webm"],
      }),
    ])
    expect(file.voice).toEqual([
      { id: "v1", name: "2026-10-18_tid-7f2a_voice-1.webm" },
    ])
  })

  it("sends no voice note the pick as written doesn't name", () => {
    const changed = record(state, { type: "taken", ...ref(AD) })
    const file = fileOf(
      decisionsFile(changed, "2026-10-18", "2026-10-18T22:00:00Z")
    )
    const json = JSON.parse(file.json)
    expect(json.picks[1]).toEqual(
      expect.objectContaining({ decision: "taken", voice: [] })
    )
    expect(file.voice).toEqual([])
  })

  it("reports a new attempt without the debrief of the one before", () => {
    let again = record(state, {
      type: "passed",
      ...ref(),
      reasons: ["pay"],
      note: "",
      voice: [],
    })
    again = record(again, { type: "taken", ...ref() })
    const file = fileOf(
      decisionsFile(again, "2026-10-18", "2026-10-18T22:00:00Z")
    )
    expect(JSON.parse(file.json).picks[0]).toEqual(
      expect.objectContaining({ decision: "taken", debrief: null })
    )
  })

  it("names the newest digest its picks answer, whichever was opened last", () => {
    const older = digest("2026-10-17")
    const reopened = step(state, {
      type: "opened",
      digest: older,
      at: OPENED_AT,
    })
    expect(reopened.current).toBe("2026-10-17")
    const file = fileOf(
      decisionsFile(reopened, "2026-10-18", "2026-10-18T22:00:00Z")
    )
    expect(JSON.parse(file.json).digestDay).toBe("2026-10-18")
  })

  it("offers a share again until it arrived, then says only what is new", () => {
    const file = fileOf(
      decisionsFile(state, "2026-10-18", "2026-10-18T22:00:00Z")
    )
    let shared = record(state, {
      type: "shared",
      kind: "decisions",
      day: "2026-10-18",
      file: file.name,
      through: file.through,
      voice: ["v1"],
    })
    const unconfirmed = fileOf(
      decisionsFile(shared, "2026-10-18", "2026-10-18T22:30:00Z")
    )
    expect(unconfirmed.name).toBe("decisions-2026-10-18-2.json")
    expect(JSON.parse(unconfirmed.json).picks).toHaveLength(2)
    // Each entry keeps its event's id, so the routine counts a retry once.
    expect(JSON.parse(unconfirmed.json).picks[0].debrief.id).toBe(
      JSON.parse(file.json).picks[0].debrief.id
    )
    expect(JSON.parse(unconfirmed.json).picks[1].id).toBe(
      JSON.parse(file.json).picks[1].id
    )
    expect(JSON.parse(file.json).picks[1].id).toEqual(expect.any(String))

    const shareId = shared.log.at(-1)!.id
    shared = record(shared, { type: "arrived", shareId })
    expect(
      decisionsFile(shared, "2026-10-18", "2026-10-18T23:00:00Z")
    ).toBeNull()
    shared = record(shared, {
      type: "outcome",
      fingerprint: SW.fingerprint,
      event: "reply",
      on: "2026-10-18",
      note: "",
    })
    const again = fileOf(
      decisionsFile(shared, "2026-10-18", "2026-10-18T23:00:00Z")
    )
    expect(again.name).toBe("decisions-2026-10-18-2.json")
    expect(JSON.parse(again.json).outcomes).toEqual([
      expect.objectContaining({ id: shared.log.at(-1)!.id, event: "reply" }),
    ])
    expect(JSON.parse(again.json).picks).toEqual([])
    expect(again.voice).toEqual([])
  })

  it("reports an earlier day's untouched picks once", () => {
    const old = step(EMPTY, {
      type: "opened",
      digest: digest("2026-10-17"),
      at: OPENED_AT,
    })
    const file = fileOf(
      decisionsFile(old, "2026-10-18", "2026-10-18T22:00:00Z")
    )
    expect(JSON.parse(file.json).picks).toEqual([
      expect.objectContaining({ decision: "untouched", id: null }),
      expect.objectContaining({ decision: "untouched", id: null }),
    ])
    let shared = record(old, {
      type: "shared",
      kind: "decisions",
      day: "2026-10-18",
      file: file.name,
      through: file.through,
      voice: [],
    })
    shared = record(shared, { type: "arrived", shareId: shared.log.at(-1)!.id })
    expect(
      decisionsFile(shared, "2026-10-19", "2026-10-19T22:00:00Z")
    ).toBeNull()
    expect(decisionsFile(old, "2026-10-17", "2026-10-17T22:00:00Z")).toBeNull()
  })

  it("reports a digest opened after a later day's share arrived", () => {
    let late = record(
      state,
      {
        type: "shared",
        kind: "decisions",
        day: "2026-10-19",
        file: "decisions-2026-10-19.json",
        through: state.log.length,
        voice: ["v1"],
      },
      "2026-10-19T20:00:00Z"
    )
    late = record(
      late,
      { type: "arrived", shareId: late.log.at(-1)!.id },
      "2026-10-19T20:01:00Z"
    )
    late = step(late, {
      type: "opened",
      digest: digest("2026-10-17"),
      at: "2026-10-19T21:00:00Z",
    })
    const file = fileOf(
      decisionsFile(late, "2026-10-19", "2026-10-19T22:00:00Z")
    )
    expect(JSON.parse(file.json).picks).toEqual([
      expect.objectContaining({ day: "2026-10-17", decision: "untouched" }),
      expect.objectContaining({ day: "2026-10-17", decision: "untouched" }),
    ])
    late = record(
      late,
      {
        type: "shared",
        kind: "decisions",
        day: "2026-10-19",
        file: file.name,
        through: file.through,
        voice: [],
      },
      "2026-10-19T22:00:00Z"
    )
    late = record(
      late,
      { type: "arrived", shareId: late.log.at(-1)!.id },
      "2026-10-19T22:01:00Z"
    )
    expect(decisionsFile(late, "2026-10-20", "2026-10-20T22:00:00Z")).toBeNull()
  })

  it("names what it can't share instead of throwing, for an event job-desk refuses", () => {
    const bad: JobsState = {
      ...state,
      log: [
        ...state.log,
        {
          id: "e-bad",
          at: "2026-10-18T21:00:00Z",
          type: "debrief",
          ...ref(),
          minutes: 1_440,
          friction: 2,
          chips: [],
          what: "",
          voice: [],
          result: "submitted",
        },
      ],
    }
    const outgoing = decisionsFile(bad, "2026-10-18", "2026-10-18T22:00:00Z")
    expect(outgoing).toMatchObject({
      kind: "decisions",
      problem: expect.stringContaining("picks.0.debrief.minutes"),
    })
  })
})

describe("scoutsFile", () => {
  it("carries each scout added since the last scouts share", () => {
    let state = step(EMPTY, voice("v9"))
    state = record(
      state,
      {
        type: "scout",
        scout: {
          id: "sc-a1b2c3",
          url: "https://www.indeed.com/viewjob?jk=1",
          track: "adjacent",
          family: "qa",
          title: "SDET · Second Dinner",
          why: "Games",
          postingText: null,
        },
        voice: ["v9"],
      },
      "2026-10-18T20:00:00Z"
    )
    // Local time: the stamp names the file as the phone's clock reads.
    const file = fileOf(scoutsFile(state, new Date(2026, 9, 18, 20, 5, 0)))
    expect(file.name).toBe("scouts-20261018T200500.json")
    expect(file.voice).toEqual([{ id: "v9", name: "sc-a1b2c3_voice-1.webm" }])
    // Offered again later: the same notes under the same names.
    const retried = fileOf(scoutsFile(state, new Date(2026, 9, 19, 8, 0, 0)))
    expect(retried.name).not.toBe(file.name)
    expect(retried.voice).toEqual(file.voice)
    expect(JSON.parse(file.json).scouts[0]).toMatchObject({
      id: "sc-a1b2c3",
      addedAt: "2026-10-18T20:00:00Z",
    })
    expect(scoutsFile(EMPTY, new Date(2026, 9, 18, 20, 5, 0))).toBeNull()
  })
})

describe("a log home restored", () => {
  const D = digest("2026-10-18")
  const [SW, AD] = D.picks
  const ref = (p = SW): PickRef => ({
    day: D.day,
    pickId: p.id,
    fingerprint: p.fingerprint,
  })

  it("lacks the events home refused, so a share covers no further than its own place", () => {
    // On the phone that made it: two events home refused, then a share.
    let made = step(EMPTY, { type: "opened", digest: D, at: OPENED_AT })
    made = record(made, { type: "taken", ...ref() })
    made = record(made, { type: "taken", ...ref(AD) })
    made = record(made, {
      type: "disagree",
      day: D.day,
      fingerprint: "juniper row|software engineer ii|remote",
      note: "Remote",
    })
    const file = fileOf(decisionsFile(made, D.day, "2026-10-18T22:00:00Z"))
    made = record(made, {
      type: "shared",
      kind: "decisions",
      day: D.day,
      file: file.name,
      through: file.through,
      voice: [],
    })
    const share = made.log.at(-1)!
    made = record(made, {
      type: "outcome",
      fingerprint: SW.fingerprint,
      event: "reply",
      on: "2026-10-20",
      note: "",
    })
    made = record(made, { type: "arrived", shareId: share.id })

    // Home holds all but the second and third events.
    const held = made.log.filter((_, i) => i !== 1 && i !== 2)
    let restored = step(EMPTY, { type: "opened", digest: D, at: OPENED_AT })
    restored = step(restored, { type: "restored", events: held })
    const again = fileOf(
      decisionsFile(restored, "2026-10-20", "2026-10-20T22:00:00Z")
    )
    expect(JSON.parse(again.json).outcomes).toEqual([
      expect.objectContaining({ fingerprint: SW.fingerprint, event: "reply" }),
    ])
  })

  it("names a scout's notes but sends no audio the phone doesn't hold", () => {
    let made = step(EMPTY, {
      type: "voice-kept",
      note: { id: "v9", mimeType: "audio/webm", durationMs: 2000, owner: "o" },
    })
    made = record(made, {
      type: "scout",
      scout: {
        id: "sc-a1b2c3",
        url: "https://www.indeed.com/viewjob?jk=1",
        track: "software",
        family: null,
        title: "SRE · Somewhere",
        why: "",
        postingText: null,
      },
      voice: ["v9"],
    })
    const restored = step(EMPTY, { type: "restored", events: made.log })
    const file = fileOf(scoutsFile(restored, new Date(2026, 9, 18, 20, 5, 0)))
    expect(JSON.parse(file.json).scouts[0].voice).toEqual([
      "sc-a1b2c3_voice-1.webm",
    ])
    expect(file.voice).toEqual([])
  })
})
