/**
 * The work tracker's spans go home (RR26, #3250), against a home kept in
 * memory that answers as paulgsc/server#1008 does: each event written once
 * (the same again is 200 unchanged, compared by `at` as text), one span open
 * at a time (a 409 carrying it), and a start before the latest close a 409
 * for good. What home said is remembered under the pairing, and a refusal
 * is never sent again.
 */
import type { HomeAnswer, HomeCall } from "@some-ui/core-utils"
import { inMemoryStorage } from "@some-ui/core-utils"
import type { SpanEvent } from "@some-ui/rust-rounds"
import { workSpans } from "@some-ui/rust-rounds"
import { describe, expect, it } from "vitest"

import {
  homeWeekSpans,
  sendRustSpans,
  spanAtHome,
  spansOpenAtHome,
} from "@/lib/home-link/rust-spans"
import { readSent } from "@/lib/home-link/sent"

const PAIRING = "pairing-1"
const WEEK = "2026-w47"

const start = (id: string, at: string): SpanEvent => ({
  kind: "start",
  id,
  at,
  week: WEEK,
  ticket: "TB-101",
  step: "read",
  exercise: null,
  points: [1, 2],
  device: "Phone",
})
const close = (id: string, at: string, countedSeconds: number): SpanEvent => ({
  kind: "close",
  id,
  at,
  stoppedBy: "you",
  answer: "part",
  countedSeconds,
})

type Rec = Readonly<Record<string, unknown>>
type Kept = { start: Rec; close: Rec | null }

/** A home that keeps spans as paulgsc/server#1008's `work_span` does. */
function memoryHome(): { send: HomeCall; calls: Array<string> } {
  const spans = new Map<string, Kept>()
  const calls: Array<string> = []
  const json = (status: number, body: unknown): HomeAnswer => ({
    status,
    body: JSON.stringify(body),
  })
  const shown = ({ start: s, close: c }: Kept): unknown => ({
    id: s["id"],
    week: s["week"],
    ticket: s["ticket"],
    step: s["step"],
    exercise: s["exercise"],
    points: s["points"],
    device: s["device"],
    startedAt: s["at"],
    keptAt: s["at"],
    closed: c === null ? null : { ...c, id: undefined, keptAt: c["at"] },
  })
  const answer = (method: string, path: string, body: unknown): HomeAnswer => {
    if (method === "GET") {
      const open = [...spans.values()].find((each) => each.close === null)
      return json(200, {
        week: WEEK,
        spans: [...spans.values()].map(shown),
        open: open === undefined ? null : shown(open),
      })
    }
    const event: Rec = JSON.parse(String(body))
    const id = String(event["id"])
    const held = spans.get(id)
    if (path.endsWith("/start")) {
      if (held !== undefined) {
        return held.start["at"] === event["at"]
          ? json(200, { change: "unchanged", span: shown(held) })
          : json(409, { error: { code: "conflict" } })
      }
      const open = [...spans.values()].find((each) => each.close === null)
      if (open !== undefined) {
        return json(409, { error: { code: "conflict" }, open: shown(open) })
      }
      const latest = [...spans.values()]
        .flatMap((each) =>
          each.close === null ? [] : [String(each.close["at"])]
        )
        .sort()
        .at(-1)
      if (latest !== undefined && String(event["at"]) < latest) {
        return json(409, { error: { code: "conflict" } })
      }
      const kept: Kept = { start: event, close: null }
      spans.set(id, kept)
      return json(201, { change: "added", span: shown(kept) })
    }
    if (held === undefined) return json(404, {})
    if (held.close !== null) {
      return held.close["at"] === event["at"]
        ? json(200, { change: "unchanged", span: shown(held) })
        : json(409, { error: { code: "conflict" } })
    }
    held.close = event
    return json(201, { change: "added", span: shown(held) })
  }
  const send: HomeCall = async (method, path, body) => {
    calls.push(`${method} ${path}`)
    return Promise.resolve(answer(method, path, body))
  }
  return { send, calls }
}

describe("the tracker's spans, sent home", () => {
  it("sends a span made offline, start then close, and reads the week back", async () => {
    const storage = inMemoryStorage()
    workSpans(storage).keep(() => [
      start("a", "2026-11-19T09:40:00.000Z"),
      close("a", "2026-11-19T10:40:00.000Z", 1800),
    ])
    const home = memoryHome()
    const done = await sendRustSpans(home.send, storage, PAIRING, WEEK)
    expect(done).toEqual({ kind: "synced" })
    expect(home.calls).toEqual([
      "POST /rust-work-spans/start",
      "POST /rust-work-spans/close",
      `GET /rust-work-spans?week=${WEEK}`,
    ])
    expect(readSent(storage, PAIRING).rustSpans).toEqual({
      "a/start": "held",
      "a/close": "held",
    })
    expect(homeWeekSpans(WEEK)).toHaveLength(1)
    expect(spansOpenAtHome()).toBeNull()

    // Nothing goes twice.
    home.calls.length = 0
    await sendRustSpans(home.send, storage, PAIRING, WEEK)
    expect(home.calls).toEqual([`GET /rust-work-spans?week=${WEEK}`])
  })

  it("keeps a start before the latest close on the phone, refused for good with its close", async () => {
    const storage = inMemoryStorage()
    const home = memoryHome()
    // Another device's span, closed at 10:40.
    await home.send(
      "POST",
      "/rust-work-spans/start",
      JSON.stringify({
        ...start("b", "2026-11-19T09:00:00.000Z"),
        kind: undefined,
      })
    )
    await home.send(
      "POST",
      "/rust-work-spans/close",
      JSON.stringify({
        ...close("b", "2026-11-19T10:40:00.000Z", 60),
        kind: undefined,
      })
    )
    workSpans(storage).keep(() => [
      start("a", "2026-11-19T10:00:00.000Z"),
      close("a", "2026-11-19T10:30:00.000Z", 600),
    ])
    home.calls.length = 0
    await sendRustSpans(home.send, storage, PAIRING, WEEK)
    expect(home.calls).toEqual([
      "POST /rust-work-spans/start",
      `GET /rust-work-spans?week=${WEEK}`,
    ])
    const memory = readSent(storage, PAIRING)
    expect(spanAtHome(memory)("a/start")).toBe("refused")
    expect(spanAtHome(memory)("a/close")).toBe("refused")
    expect(workSpans(storage).list()).toHaveLength(2)

    home.calls.length = 0
    await sendRustSpans(home.send, storage, PAIRING, WEEK)
    expect(home.calls).toEqual([`GET /rust-work-spans?week=${WEEK}`])
  })

  it("says nothing of what is open while this phone's start waits on another span", async () => {
    const storage = inMemoryStorage()
    const home = memoryHome()
    await home.send(
      "POST",
      "/rust-work-spans/start",
      JSON.stringify({
        ...start("b", "2026-11-19T09:00:00.000Z"),
        kind: undefined,
      })
    )
    workSpans(storage).keep(() => [start("a", "2026-11-19T09:10:00.000Z")])
    await sendRustSpans(home.send, storage, PAIRING, WEEK)
    expect(readSent(storage, PAIRING).rustSpans).toEqual({})
    expect(spansOpenAtHome()).toBeUndefined()
  })
})
