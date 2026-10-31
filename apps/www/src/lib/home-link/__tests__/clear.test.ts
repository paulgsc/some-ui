/**
 * Settings' clear of finished sessions home holds (`../clear`, LA8): it
 * reads back each finished session, sends nothing, lets go of those home
 * holds exactly as the phone does, and says how it ended in a line that
 * names no machinery. Which sessions may leave, and that home must hold one
 * as it is, is `sessions.test.ts`'s.
 */
import { noAnswer } from "@/test-support/no-answer"
import { sessionRecord } from "@/test-support/session-record"
import type { HomeAnswer, HomeCall } from "@some-ui/core-utils"
import { describe, expect, it, vi } from "vitest"

import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import type { ClearEnd, ClearPorts } from "@/lib/home-link/clear"
import { clearHeld, finishedOnPhone } from "@/lib/home-link/clear"
import type * as Sessions from "@/lib/home-link/sessions"
import { CLEAR } from "@/lib/home-link/words"
import type { SessionRecord } from "@/lib/tenant/types"

import { MACHINERY } from "./machinery"

// The read-back itself is `sessions.test.ts`'s, against a real home: here a
// session is held when home answers its read 200, and the read's end is
// what the clear is told.
vi.mock("@/lib/home-link/sessions", async (importOriginal) => {
  const real = await importOriginal<typeof Sessions>()
  const readHeld: typeof Sessions.readHeld = async (send, leaving, held) => {
    let busy = false
    try {
      for (const session of leaving) {
        const answer = await send("GET", `/sessions/${session.id}`)
        if (answer.status === 401) throw new real.HomeForgotPhoneError()
        if (answer.status === 429) busy = true
        ;(answer.status === 200 ? held.held : held.notThere).push(session.id)
      }
    } catch (error) {
      return { ended: error, busy }
    }
    return { ended: busy ? new Error("busy") : null, busy }
  }
  return { ...real, readHeld }
})

const NOW = new Date("2026-10-29T12:00:00.000Z")

const finished = (id: string): SessionRecord =>
  sessionRecord({
    id,
    status: "completed",
    updatedAt: "2026-10-14T09:00:00.000Z",
    startedAt: "2026-10-14T09:00:00.000Z",
    completedAt: "2026-10-14T09:10:00.000Z",
  })

function ports(
  send: HomeCall,
  over: Partial<ClearPorts> = {}
): ClearPorts & { gone: Array<string> } {
  const gone: Array<string> = []
  return {
    gone,
    sessions: () => Promise.resolve([finished("a"), finished("b")]),
    run: async (r) => ({ kind: "done", value: await r(send) }),
    letGo: (sessions): Promise<number> => {
      gone.push(...sessions.map((s) => s.id))
      return Promise.resolve(sessions.length)
    },
    ...over,
  }
}

/** A home that answers every read with no copy: nothing is held. */
const empty: HomeCall = (method) => {
  expect(method).toBe("GET")
  return Promise.resolve({ status: 404, body: "" })
}

describe("clearHeld", () => {
  it("counts the finished sessions, and says so when there are none", async () => {
    expect(await finishedOnPhone(NOW, ports(empty))).toBe(2)
    const none = ports(empty, { sessions: () => Promise.resolve([]) })
    expect(await finishedOnPhone(NOW, none)).toBe(0)
    expect(await clearHeld(() => undefined, NOW, none)).toEqual({
      kind: "nothing",
    })
  })

  it("lets go of what home holds, and nothing it does not", async () => {
    const holding = ports(() =>
      Promise.resolve({ status: 200, body: JSON.stringify(finished("a")) })
    )
    expect(await clearHeld(() => undefined, NOW, holding)).toEqual({
      kind: "cleared",
      freed: 2,
      kept: 0,
    })
    expect(holding.gone).toEqual(["a", "b"])
  })

  it("lets go of nothing home does not hold, and sends nothing", async () => {
    const calls: Array<string> = []
    const p = ports((method, path) => {
      calls.push(`${method} ${path}`)
      return empty(method, path)
    })
    expect(await clearHeld(() => undefined, NOW, p)).toEqual({
      kind: "cleared",
      freed: 0,
      kept: 2,
    })
    expect(p.gone).toEqual([])
    expect(calls.every((call) => call.startsWith("GET "))).toBe(true)
  })

  it("says why it could not ask home, and lets nothing go", async () => {
    const answering =
      (answer: () => Promise<HomeAnswer>): HomeCall =>
      () =>
        answer()
    const ends: Array<[HomeCall, ClearEnd]> = [
      [answering(() => Promise.reject(noAnswer())), { kind: "unreachable" }],
      [
        answering(() => Promise.resolve({ status: 401, body: "" })),
        { kind: "forgotten" },
      ],
      [
        answering(() => Promise.resolve({ status: 429, body: "" })),
        { kind: "busy" },
      ],
      [
        answering(() => Promise.reject(new SyncStoppedError())),
        { kind: "stopped" },
      ],
    ]
    for (const [send, end] of ends) {
      const p = ports(send)
      expect(await clearHeld(() => undefined, NOW, p)).toEqual(end)
      expect(p.gone).toEqual([])
    }
    const turnedAway = ports(empty, { run: () => Promise.resolve(null) })
    expect(await clearHeld(() => undefined, NOW, turnedAway)).toEqual({
      kind: "busy",
    })
  })

  it("says when this phone could not clear what home holds", async () => {
    const p = ports(empty, {
      letGo: () => Promise.reject(new Error("locked")),
    })
    expect(await clearHeld(() => undefined, NOW, p)).toMatchObject({
      kind: "not-cleared",
    })
  })

  it("says each end in the person's terms", () => {
    const ends: Array<ClearEnd> = [
      { kind: "cleared", freed: 2, kept: 0 },
      { kind: "cleared", freed: 1, kept: 1 },
      { kind: "cleared", freed: 0, kept: 2 },
      { kind: "nothing" },
      { kind: "unreachable" },
      { kind: "forgotten" },
      { kind: "busy" },
      { kind: "stopped" },
      { kind: "not-cleared", error: new Error("locked") },
    ]
    const lines = ends.map((end) => CLEAR.ended(end, "home.example"))
    expect(new Set(lines).size).toBe(lines.length)
    expect(lines[1]).toBe(
      "Cleared 1 finished session from this phone. 1 stays here: home.example doesn't hold it as it is yet."
    )
    expect(lines[2]).toBe(
      "Nothing left this phone. 2 stay here: home.example doesn't hold them as they are yet."
    )
    expect(
      [...lines, CLEAR.question(3, "home.example"), CLEAR.button].filter(
        (line) => MACHINERY.test(line)
      )
    ).toEqual([])
  })
})
