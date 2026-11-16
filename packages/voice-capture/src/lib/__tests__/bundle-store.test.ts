/**
 * Where a week-shaped bundle keeps itself (RR13, IW5): a draft per id, records
 * that only grow, and a week's sends read as home has them (RR22).
 */
import { inMemoryStorage } from "@some-ui/core-utils"
import {
  isPastDue,
  keptDrafts,
  keptRecords,
  sendsAtHome,
  weekSendKey,
} from "@voice-capture/lib/bundle-store"
import { describe, expect, it } from "vitest"

const draft = (
  id: string
): {
  id: string
  at: string
  typed: Record<string, string>
  later: Array<string>
} => ({ id, at: "2026-11-17T00:00:00Z", typed: {}, later: [] })

describe("a week's draft and its sends, kept on the phone", () => {
  it("keeps each week's draft apart, and clears only its own", () => {
    const storage = inMemoryStorage()
    const w47 = keptDrafts(storage, "drafts", "2026-w47")
    const w48 = keptDrafts(storage, "drafts", "2026-w48")
    expect(w47.read()).toBeNull()
    expect(w47.write(draft("2026-w47"))).toBe(true)
    expect(w48.write(draft("2026-w48"))).toBe(true)
    expect(w47.write(null)).toBe(true)
    expect(w47.read()).toBeNull()
    expect(w48.read()).toEqual(draft("2026-w48"))
  })

  it("refuses a change that would drop or rewrite a record kept", () => {
    const records = keptRecords<{ week: string; at: string }>(
      inMemoryStorage(),
      "sent",
      (value) => (Array.isArray(value) ? value : null)
    )
    const first = { week: "2026-w47", at: "2026-11-17T00:00:00Z" }
    expect(records.keep((kept) => [...kept, first])).toEqual([first])
    expect(records.keep(() => [])).toBeNull()
    expect(
      records.keep(() => [{ ...first, at: "2026-11-18T00:00:00Z" }])
    ).toBeNull()
    expect(records.list()).toEqual([first])
  })
})

describe("a week's sends as home has them (RR22)", () => {
  const send = (week: string, at: string): { week: string; at: string } => ({
    week,
    at,
  })
  const sends = [
    send("2026-w47", "2026-11-17T00:00:00Z"),
    send("2026-w47", "2026-11-18T00:00:00Z"),
    send("2026-w48", "2026-11-24T00:00:00Z"),
  ]

  it("holds the latest home has, beside the latest made, of that week only", () => {
    const home = sendsAtHome(sends, "2026-w47", (sent) => sent === sends[0])
    expect(home).toEqual({ holds: sends[0], last: sends[1] })
    expect(sendsAtHome(sends, "2026-w49", () => true)).toEqual({
      holds: null,
      last: null,
    })
  })

  it("knows a send by its week and instant, and closes after the deadline only", () => {
    expect(weekSendKey(sends[0]!)).toBe("2026-w47/2026-11-17T00:00:00Z")
    const due = "2026-11-22T23:59:00-08:00"
    expect(isPastDue(due, "2026-11-23T07:59:00.000Z")).toBe(false)
    expect(isPastDue(due, "2026-11-23T08:00:00.000Z")).toBe(true)
  })
})
