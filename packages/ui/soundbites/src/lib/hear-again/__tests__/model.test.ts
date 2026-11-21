/** @vitest-environment node */
import type { HearAgainSlice } from "@soundbites/lib/hear-again/model"
import {
  askable,
  askedToHearAgain,
  hearAgainAnswered,
  hearAgainDismissed,
  hearAgainOf,
  hearAgainRead,
  QUIET_HEAR_AGAIN,
} from "@soundbites/lib/hear-again/model"
import { describe, expect, it } from "vitest"

const OPEN = { open: true, hearing: false, askAgainAt: null } as const
const LATER = "2026-11-21T15:00:00.000Z"
const take = { id: "a", hearAgain: OPEN }

/** The slice after asking of `take` once. */
const asking = (): HearAgainSlice =>
  askedToHearAgain(QUIET_HEAR_AGAIN, take).state

describe("asking home to hear a take again (#3339)", () => {
  it("asks only where home says it can be asked now", () => {
    expect(askable(null)).toBe(false)
    expect(askable({ open: false, hearing: false, askAgainAt: LATER })).toBe(
      false
    )
    expect(askable({ open: false, hearing: true, askAgainAt: null })).toBe(
      false
    )
    expect(askable(OPEN)).toBe(true)
    for (const hearAgain of [
      null,
      undefined,
      { open: false, hearing: false, askAgainAt: LATER },
    ]) {
      const step = askedToHearAgain(QUIET_HEAR_AGAIN, { id: "a", hearAgain })
      expect(step.effects).toEqual([])
      expect(step.state).toBe(QUIET_HEAR_AGAIN)
    }
    expect(askedToHearAgain(QUIET_HEAR_AGAIN, take).effects).toEqual([
      { type: "sendHearAgain", seq: 1, id: "a" },
    ])
  })

  it("asks one take at a time, and not while another act is under way", () => {
    const second = askedToHearAgain(asking(), { id: "b", hearAgain: OPEN })
    expect(second.effects).toEqual([])
    expect(askedToHearAgain(QUIET_HEAR_AGAIN, take, true).effects).toEqual([])
  })

  it("lays home's answer over the take asked of", () => {
    const asked = hearAgainAnswered(asking(), 1, { kind: "asked" })
    expect(hearAgainOf(asked, take)).toEqual({
      open: false,
      hearing: true,
      askAgainAt: null,
    })
    expect(asked.hearAgain.said).toEqual({ id: "a", kind: "asked" })
    expect(asked.hearAgain.asking).toBeNull()
    // Asked too recently: when it can be asked again, hearing as it was.
    const snoozed = hearAgainAnswered(asking(), 1, {
      kind: "snoozed",
      askAgainAt: LATER,
    })
    expect(hearAgainOf(snoozed, take)).toEqual({
      open: false,
      hearing: false,
      askAgainAt: LATER,
    })
    // Home holds no such take: none to ask of it again.
    const settled = hearAgainAnswered(asking(), 1, { kind: "settled" })
    expect(hearAgainOf(settled, take)).toBeNull()
    // Not taken, or not heard a first time yet: the take as the list read it.
    for (const kind of ["notTaken", "waiting", "busy"] as const) {
      const left = hearAgainAnswered(asking(), 1, { kind })
      expect(hearAgainOf(left, take)).toEqual(OPEN)
      expect(left.hearAgain.said).toEqual({ id: "a", kind })
    }
  })

  it("counts an answer only for the ask made last", () => {
    const state = asking()
    expect(hearAgainAnswered(state, 9, { kind: "notTaken" })).toBe(state)
    expect(hearAgainAnswered(QUIET_HEAR_AGAIN, 0, { kind: "notTaken" })).toBe(
      QUIET_HEAR_AGAIN
    )
  })

  it("takes a fresh read's word over what was laid on it, and closes what was said", () => {
    const asked = hearAgainAnswered(asking(), 1, { kind: "asked" })
    expect(hearAgainOf(hearAgainRead(asked), take)).toEqual(OPEN)
    expect(hearAgainDismissed(asked).hearAgain.said).toBeNull()
    expect(hearAgainRead(QUIET_HEAR_AGAIN)).toBe(QUIET_HEAR_AGAIN)
  })
})
