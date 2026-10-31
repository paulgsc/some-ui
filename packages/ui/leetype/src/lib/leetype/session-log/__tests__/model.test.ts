import type {
  SessionEvent,
  SessionLog,
} from "@leetype/lib/leetype/session-log/model"
import {
  append,
  ledgerOf,
  SessionEventSchema,
  summariesOf,
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
        strong: false,
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

    // After the worked confirmation `aSession` took, so assisted: it still
    // unparks here, and only the summary counts it unsolved (LTY1).
    events.push(returned("b", "correct"))
    const ledger = ledgerOf(logOf(events), "b")
    expect(ledger.parked).toEqual([])
    expect(ledger.walked).toEqual([{ file: "thread-1.json", screen: "r1b" }])
    expect(ledgerOf(logOf(events), "a").parked).toHaveLength(1)
  })

  it("keeps a take parked until a later answer on it is strong", () => {
    const take = { file: "thread-1.json", screen: "s1" }
    const said = (strong: boolean): SessionEvent => ({
      ...stamp("b"),
      ...take,
      type: "spoken",
      answer: { as: "typed", ticks: [], strong },
    })
    const events = [
      ...aSession("a"),
      { ...stamp("a"), ...take, type: "parked" } as const,
      said(false),
    ]
    expect(ledgerOf(logOf(events), "b").parked).toContainEqual(
      expect.objectContaining(take)
    )
    events.push(said(true))
    expect(ledgerOf(logOf(events), "b").parked).not.toContainEqual(
      expect.objectContaining(take)
    )
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

describe("summariesOf", () => {
  it("says how each session went, round by round, without its events", () => {
    const log = logOf([
      ...aSession("a"),
      { ...returned("a", "correct"), at: "2026-10-18T21:00:00.000Z" },
    ])
    expect(summariesOf(log)).toEqual([
      {
        session: "a",
        file: "thread-1.json",
        form: "short",
        startedAt: log[0]?.at,
        ended: "left",
        rounds: [
          {
            file: "thread-1.json",
            screen: "r1",
            picked: "incorrect",
            struggled: true,
            placed: ["p1"],
            reading: [{ reading: "p1", action: "saved" }],
            // The session took the round's worked confirmation before the
            // return: the return is assisted and solves nothing (LTY1).
            returned: [{ response: "correct", slow: false, assisted: true }],
            solved: false,
          },
        ],
        replays: [],
        spoken: [
          {
            file: "thread-1.json",
            screen: "s1",
            as: "recorded",
            strong: false,
          },
        ],
      },
    ])
  })

  it("counts a slow pick as a struggle, and a slow return as not solving it", () => {
    const [started, picked] = aSession("b")
    if (started === undefined || picked?.type !== "picked") {
      throw new Error("a session starts and picks")
    }
    const log = logOf([
      started,
      { ...picked, answer: { response: "correct", slow: true } },
      placed("b", "g1", "placement"),
      returned("b", "correct", true),
    ])
    expect(summariesOf(log)[0]?.rounds).toEqual([
      expect.objectContaining({
        picked: "correct",
        struggled: true,
        placed: ["g1"],
        returned: [{ response: "correct", slow: true, assisted: false }],
        solved: false,
      }),
    ])
  })

  it("keeps a round's funnel with the session that first picked it, whatever later sessions do", () => {
    const [startedA, pickedA] = aSession("c")
    const [startedB] = aSession("d", "thread-2.json")
    if (
      startedA === undefined ||
      startedB === undefined ||
      pickedA?.type !== "picked"
    ) {
      throw new Error("sessions start and pick")
    }
    const log = logOf([
      startedA,
      pickedA,
      placed("c", "p1", "placement"),
      {
        ...stamp("c"),
        file: "thread-1.json",
        type: "reading",
        reading: "p1",
        action: "saved",
      },
      startedB,
      {
        ...stamp("d"),
        file: "thread-1.json",
        type: "reading",
        reading: "p1",
        action: "read",
      },
      returned("d", "correct"),
      {
        ...pickedA,
        ...stamp("d"),
        answer: { response: "correct", slow: false },
      },
    ])
    const [c, d] = summariesOf(log)
    expect(c?.rounds).toEqual([
      expect.objectContaining({
        screen: "r1",
        reading: [
          { reading: "p1", action: "saved" },
          { reading: "p1", action: "read" },
        ],
        returned: [{ response: "correct", slow: false, assisted: false }],
        solved: true,
      }),
    ])
    expect(d).toMatchObject({
      session: "d",
      rounds: [],
      replays: [{ file: "thread-1.json", screen: "r1", picked: "correct" }],
    })
  })

  it("gives a reading's actions to the round its latest placement was for, and none to a pointer", () => {
    const [started, picked] = aSession("e")
    if (started === undefined || picked?.type !== "picked") {
      throw new Error("a session starts and picks")
    }
    const on = (screen: string): { file: string; screen: string } => ({
      file: "thread-1.json",
      screen,
    })
    const read = (action: "opened" | "skipped"): SessionEvent => ({
      ...stamp("e"),
      file: "thread-1.json",
      type: "reading",
      reading: "p1",
      action,
    })
    const log = logOf([
      started,
      { ...picked, ...on("r1"), answer: { response: "correct", slow: false } },
      { ...placed("e", "p1", "pointer"), ...on("r1") },
      read("opened"),
      { ...picked, ...stamp("e"), ...on("r2") },
      { ...placed("e", "p1", "placement"), ...on("r2") },
      read("skipped"),
      { ...picked, ...stamp("e"), ...on("r3") },
      { ...placed("e", "p1", "placement"), ...on("r3") },
    ])
    expect(
      summariesOf(log)[0]?.rounds.map(({ screen, placed: p, reading }) => ({
        screen,
        placed: p,
        reading,
      }))
    ).toEqual([
      { screen: "r1", placed: [], reading: [] },
      {
        screen: "r2",
        placed: ["p1"],
        reading: [{ reading: "p1", action: "skipped" }],
      },
      { screen: "r3", placed: ["p1"], reading: [] },
    ])
  })

  it("parks a solved round again when a replay struggles on it, as the ledger does", () => {
    const [startedA, pickedA] = aSession("f")
    const [startedB] = aSession("g")
    if (
      startedA === undefined ||
      startedB === undefined ||
      pickedA?.type !== "picked"
    ) {
      throw new Error("sessions start and pick")
    }
    const parked = (session: string): SessionEvent => ({
      ...stamp(session),
      file: "thread-1.json",
      screen: "r1",
      type: "parked",
    })
    const log = logOf([
      startedA,
      pickedA,
      placed("f", "p1", "placement"),
      parked("f"),
      returned("f", "correct"),
      {
        ...pickedA,
        ...stamp("f"),
        answer: { response: "correct", slow: false },
      },
      startedB,
      { ...pickedA, ...stamp("g") },
      placed("g", "p1", "placement"),
      parked("g"),
    ])
    const [f, g] = summariesOf(log)
    expect(f?.rounds[0]).toMatchObject({ placed: ["p1", "p1"], solved: false })
    expect(f?.replays).toEqual([
      { file: "thread-1.json", screen: "r1", picked: "correct" },
    ])
    expect(g?.replays).toEqual([
      { file: "thread-1.json", screen: "r1", picked: "incorrect" },
    ])
    expect(ledgerOf(log, "g").parked).toEqual([
      { file: "thread-1.json", screen: "r1", reading: "p1" },
    ])
  })
})
