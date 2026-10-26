import { noAnswer } from "@/test-support/no-answer"
import { inMemoryStorage } from "@some-ui/core-utils"
import type { HomeAnswer, HomeCall } from "@some-ui/core-utils"
import type { HomeEvent, HomeSession } from "@some-ui/leetype"
import { describe, expect, it } from "vitest"

import { isRecord } from "@/lib/device-backend/common"
import { emptyLogReport, sendLog } from "@/lib/home-link/leetype-log"
import {
  digestOf,
  logToSend,
  readSent,
  rememberSent,
} from "@/lib/home-link/sent"

function session(id: string): HomeSession {
  const at = "2026-10-24T20:00:00.000Z"
  const file = "t1-01-one-node.json"
  const events: Array<HomeEvent> = [
    {
      id: `${id}-1`,
      at,
      session: id,
      type: "started",
      file,
      form: "full",
      declaredMinutes: 10,
    },
    {
      id: `${id}-2`,
      at,
      session: id,
      type: "spoken",
      file,
      screen: "t1",
      answer: { as: "recorded", seconds: 41.5, strong: true },
    },
  ]
  return { session: id, events }
}

type Call = [method: string, path: string, body: string | undefined]

/**
 * A home that answers each PUT with `put` (200 `added` by default) and holds
 * what it took, reading it back with its keys in another order; `back`
 * overrides a read-back's answer.
 */
function home(
  put: Array<HomeAnswer | Error> = [],
  back: Array<HomeAnswer> = []
): { send: HomeCall; calls: Array<Call> } {
  const calls: Array<Call> = []
  const held = new Map<string, Array<Record<string, unknown>>>()
  return {
    calls,
    send: (method, path, sent): Promise<HomeAnswer> => {
      const body = typeof sent === "string" ? sent : undefined
      calls.push([method, path, body])
      const session = decodeURIComponent(path.split("/")[3] ?? "")
      if (method === "GET") {
        const reversed = (held.get(session) ?? []).map((event) =>
          Object.fromEntries(Object.entries(event).reverse())
        )
        return Promise.resolve(
          back.shift() ?? {
            status: 200,
            body: JSON.stringify({ session, events: reversed }),
          }
        )
      }
      const answer = put.shift() ?? {
        status: 200,
        body: '{"change":"added"}',
      }
      if (answer instanceof Error) return Promise.reject(answer)
      const event: unknown = JSON.parse(body ?? "")
      if (answer.status === 200 && isRecord(event)) {
        held.set(session, [...(held.get(session) ?? []), event])
      }
      return Promise.resolve(answer)
    },
  }
}

describe("sendLog", () => {
  it("puts each event as kept, reads the session back, and holds it once it matches", async () => {
    const a = session("a")
    const h = home()
    const report = emptyLogReport()
    const heard: Array<[string, string]> = []
    await sendLog([a], h.send, report, (s, d) => heard.push([s, d]))
    expect(h.calls).toEqual([
      ["PUT", "/leetype/sessions/a/events/a-1", JSON.stringify(a.events[0])],
      ["PUT", "/leetype/sessions/a/events/a-2", JSON.stringify(a.events[1])],
      ["GET", "/leetype/sessions/a/events", undefined],
    ])
    expect(report).toMatchObject({ held: 1, refused: 0, differs: 0 })
    expect(heard).toEqual([["a", digestOf(a)]])
  })

  it("counts a session home refused an event of, reads nothing back, and goes on", async () => {
    const h = home([{ status: 422, body: "" }])
    const report = emptyLogReport()
    const heard: Array<string> = []
    await sendLog([session("a"), session("b")], h.send, report, (s) =>
      heard.push(s)
    )
    expect(h.calls.filter(([method]) => method === "GET")).toEqual([
      ["GET", "/leetype/sessions/b/events", undefined],
    ])
    expect(report).toMatchObject({ held: 1, refused: 1 })
    expect(heard).toEqual(["b"])
  })

  it("holds nothing whose read-back differs from what was sent", async () => {
    const changed = {
      session: "a",
      events: [{ ...session("a").events[0], declaredMinutes: 11 }],
    }
    const h = home([], [{ status: 200, body: JSON.stringify(changed) }])
    const report = emptyLogReport()
    const heard: Array<string> = []
    await sendLog([session("a")], h.send, report, (s) => heard.push(s))
    expect(report).toMatchObject({ held: 0, differs: 1 })
    expect(heard).toEqual([])
  })

  it("ends at a 401, a 429 or no answer, and retries nothing", async () => {
    for (const [answer, ended] of [
      [{ status: 401, body: "" }, { forgotten: true }],
      [{ status: 429, body: "" }, { unreachable: true }],
      [noAnswer(), { unreachable: true }],
    ] as const) {
      const h = home([answer])
      const report = emptyLogReport()
      await sendLog([session("a"), session("b")], h.send, report)
      expect(h.calls).toHaveLength(1)
      expect(report).toMatchObject({ held: 0, ...ended })
    }
  })
})

describe("logToSend", () => {
  it("leaves out a session home read back as it is now", () => {
    const store = inMemoryStorage()
    const [a, b] = [session("a"), session("b")]
    rememberSent(store, readSent(store, "p1"), {
      leetype: { a: digestOf(a) },
    })
    expect(logToSend([a, b], readSent(store, "p1"))).toEqual([b])
    const grown = { ...a, events: [...a.events, { ...a.events[0], id: "a-3" }] }
    expect(logToSend([grown], readSent(store, "p1"))).toEqual([grown])
  })
})
