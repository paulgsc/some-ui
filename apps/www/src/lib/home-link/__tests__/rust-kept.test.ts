/**
 * What Rust Rounds keeps goes home (RR14, #2689), against a home kept in
 * memory that answers as paulgsc/server#763 does, with RR22's revisions
 * (#2832): each send of a week is kept by its `at` and a paste once (201,
 * then 200 for the same body), and a different body under the same one is
 * a 409; a sitting answers with its revision and reads back as sent.
 */
import type { HomeAnswer, HomeCall } from "@some-ui/core-utils"
import { canonicalJson, inMemoryStorage } from "@some-ui/core-utils"
import type { KeptItem } from "@some-ui/rust-rounds"
import { describe, expect, it } from "vitest"

import { keptCounts, sendRustKept } from "@/lib/home-link/rust-kept"
import { readSent } from "@/lib/home-link/sent"

const WEEK: KeptItem = {
  kind: "rustWeeks",
  id: "2026-w46/2026-11-12T20:00:00.000Z",
  path: "/rust-weeks/2026-w46/sent",
  wire: {
    week: "2026-w46",
    at: "2026-11-12T20:00:00.000Z",
    answers: [
      { ticket: "QM-312", take: "t", recordedAt: "2026-11-12T19:58:00.000Z" },
    ],
    passed: ["QM-311", "QM-313"],
  },
}

const PASTE: KeptItem = {
  kind: "rustPastes",
  id: "2026-11-11T08:00:00.000Z",
  path: "/rust-weeks/2026-w46/pastes/2026-11-11T08%3A00%3A00.000Z",
  wire: { at: "2026-11-11T08:00:00.000Z", text: "error[E0499]", note: null },
}

const sitting = (pins: number): KeptItem => ({
  kind: "roundLog",
  id: "sitting-1",
  path: "/rust-round-log/sessions/sitting-1",
  wire: {
    schema: "some-ui.rust-round-log/1",
    id: "sitting-1",
    startedAt: "2026-11-01T10:00:00.000Z",
    cards: [],
    pinned: Array.from({ length: pins }, (_, i) => ({
      round: "indexing-01",
      card: `c${String(i)}`,
    })),
    fromMyDesk: [],
    tutorGuessedWrong: [],
  },
})

type Home = {
  readonly send: HomeCall
  readonly calls: Array<string>
  readonly kept: Map<string, string>
  /** An answer in place of home's own, while it returns one. */
  answer: ((method: string, path: string) => HomeAnswer | null) | null
}

function home(): Home {
  const kept = new Map<string, string>()
  const calls: Array<string> = []
  const own = (method: string, path: string, body: string): HomeAnswer => {
    const held = kept.get(path)
    if (method === "GET") {
      return held === undefined
        ? { status: 404, body: "{}" }
        : { status: 200, body: held }
    }
    if (path.startsWith("/rust-round-log/")) {
      kept.set(path, body)
      return { status: held === undefined ? 201 : 200, body: "{}" }
    }
    // A week's sends are kept one per `at` (RR22).
    const sent = path.endsWith("/sent")
    const key = sent ? `${path}@${String(JSON.parse(body).at)}` : path
    const same = kept.get(key)
    if (same !== undefined && same !== body) return { status: 409, body: "{}" }
    kept.set(key, body)
    return {
      status: same === undefined ? 201 : 200,
      body: JSON.stringify({
        change: "added",
        [sent ? "sent" : "paste"]: JSON.parse(body),
      }),
    }
  }
  const made: Home = {
    calls,
    kept,
    answer: null,
    send: (method, path, body) => {
      calls.push(`${method} ${path}`)
      return Promise.resolve(
        made.answer?.(method, path) ??
          own(method, path, typeof body === "string" ? body : "")
      )
    },
  }
  return made
}

/** WEEK sent again, a ticket more said (RR22). */
const AGAIN: KeptItem = {
  ...WEEK,
  id: "2026-w46/2026-11-13T20:00:00.000Z",
  wire: {
    week: "2026-w46",
    at: "2026-11-13T20:00:00.000Z",
    answers: [
      { ticket: "QM-311", take: "u", recordedAt: "2026-11-13T19:00:00.000Z" },
      { ticket: "QM-312", take: "t", recordedAt: "2026-11-12T19:58:00.000Z" },
    ],
    passed: ["QM-313"],
  },
}

