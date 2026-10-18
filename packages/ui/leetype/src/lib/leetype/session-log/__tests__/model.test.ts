import type {
  SessionEvent,
  SessionLog,
} from "@leetype/lib/leetype/session-log/model"
import { append, ledgerOf } from "@leetype/lib/leetype/session-log/model"
import { describe, expect, it } from "vitest"

let n = 0
function stamp(session: string): { id: string; at: string; session: string } {
  n += 1
  return { id: `e${String(n)}`, at: "2026-10-18T20:00:00.000Z", session }
}

/** One session of each kind of event, in the order a session makes them. */
function aSession(
  session: string,
  file = "thread-1.json"
): Array<SessionEvent> {
  return [
    {
      ...stamp(session),
      type: "started",
      file,
      form: "short",
      declaredMinutes: 5,
    },
    {
      ...stamp(session),
      type: "picked",
      screen: "r1",
      option: "Two",
      response: "incorrect",
      ms: 9000,
      slow: false,
    },
    { ...stamp(session), type: "placed", screen: "r1", reading: "p1" },
    { ...stamp(session), type: "parked", screen: "r1" },
    { ...stamp(session), type: "reading", reading: "p1", action: "saved" },
    { ...stamp(session), type: "confirmation-taken", screen: "r1" },
    {
      ...stamp(session),
      type: "spoken",
      screen: "s1",
      seconds: 41,
      passed: false,
      typed: false,
      ticks: ["A majority must hold the write"],
    },
    { ...stamp(session), type: "ended", screen: "end", how: "left" },
  ]
}

function logOf(events: Array<SessionEvent>): SessionLog {
  return events.reduce<SessionLog>(append, [])
}

describe("append", () => {
  it("adds at the end and leaves every earlier event as it was", () => {
    const events = aSession("a")
    let log: SessionLog = []
    for (const event of events) {
      const before = structuredClone(log)
      const next = append(log, event)
      expect(log).toEqual(before)
      expect(next.slice(0, -1)).toEqual(before)
      expect(next.at(-1)).toEqual(event)
      log = next
    }
  })

  it("keeps an event once, however often it is appended", () => {
    const [first] = aSession("a")
    if (!first) throw new Error("a session starts")
    const log = append([], first)
    expect(append(log, first)).toBe(log)
  })
})

describe("ledgerOf", () => {
  it("says what the session walked, parked, saved and spoke", () => {
    const log = logOf(aSession("a"))
    expect(ledgerOf(log, "a")).toEqual({
      walked: ["r1"],
      parked: [{ file: "thread-1.json", screen: "r1", reading: "p1" }],
      saved: ["p1"],
      spoken: [{ screen: "s1", passed: false, typed: false }],
    })
  })

  it("keeps a round parked until a return solves it, in a later session", () => {
    const events = aSession("a")
    events.push(
      {
        ...stamp("b"),
        type: "started",
        file: "thread-1.json",
        form: "full",
        declaredMinutes: 10,
      },
      { ...stamp("b"), type: "reading", reading: "p1", action: "read" },
      {
        ...stamp("b"),
        type: "returned",
        screen: "r1",
        variant: "r1b",
        response: "incorrect",
      }
    )
    expect(ledgerOf(logOf(events), "b").parked).toHaveLength(1)

    events.push({
      ...stamp("b"),
      type: "returned",
      screen: "r1",
      variant: "r1c",
      response: "correct",
    })
    const ledger = ledgerOf(logOf(events), "b")
    expect(ledger.parked).toEqual([])
    expect(ledger.saved).toEqual([])
  })

  it("tells apart rounds that share an id in different session files", () => {
    const log = logOf([
      ...aSession("a", "one.json"),
      ...aSession("b", "two.json"),
    ])
    expect(ledgerOf(log, "b").parked.map((round) => round.file)).toEqual([
      "one.json",
      "two.json",
    ])
  })
})
