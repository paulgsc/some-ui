import type {
  SessionEvent,
  SessionLog,
} from "@leetype/lib/leetype/session-log/model"
import {
  append,
  ledgerOf,
  SessionEventSchema,
} from "@leetype/lib/leetype/session-log/model"
import { describe, expect, it } from "vitest"

let n = 0
function stamp(session: string): { id: string; at: string; session: string } {
  n += 1
  const at = new Date(Date.UTC(2026, 9, 18, 20) + n * 1000).toISOString()
  return { id: `e${String(n)}`, at, session }
}

/** One session of each kind of event, in the order a session makes them. */
function aSession(
  session: string,
  file = "thread-1.json"
): Array<SessionEvent> {
  const on = { file, screen: "r1" }
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
      ...on,
      type: "picked",
      option: "Two",
      ms: 9000,
      answer: { response: "incorrect", slow: false },
    },
    {
      ...stamp(session),
      ...on,
      type: "placed",
      reading: "p1",
      as: "placement",
    },
    { ...stamp(session), ...on, type: "parked" },
    {
      ...stamp(session),
      file,
      type: "reading",
      reading: "p1",
      action: "saved",
    },
    { ...stamp(session), ...on, type: "confirmation-taken" },
    {
      ...stamp(session),
      file,
      screen: "s1",
      type: "spoken",
      answer: {
        as: "recorded",
        seconds: 41,
        ticks: ["A majority must hold the write"],
      },
    },
    { ...stamp(session), file, screen: "end", type: "ended", how: "left" },
  ]
}

function returned(
  session: string,
  response: "correct" | "incorrect" | "abstained",
  slow = false
): SessionEvent {
  return {
    ...stamp(session),
    file: "thread-1.json",
    screen: "r1",
    type: "returned",
    variant: "r1b",
    asked: false,
    option: "Three",
    ms: 7000,
    answer: response === "abstained" ? { response } : { response, slow },
  }
}

function placed(
  session: string,
  reading: string,
  as: "placement" | "pointer"
): SessionEvent {
  return {
    ...stamp(session),
    file: "thread-1.json",
    screen: "r1",
    type: "placed",
    reading,
    as,
  }
}

function logOf(events: Array<SessionEvent>): SessionLog {
  return events.reduce<SessionLog>(append, [])
}

describe("append", () => {
  it("adds at the end and leaves every earlier event as it was", () => {
    let log: SessionLog = []
    for (const event of aSession("a")) {
      const before = structuredClone(log)
      const next = append(log, event)
      expect(log).toEqual(before)
      expect(next).toEqual([...before, event])
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

describe("SessionEventSchema", () => {
  it("reads back every event a session makes", () => {
    for (const event of aSession("a")) {
      expect(SessionEventSchema.parse(event)).toEqual(event)
    }
  })

  it("refuses a slow abstention (Def. 9.4)", () => {
    const [, picked] = aSession("a")
    expect(
      SessionEventSchema.safeParse({
        ...picked,
        answer: { response: "abstained", slow: true },
      }).success
    ).toBe(false)
  })
})

describe("ledgerOf", () => {
  it("says what the session walked, parked, saved and spoke", () => {
    expect(ledgerOf(logOf(aSession("a")), "a")).toEqual({
      walked: [{ file: "thread-1.json", screen: "r1" }],
      parked: [{ file: "thread-1.json", screen: "r1", reading: "p1" }],
      saved: [{ file: "thread-1.json", reading: "p1" }],
      spoken: [{ file: "thread-1.json", screen: "s1", as: "recorded" }],
    })
  })

  it("keeps a round parked until a return solves it, in a later session of another file", () => {
    const events = [
      ...aSession("a"),
      ...aSession("b", "thread-2.json").slice(0, 1),
      returned("b", "incorrect"),
      placed("b", "p2", "placement"),
      returned("b", "abstained"),
      placed("b", "p3", "pointer"),
      returned("b", "correct", true),
    ]
    expect(ledgerOf(logOf(events), "b").parked).toEqual([
      { file: "thread-1.json", screen: "r1", reading: "p2" },
    ])

    events.push(returned("b", "correct"))
    const ledger = ledgerOf(logOf(events), "b")
    expect(ledger.parked).toEqual([])
    expect(ledger.walked).toEqual([{ file: "thread-1.json", screen: "r1b" }])
    expect(ledgerOf(logOf(events), "a").parked).toHaveLength(1)
  })

  it("keeps a reading saved until it is read, whatever else is done with it", () => {
    const action = (
      session: string,
      file: string,
      what: "opened" | "skipped" | "read"
    ): SessionEvent => ({
      ...stamp(session),
      file,
      type: "reading",
      reading: "p1",
      action: what,
    })
    const events = [
      ...aSession("a"),
      action("b", "thread-1.json", "opened"),
      action("b", "thread-1.json", "skipped"),
      action("b", "thread-2.json", "read"),
    ]
    expect(ledgerOf(logOf(events), "b").saved).toEqual([
      { file: "thread-1.json", reading: "p1" },
    ])

    events.push(action("b", "thread-1.json", "read"))
    expect(ledgerOf(logOf(events), "b").saved).toEqual([])
    expect(ledgerOf(logOf(events), "a").saved).toHaveLength(1)
  })

  it("reads the log by time, so a late event in an earlier session leaves a later ledger as it was", () => {
    const a = aSession("a")
    const b = aSession("b", "thread-2.json")
    const late: SessionEvent = {
      ...stamp("a"),
      file: "thread-1.json",
      type: "reading",
      reading: "p1",
      action: "read",
    }
    const ledger = ledgerOf(logOf([...a, ...b]), "b")
    expect(ledgerOf(logOf([...a, late, ...b]), "b")).toEqual(ledger)
    expect(ledgerOf(logOf([...a, late, ...b]), "a").saved).toEqual([
      { file: "thread-2.json", reading: "p1" },
    ])
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
