/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it } from "vitest"

import type { Stop } from "@/lib/session-stop"
import {
  forgetStop,
  hasLapsed,
  latestStop,
  PICK_UP_MS,
  readStops,
  saveStop,
  STOP_LIMIT,
  updateStop,
} from "@/lib/session-stop"

const stopAt = (sessionId: string, stoppedAt: string): Stop => ({
  sessionId,
  stoppedAt,
  elapsedMs: 738_000,
  plannedMs: 1_200_000,
  scene: "reading",
  via: "left",
  reason: null,
  reasonFrom: null,
  outcome: "open",
  settledAt: null,
})

const NOON = "2026-10-06T12:00:00.000Z"

beforeEach(() => {
  localStorage.clear()
})

describe("session stops", () => {
  it("keeps a session's latest stop, newest first", () => {
    saveStop(stopAt("a", NOON))
    saveStop(stopAt("a", "2026-10-06T13:00:00.000Z"))

    expect(latestStop("a")?.stoppedAt).toBe("2026-10-06T13:00:00.000Z")
    expect(latestStop("b")).toBeNull()
  })

  it("merges an update into the stored record, not a stale copy", () => {
    const stale = stopAt("a", NOON)
    saveStop(stale)
    updateStop(stale, { reason: "call", reasonFrom: "return" })

    const settled = updateStop(stale, { outcome: "done" })

    expect(settled.reason).toBe("call")
    expect(latestStop("a")).toMatchObject({ reason: "call", outcome: "done" })
  })

  it("forgets a stop that was not one", () => {
    const stop = stopAt("a", NOON)
    saveStop(stop)
    forgetStop(stop)

    expect(readStops()).toEqual([])
  })

  it("stays bounded", () => {
    for (let i = 0; i < STOP_LIMIT + 5; i += 1) {
      saveStop(stopAt(`s${String(i)}`, NOON))
    }

    expect(readStops()).toHaveLength(STOP_LIMIT)
    expect(latestStop(`s${String(STOP_LIMIT + 4)}`)).not.toBeNull()
    expect(latestStop("s0")).toBeNull()
  })

  it("reads what it cannot trust as no stops", () => {
    localStorage.setItem("some-ui:session-stops", "{not json")
    expect(readStops()).toEqual([])

    localStorage.setItem(
      "some-ui:session-stops",
      JSON.stringify([{ ...stopAt("a", NOON), reason: "bored" }, 7])
    )
    expect(readStops()).toEqual([])
  })

  it("lapses an open stop only past the pick-up window", () => {
    const stop = stopAt("a", NOON)
    const at = (ms: number): Date => new Date(Date.parse(NOON) + ms)

    expect(hasLapsed(stop, at(PICK_UP_MS))).toBe(false)
    expect(hasLapsed(stop, at(PICK_UP_MS + 1))).toBe(true)
    expect(hasLapsed({ ...stop, outcome: "resumed" }, at(2 * PICK_UP_MS))).toBe(
      false
    )
  })
})
