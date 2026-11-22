/**
 * The tracker's record and its exchange with home (RR26): what is kept on
 * this phone, the order it goes in, and how each of home's answers is read,
 * the 409 for a start before the latest close above all (never sent again).
 */
import type { OpenSpan } from "@rust-rounds/lib/work-tracker"
import type { HomeSpan } from "@rust-rounds/lib/work-tracker/home"
import { exchangeWorkSpans, spanSaid } from "@rust-rounds/lib/work-tracker/home"
import type {
  EventAtHome,
  SpanEvent,
} from "@rust-rounds/lib/work-tracker/record"
import {
  closeOf,
  eventKey,
  openOnPhone,
  spanEventsGoing,
  spanOfStart,
  startOf,
  wireOf,
  workSpans,
} from "@rust-rounds/lib/work-tracker/record"
import type { HomeAnswer, HomeCall } from "@some-ui/core-utils"
import { inMemoryStorage } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

const T0 = Date.parse("2026-11-19T09:40:00.000Z")
const MIN = 60_000

const span: OpenSpan = {
  id: "11111111-1111-4111-8111-111111111111",
  startedAt: T0,
  device: "Pixel 8",
  where: {
    week: "2026-w47",
    ticket: "TB-101",
    step: "read",
    exercise: null,
    points: [1, 2],
  },
}
const start = startOf(span)
const close = closeOf({
  span,
  stoppedAt: T0 + 30 * MIN,
  stoppedBy: "you",
  answer: "part",
  countedSeconds: 15 * 60,
})

const homeSpan = (closed: boolean): HomeSpan => ({
  id: span.id,
  week: span.where.week,
  ticket: span.where.ticket,
  step: span.where.step,
  exercise: null,
  points: [1, 2],
  device: span.device,
  startedAt: start.at,
  keptAt: start.at,
  closed: closed
    ? {
        at: close.at,
        stoppedBy: "you",
        answer: "part",
        countedSeconds: 900,
        keptAt: close.at,
      }
    : null,
})

const answer = (status: number, body: unknown): HomeAnswer => ({
  status,
  body: JSON.stringify(body),
})

describe("the record on this phone", () => {
  it("keeps a start and its close, and only grows", () => {
    const record = workSpans(inMemoryStorage())
    expect(record.keep((events) => [...events, start])).toEqual([start])
    expect(record.keep((events) => [...events, close])).toEqual([start, close])
    expect(record.keep(() => [close])).toBeNull()
    expect(record.list()).toEqual([start, close])
  })

  it("goes home as kept: the start's at, byte for byte, and no kind", () => {
    expect(wireOf(start)).toEqual({
      id: span.id,
      at: "2026-11-19T09:40:00.000Z",
      week: "2026-w47",
      ticket: "TB-101",
      step: "read",
      exercise: null,
      points: [1, 2],
      device: "Pixel 8",
    })
    expect(spanOfStart(start)).toEqual(span)
  })

  it("is open on this phone until it closes, or home refuses its start", () => {
    expect(openOnPhone([])).toBeNull()
    expect(openOnPhone([start])).toEqual(span)
    expect(openOnPhone([start, close])).toBeNull()
    expect(openOnPhone([start], (key) => key === eventKey(start))).toBeNull()
  })

  it("sends a close only once home holds its start", () => {
    const at =
      (said: Record<string, EventAtHome>) =>
      (key: string): EventAtHome =>
        said[key] ?? "waiting"
    expect(spanEventsGoing([start, close], at({}))).toEqual([start])
    expect(
      spanEventsGoing([start, close], at({ [eventKey(start)]: "held" }))
    ).toEqual([close])
    expect(
      spanEventsGoing([start, close], at({ [eventKey(start)]: "refused" }))
    ).toEqual([])
    // A span another device started, answered here.
    expect(spanEventsGoing([close], at({}))).toEqual([close])
  })
})

describe("home's answers, read once", () => {
  it.each<[string, SpanEvent, HomeAnswer, string]>([
    [
      "a start added",
      start,
      answer(201, { change: "added", span: homeSpan(false) }),
      "held",
    ],
    [
      "a start again",
      start,
      answer(200, { change: "unchanged", span: homeSpan(true) }),
      "held",
    ],
    [
      "a close added",
      close,
      answer(201, { change: "added", span: homeSpan(true) }),
      "held",
    ],
    [
      "a close home holds otherwise",
      close,
      answer(200, { change: "unchanged", span: homeSpan(false) }),
      "again",
    ],
    [
      "a start before the latest close",
      start,
      answer(409, {
        error: {
          code: "conflict",
          message: "this start is before the last span closed",
        },
      }),
      "refused",
    ],
    [
      "another close of the span",
      close,
      answer(409, { error: { code: "conflict" } }),
      "refused",
    ],
    [
      "a start while another span is open",
      start,
      answer(409, { error: { code: "conflict" }, open: homeSpan(false) }),
      "again",
    ],
    ["a close before its start reached home", close, answer(404, {}), "again"],
    ["an at ahead of home's clock", start, answer(422, {}), "again"],
    ["a fault", start, answer(500, {}), "again"],
    ["an unreadable 201", start, { status: 201, body: "nope" }, "again"],
  ])("%s", (_, event, said, expected) => {
    expect(spanSaid(event, said)).toBe(expected)
  })
})

