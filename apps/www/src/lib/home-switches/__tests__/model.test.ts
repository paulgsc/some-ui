/**
 * The page's state machine: a read lands only while it is being read, one
 * set at a time, and a set's answer is never replaced by an older read's.
 */
import { describe, expect, it } from "vitest"

import type {
  Standing,
  SwitchesEvent,
  SwitchesState,
} from "@/lib/home-switches/model"
import {
  canSet,
  INITIAL_SWITCHES,
  stepSwitches,
} from "@/lib/home-switches/model"

const ON: Standing = { on: true, set: null }
const PAUSED: Standing = {
  on: false,
  set: { by: "owner", at: "2026-11-08T14:05:00.000Z" },
}

const run = (events: ReadonlyArray<SwitchesEvent>): SwitchesState =>
  events.reduce(stepSwitches, INITIAL_SWITCHES)

describe("stepSwitches", () => {
  it("reads, then sets, then reads what home answered", () => {
    expect(run([{ type: "read", standing: ON }])).toEqual({
      kind: "read",
      standing: ON,
      setting: null,
    })
    const setting = run([
      { type: "read", standing: ON },
      { type: "set-asked", on: false },
    ])
    expect(setting).toEqual({ kind: "read", standing: ON, setting: false })
    expect(canSet(setting)).toBe(false)
    expect(stepSwitches(setting, { type: "set", standing: PAUSED })).toEqual({
      kind: "read",
      standing: PAUSED,
      setting: null,
    })
  })

  it("a set that fails may have landed, so the switch is read again", () => {
    const failed = run([
      { type: "read", standing: ON },
      { type: "set-asked", on: false },
      { type: "set-failed", why: "unreachable" },
    ])
    expect(failed).toEqual({ kind: "reading" })
    expect(stepSwitches(failed, { type: "read", standing: PAUSED })).toEqual({
      kind: "read",
      standing: PAUSED,
      setting: null,
    })
  })

  it("a read that fails says why, and asking again reads again", () => {
    const unread = run([{ type: "read-failed", why: "not-operator" }])
    expect(unread).toEqual({ kind: "unread", why: "not-operator" })
    expect(stepSwitches(unread, { type: "read-asked" })).toEqual({
      kind: "reading",
    })
  })

  it("changes nothing on an event that does not fit, the same object", () => {
    const setting = run([
      { type: "read", standing: ON },
      { type: "set-asked", on: false },
    ])
    const misfits: Array<[SwitchesState, SwitchesEvent]> = [
      [INITIAL_SWITCHES, { type: "set-asked", on: false }],
      [INITIAL_SWITCHES, { type: "set", standing: PAUSED }],
      [INITIAL_SWITCHES, { type: "set-failed", why: "failed" }],
      [setting, { type: "set-asked", on: true }],
      [setting, { type: "read-asked" }],
      [setting, { type: "read", standing: ON }],
      [setting, { type: "read-failed", why: "failed" }],
      [run([{ type: "read", standing: ON }]), { type: "set", standing: ON }],
    ]
    for (const [state, event] of misfits) {
      expect(stepSwitches(state, event)).toBe(state)
    }
  })
})
