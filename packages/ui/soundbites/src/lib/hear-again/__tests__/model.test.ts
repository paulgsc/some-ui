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

const FREE = { askAgainAt: null, hearing: false } as const
const LATER = "2026-11-21T15:00:00.000Z"
const take = { id: "a", hearAgain: FREE }

/** The slice after asking of `take` once. */
const asking = (): HearAgainSlice =>
  askedToHearAgain(QUIET_HEAR_AGAIN, take).state

describe("asking home to hear a take again (#3339)", () => {
  it("asks only where home will hear it again, not while it hears it, nor until it says", () => {
    expect(askable(null)).toBe(false)
    expect(askable({ askAgainAt: LATER, hearing: false })).toBe(false)
    expect(askable({ askAgainAt: null, hearing: true })).toBe(false)
    expect(askable(FREE)).toBe(true)
    for (const hearAgain of [
      null,
      undefined,
      { askAgainAt: LATER, hearing: false },
    ]) {
      const step = askedToHearAgain(QUIET_HEAR_AGAIN, { id: "a", hearAgain })
      expect(step.effects).toEqual([])
      expect(step.state).toBe(QUIET_HEAR_AGAIN)
    }
    expect(askedToHearAgain(QUIET_HEAR_AGAIN, take).effects).toEqual([
      { type: "sendHearAgain", seq: 1, id: "a" },
    ])
  })

  it("asks one take at a time", () => {
    const second = askedToHearAgain(asking(), { id: "b", hearAgain: FREE })
    expect(second.effects).toEqual([])
  })

  it("lays home's answer over the take asked of: hearing once asked, and when it can be asked again", () => {
    const asked = hearAgainAnswered(asking(), 1, {
      kind: "asked",
      askAgainAt: LATER,
    })
    expect(hearAgainOf(asked, take)).toEqual({
      askAgainAt: LATER,
      hearing: true,
    })
    expect(asked.hearAgain.said).toEqual({ id: "a", kind: "asked" })
    expect(asked.hearAgain.asking).toBeNull()
    // Asked too recently: when it can be asked again, hearing as it was.
    const snoozed = hearAgainAnswered(asking(), 1, {
      kind: "snoozed",
      askAgainAt: LATER,
    })
    expect(hearAgainOf(snoozed, take)).toEqual({
      askAgainAt: LATER,
      hearing: false,
    })
    // Not taken: the take as the list read it.
    const missed = hearAgainAnswered(asking(), 1, { kind: "notTaken" })
    expect(hearAgainOf(missed, take)).toEqual(FREE)
    expect(missed.hearAgain.said).toEqual({ id: "a", kind: "notTaken" })
  })

  it("counts an answer only for the ask made last", () => {
    const state = asking()
    expect(hearAgainAnswered(state, 9, { kind: "notTaken" })).toBe(state)
    expect(hearAgainAnswered(QUIET_HEAR_AGAIN, 0, { kind: "notTaken" })).toBe(
      QUIET_HEAR_AGAIN
    )
  })

  it("takes a fresh read's word over what was laid on it, and closes what was said", () => {
    const asked = hearAgainAnswered(asking(), 1, {
      kind: "asked",
      askAgainAt: LATER,
    })
    expect(hearAgainOf(hearAgainRead(asked), take)).toEqual(FREE)
    expect(hearAgainDismissed(asked).hearAgain.said).toBeNull()
    expect(hearAgainRead(QUIET_HEAR_AGAIN)).toBe(QUIET_HEAR_AGAIN)
  })
})
