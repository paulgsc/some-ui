import { describe, expect, it } from "vitest"

import type { Draft, JobsState, PickRef } from "@/lib/jobs/model"
import { EMPTY, step } from "@/lib/jobs/model"
import { doneOn, nextPick } from "@/lib/jobs/today"

import { digest, OPENED_AT } from "./fixture"

const OLDEST = digest("2026-10-16")
const OLDER = digest("2026-10-17")
const NEWER = digest("2026-10-18")

let n = 0
function record(state: JobsState, event: Draft, at = OPENED_AT): JobsState {
  n += 1
  return step(state, { type: "record", event, stamp: { id: `e${n}`, at } })
}

const refOf = (d: typeof NEWER, i: number): PickRef => ({
  day: d.day,
  pickId: d.picks[i].id,
  fingerprint: d.picks[i].fingerprint,
})

function passAll(state: JobsState, d: typeof NEWER): JobsState {
  return d.picks.reduce(
    (s, _, i) =>
      record(s, {
        type: "passed",
        reasons: [],
        note: "",
        voice: [],
        ...refOf(d, i),
      }),
    state
  )
}

/** The newest digest's own day: none of them has lapsed yet. */
const TODAY = "2026-10-18"

const held = [OLDEST, NEWER, OLDER].reduce(
  (s, d) => step(s, { type: "opened", digest: d, at: OPENED_AT }),
  EMPTY
)

describe("nextPick", () => {
  it("opens on the picks on show, then the newest other digest's, and none once all are decided", () => {
    const onShow = { ...held, current: "2026-10-17" }
    expect(nextPick(onShow, TODAY)).toMatchObject({
      day: "2026-10-17",
      pick: { id: OLDER.picks[0].id },
    })
    expect(nextPick(passAll(onShow, OLDER), TODAY)?.day).toBe("2026-10-18")
    expect(
      nextPick(passAll(passAll(passAll(onShow, OLDER), NEWER), OLDEST), TODAY)
    ).toBeNull()
  })

  it("passes over picks that lapsed untouched, never one I started (J5)", () => {
    const onShow = { ...held, current: "2026-10-16" }
    // 2026-10-16's picks lapse on 2026-10-19, the others later.
    expect(nextPick(onShow, "2026-10-19")?.day).toBe("2026-10-18")
    expect(nextPick(onShow, "2026-10-21")).toBeNull()
    const started = record(onShow, { type: "taken", ...refOf(OLDEST, 0) })
    expect(nextPick(started, "2026-10-30")).toMatchObject({
      day: "2026-10-16",
      pick: { id: OLDEST.picks[0].id },
    })
  })

  it("opens on a pick I started before any new one, the oldest first", () => {
    let state = record(held, { type: "taken", ...refOf(NEWER, 1) })
    state = record(state, { type: "taken", ...refOf(OLDER, 1) })
    expect(nextPick(state, TODAY)).toMatchObject({
      day: "2026-10-17",
      pick: { id: OLDER.picks[1].id },
    })
  })
})

describe("doneOn", () => {
  it("counts what was done on the day, and a posting opened again once", () => {
    const today = "2026-10-18T16:00:00Z"
    const dayOf = (at: Date): string => at.toISOString().slice(0, 10)
    let state = record(
      held,
      { type: "taken", ...refOf(NEWER, 0) },
      "2026-10-17T16:00:00Z"
    )
    state = record(state, { type: "resume-ready", ...refOf(NEWER, 0) }, today)
    state = record(state, { type: "apply-opened", ...refOf(NEWER, 0) }, today)
    state = record(state, { type: "apply-opened", ...refOf(NEWER, 0) }, today)
    expect(doneOn(state, "2026-10-18", dayOf)).toBe(2)
    state = record(state, { type: "read", ...refOf(NEWER, 1) }, today)
    expect(doneOn(state, "2026-10-18", dayOf)).toBe(3)
  })
})