/** A home that answers each call from `script`, recording the calls. */
function scripted(script: ReadonlyArray<HomeAnswer>): {
  send: HomeCall
  calls: Array<string>
} {
  const calls: Array<string> = []
  let at = 0
  const send: HomeCall = async (method, path, body) => {
    calls.push(`${method} ${path}${typeof body === "string" ? ` ${body}` : ""}`)
    const next = script[at]
    at += 1
    if (next === undefined) throw new Error("unscripted")
    return Promise.resolve(next)
  }
  return { send, calls }
}

describe("the exchange", () => {
  const nothing = (): EventAtHome => "waiting"
  const week = (open: HomeSpan | null, spans: Array<HomeSpan>): HomeAnswer =>
    answer(200, { week: "2026-w47", spans, open })

  it("sends a start then its close in one run, then reads the week", async () => {
    const { send, calls } = scripted([
      answer(201, { change: "added", span: homeSpan(false) }),
      answer(201, { change: "added", span: homeSpan(true) }),
      week(null, [homeSpan(true)]),
    ])
    const done = await exchangeWorkSpans(send, [start, close], nothing, [
      "2026-w47",
    ])
    expect(calls.map((call) => call.split(" ").slice(0, 2).join(" "))).toEqual([
      "POST /rust-work-spans/start",
      "POST /rust-work-spans/close",
      "GET /rust-work-spans?week=2026-w47",
    ])
    expect(calls[0]).toContain(`"at":"${start.at}"`)
    expect(done.said).toEqual({
      [eventKey(start)]: "held",
      [eventKey(close)]: "held",
    })
    expect(done.exchanged).toEqual({ kind: "synced" })
    expect(done.weeks["2026-w47"]).toEqual([homeSpan(true)])
    expect(done.open).toBeNull()
  })

  it("holds the close of a start refused for good, and says what is open", async () => {
    const { send, calls } = scripted([
      answer(409, { error: { code: "conflict" } }),
      week(null, []),
    ])
    const done = await exchangeWorkSpans(send, [start, close], nothing, [
      "2026-w47",
    ])
    expect(calls).toHaveLength(2)
    expect(done.said).toEqual({ [eventKey(start)]: "refused" })
    expect(done.open).toBeNull()
  })

  it("never sends again what home refused or holds", async () => {
    const { send, calls } = scripted([week(null, [])])
    const said: Record<string, EventAtHome> = {
      [eventKey(start)]: "refused",
      [eventKey(close)]: "refused",
    }
    await exchangeWorkSpans(
      send,
      [start, close],
      (key) => said[key] ?? "waiting",
      ["2026-w47"]
    )
    expect(calls).toEqual(["GET /rust-work-spans?week=2026-w47"])
  })

  it("says nothing of what is open while a start still waits", async () => {
    const { send } = scripted([answer(503, {}), week(null, [])])
    const done = await exchangeWorkSpans(send, [start], nothing, ["2026-w47"])
    expect(done.said).toEqual({ [eventKey(start)]: "again" })
    expect(done.open).toBeUndefined()
  })

  it("takes up a span home holds open from another device", async () => {
    const theirs = { ...homeSpan(false), device: "Tablet" }
    const { send } = scripted([week(theirs, [theirs])])
    const done = await exchangeWorkSpans(send, [], nothing, ["2026-w47"])
    expect(done.open).toEqual({ ...span, device: "Tablet" })
  })

  it("says nothing of what is open while a close is still on its way", async () => {
    const { send } = scripted([answer(500, {}), week(homeSpan(false), [])])
    const done = await exchangeWorkSpans(
      send,
      [start, close],
      (key) => (key === eventKey(start) ? "held" : "waiting"),
      ["2026-w47"]
    )
    expect(done.said).toEqual({ [eventKey(close)]: "again" })
    expect(done.open).toBeUndefined()
  })

  it("ends at a 401 as forgotten", async () => {
    const { send } = scripted([answer(401, {})])
    const done = await exchangeWorkSpans(send, [start], nothing, ["2026-w47"])
    expect(done.exchanged).toEqual({ kind: "forgotten" })
    expect(done.open).toBeUndefined()
  })
})