describe("sendRustKept", () => {
  it("sends each send of a week on its own, and counts each once home carries it (RR22)", async () => {
    const storage = inMemoryStorage()
    const at = home()
    await sendRustKept(at.send, [WEEK], storage, "p1")
    at.calls.length = 0
    await sendRustKept(at.send, [WEEK, AGAIN], storage, "p1")
    expect(at.calls).toEqual([`PUT ${AGAIN.path}`])
    expect(keptCounts([WEEK, AGAIN], readSent(storage, "p1"))).toMatchObject({
      rustWeeks: 2,
      waiting: 0,
    })
  })

  it("sends a send home held under the week alone once more, which home takes as it is", async () => {
    const storage = inMemoryStorage()
    const at = home()
    // The phone before RR22 remembered a week's one send under the week.
    await sendRustKept(at.send, [{ ...WEEK, id: "2026-w46" }], storage, "p1")
    at.calls.length = 0
    expect(await sendRustKept(at.send, [WEEK], storage, "p1")).toEqual({
      kind: "synced",
    })
    expect(at.calls).toEqual([`PUT ${WEEK.path}`])
    expect(keptCounts([WEEK], readSent(storage, "p1")).rustWeeks).toBe(1)
  })

  it("sends each item once, counting it home's only once home carries it", async () => {
    const storage = inMemoryStorage()
    const at = home()
    const going = [WEEK, PASTE, sitting(1)]
    expect(keptCounts(going, readSent(storage, "p1")).waiting).toBe(3)

    expect(await sendRustKept(at.send, going, storage, "p1")).toEqual({
      kind: "synced",
    })
    expect(at.calls).toEqual([
      `PUT ${WEEK.path}`,
      `PUT ${PASTE.path}`,
      `PUT ${sitting(1).path}`,
      `GET ${sitting(1).path}`,
    ])
    expect(at.kept.get(`${WEEK.path}@2026-11-12T20:00:00.000Z`)).toBe(
      canonicalJson(WEEK.wire)
    )
    expect(keptCounts(going, readSent(storage, "p1"))).toEqual({
      rustWeeks: 1,
      rustPastes: 1,
      roundLog: 1,
      waiting: 0,
    })

    at.calls.length = 0
    await sendRustKept(at.send, going, storage, "p1")
    expect(at.calls).toEqual([])
  })

  it("sends a sitting again once it grew, and everything again to another home", async () => {
    const storage = inMemoryStorage()
    const at = home()
    await sendRustKept(at.send, [WEEK, sitting(1)], storage, "p1")
    at.calls.length = 0
    await sendRustKept(at.send, [WEEK, sitting(2)], storage, "p1")
    expect(at.calls).toEqual([
      `PUT ${sitting(2).path}`,
      `GET ${sitting(2).path}`,
    ])

    const other = home()
    await sendRustKept(other.send, [WEEK, sitting(2)], storage, "p2")
    expect(other.calls.filter((call) => call.startsWith("PUT"))).toHaveLength(2)
  })

  it("offers a refused item again with the next run, and counts nothing home's it didn't read back", async () => {
    const storage = inMemoryStorage()
    const at = home()
    at.answer = (method, path): HomeAnswer | null =>
      method === "PUT" && path === WEEK.path
        ? { status: 422, body: "{}" }
        : method === "GET"
          ? { status: 200, body: "{}" }
          : null
    expect(
      await sendRustKept(at.send, [WEEK, sitting(1)], storage, "p1")
    ).toEqual({ kind: "failed", why: "refused" })
    expect(keptCounts([WEEK, sitting(1)], readSent(storage, "p1"))).toEqual({
      rustWeeks: 0,
      rustPastes: 0,
      roundLog: 0,
      waiting: 2,
    })

    at.answer = null
    at.calls.length = 0
    await sendRustKept(at.send, [WEEK, sitting(1)], storage, "p1")
    expect(at.calls[0]).toBe(`PUT ${WEEK.path}`)
    expect(keptCounts([WEEK], readSent(storage, "p1")).rustWeeks).toBe(1)
  })

  it("stops at a sitting's read-back home no longer answers for this phone", async () => {
    const at = home()
    const other: KeptItem = {
      ...sitting(1),
      id: "sitting-2",
      path: "/rust-round-log/sessions/sitting-2",
    }
    at.answer = (method): HomeAnswer | null =>
      method === "GET" ? { status: 401, body: "{}" } : null
    expect(
      await sendRustKept(at.send, [sitting(1), other], inMemoryStorage(), "p1")
    ).toEqual({ kind: "forgotten" })
    expect(at.calls).toEqual([
      `PUT ${sitting(1).path}`,
      `GET ${sitting(1).path}`,
    ])
  })

  it("says when home no longer knows the phone", async () => {
    const at = home()
    at.answer = (): HomeAnswer => ({ status: 401, body: "{}" })
    expect(
      await sendRustKept(at.send, [WEEK], inMemoryStorage(), "p1")
    ).toEqual({ kind: "forgotten" })
  })
})
