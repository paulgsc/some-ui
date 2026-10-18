import { describe, expect, it } from "vitest"

import type { Draft, JobsState, PickRef, VoiceNote } from "@/lib/jobs/model"
import {
  applicationsOf,
  DIGESTS_KEPT,
  draftVoice,
  EMPTY,
  progressOf,
  releasedVoice,
  step,
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
      state = step(state, {
        type: "opened",
        digest: digest(day),
        at: OPENED_AT,
      })
    }
    state = step(state, {
      type: "opened",
      digest: digest("2026-09-05"),
      at: OPENED_AT,
    })
    expect(state.digests).toHaveLength(DIGESTS_KEPT + 1)
    expect(state.digests[0].day).toBe("2026-09-01")
    expect(state.digests.filter((d) => d.day === "2026-09-05")).toHaveLength(1)
    expect(state.current).toBe("2026-09-05")
    expect(applicationsOf(state).map((a) => a.day)).toEqual(["2026-09-01"])
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
