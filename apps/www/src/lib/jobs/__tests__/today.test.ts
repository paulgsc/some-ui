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

function letGo(state: JobsState, d: typeof NEWER): JobsState {
  return d.picks.reduce(
    (s, _, i) => record(s, { type: "archived", ...refOf(d, i) }),
    state
  )
}

const held = [OLDEST, NEWER, OLDER].reduce(
  (s, d) => step(s, { type: "opened", digest: d, at: OPENED_AT }),
  EMPTY
)

describe("nextPick", () => {
  it("opens on the picks on show, then the newest other digest's, and none once all are decided", () => {
    const onShow = { ...held, current: "2026-10-17" }
    expect(nextPick(onShow)).toMatchObject({
      day: "2026-10-17",
      pick: { id: OLDER.picks[0].id },
    })
    expect(nextPick(letGo(onShow, OLDER))?.day).toBe("2026-10-18")
    expect(
      nextPick(letGo(letGo(letGo(onShow, OLDER), NEWER), OLDEST))
    ).toBeNull()
  })

  it("opens on a pick I started before any new one, the oldest first", () => {
    let state = record(held, { type: "taken", ...refOf(NEWER, 1) })
    state = record(state, { type: "taken", ...refOf(OLDER, 1) })
    expect(nextPick(state)).toMatchObject({
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
    state = letGo(state, OLDEST)
    expect(doneOn(state, "2026-10-18", dayOf)).toBe(2)
  })
})
