/**
 * What Rust Rounds keeps goes home (RR14, #2689), against a home kept in
 * memory that answers as paulgsc/server's RR14 routes do: a week sent and a
 * paste are kept once and a different body is refused; a log session is
 * kept, and kept again as a new revision when it only grew.
 */
import { LOG_SCHEMA } from "@rust-rounds/lib/formats"
import {
  exchangeKeptHome,
  keptHomeCounts,
  keptOnHome,
} from "@rust-rounds/lib/kept-home"
import { keptRounds } from "@rust-rounds/lib/play/store"
import type { WeekSent } from "@rust-rounds/lib/week-play/spec"
import { pasteStores, weeksSent } from "@rust-rounds/lib/week-play/store"
import type { HomeAnswer, HomeCall, KeyedStorage } from "@some-ui/core-utils"
import { canonicalJson, inMemoryStorage } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

const SENT: WeekSent = {
  week: "2026-w46",
  at: "2026-11-12T20:00:00.000Z",
  answers: [
    {
      ticket: "QM-312",
      take: "take-312",
      recordedAt: "2026-11-12T19:58:00.000Z",
    },
  ],
  passed: ["QM-311", "QM-313"],
}

const PASTE = {
  week: "2026-w46",
  at: "2026-11-11T08:00:00.000Z",
  text: "error[E0499]: cannot borrow `buf` as mutable more than once",
  note: "note-1",
}

type Home = {
  readonly send: HomeCall
  readonly calls: Array<string>
  readonly kept: Map<string, string>
  /** An answer in place of home's own, while it returns one. */
  answer: ((method: string, path: string) => HomeAnswer | null) | null
}

const keyOf = (path: string): string => decodeURIComponent(path)

/** Home, in memory, by path: weeks it holds are `2026-w46` only. */
function home(): Home {
  const kept = new Map<string, string>()
  const calls: Array<string> = []
  const answers = (method: string, path: string, body: string): HomeAnswer => {
    const key = keyOf(path)
    if (
      key.startsWith("/rust-weeks/") &&
      !key.startsWith("/rust-weeks/2026-w46/")
    )
      return { status: 404, body: "{}" }
    if (method === "GET") {
      const held = kept.get(key)
      return held === undefined
        ? { status: 404, body: "{}" }
        : { status: 200, body: held }
    }
    const held = kept.get(key)
    if (key.startsWith("/rust-round-log/")) {
      const grows =
        held !== undefined &&
        held !== body &&
        body.startsWith(held.slice(0, held.indexOf('"cards":[') + 9))
      if (held !== undefined && held !== body && !grows)
        return { status: 409, body: "{}" }
      kept.set(key, body)
      return { status: held === body ? 200 : 201, body: "{}" }
    }
    if (held !== undefined && held !== body) return { status: 409, body: "{}" }
    kept.set(key, body)
    const as = key.endsWith("/sent") ? "sent" : "paste"
    return {
      status: held === undefined ? 201 : 200,
      body: JSON.stringify({ change: "added", [as]: JSON.parse(body) }),
    }
  }
  const made: Home = {
    calls,
    kept,
    answer: null,
    send: (method, path, body) => {
      calls.push(`${method} ${keyOf(path)}`)
      return Promise.resolve(
        made.answer?.(method, path) ??
          answers(method, path, typeof body === "string" ? body : "")
      )
    },
  }
  return made
}

/** A phone that sent `SENT`, kept `PASTE`, and pinned a card in one sitting. */
function phone(): KeyedStorage {
  const storage = inMemoryStorage()
  weeksSent(storage).keep((kept) => [...kept, SENT])
  pasteStores(storage).pastes.add(PASTE)
  keptRounds(storage).append(
    { id: "sitting-1", startedAt: "2026-11-01T10:00:00.000Z" },
    { kind: "pin", ref: { round: "indexing-01", card: "a" } }
  )
  return storage
}

describe("exchangeKeptHome", () => {
  it("sends each week sent, paste and sitting once, and counts them home's once home carries them", async () => {
    const storage = phone()
    const at = home()

    expect(keptHomeCounts(storage).sent).toEqual({
      onHome: 0,
      refused: 0,
      waiting: 1,
    })
    expect(await exchangeKeptHome(storage, at.send)).toEqual({ kind: "synced" })
    expect(at.calls).toEqual([
      "PUT /rust-weeks/2026-w46/sent",
      `PUT /rust-weeks/2026-w46/pastes/${PASTE.at}`,
      "PUT /rust-round-log/sessions/sitting-1",
      "GET /rust-round-log/sessions/sitting-1",
    ])
    expect(at.kept.get("/rust-weeks/2026-w46/sent")).toBe(canonicalJson(SENT))
    expect(
      JSON.parse(at.kept.get("/rust-round-log/sessions/sitting-1") ?? "")
    ).toMatchObject({ schema: LOG_SCHEMA, id: "sitting-1" })
    const counts = keptHomeCounts(storage)
    expect([counts.sent, counts.pastes, counts.sessions]).toEqual([
      { onHome: 1, refused: 0, waiting: 0 },
      { onHome: 1, refused: 0, waiting: 0 },
      { onHome: 1, refused: 0, waiting: 0 },
    ])

    // Nothing changed: nothing goes.
    at.calls.length = 0
    await exchangeKeptHome(storage, at.send)
    expect(at.calls).toEqual([])
  })

  it("sends a sitting again once the cards add to it", async () => {
    const storage = phone()
    const at = home()
    await exchangeKeptHome(storage, at.send)
    keptRounds(storage).append(
      { id: "sitting-1", startedAt: "2026-11-01T10:00:00.000Z" },
      { kind: "pin", ref: { round: "indexing-01", card: "b" } }
    )
    at.calls.length = 0
    await exchangeKeptHome(storage, at.send)
    expect(at.calls).toEqual([
      "PUT /rust-round-log/sessions/sitting-1",
      "GET /rust-round-log/sessions/sitting-1",
    ])
    expect(keptHomeCounts(storage).sessions.onHome).toBe(1)
  })

  it("keeps what home refuses on the phone and doesn't send it again", async () => {
    const storage = phone()
    const at = home()
    at.kept.set("/rust-weeks/2026-w46/sent", "{}")
    await exchangeKeptHome(storage, at.send)
    expect(keptHomeCounts(storage).sent).toEqual({
      onHome: 0,
      refused: 1,
      waiting: 0,
    })
    expect(weeksSent(storage).list()).toEqual([SENT])
    at.calls.length = 0
    await exchangeKeptHome(storage, at.send)
    expect(at.calls).toEqual([])
  })

  it("leaves a week home doesn't hold waiting, and counts nothing home's that it didn't read back", async () => {
    const storage = phone()
    weeksSent(storage).keep((kept) => [...kept, { ...SENT, week: "2026-w47" }])
    const at = home()
    at.answer = (method, path): HomeAnswer | null =>
      method === "GET" && path.startsWith("/rust-round-log/")
        ? { status: 200, body: "{}" }
        : null
    await exchangeKeptHome(storage, at.send)
    const counts = keptHomeCounts(storage)
    expect(counts.sent).toEqual({ onHome: 1, refused: 0, waiting: 1 })
    expect(counts.sessions).toEqual({ onHome: 0, refused: 0, waiting: 1 })
  })

  it("stops when home no longer knows the phone, and says an answer it can't use", async () => {
    const storage = phone()
    const at = home()
    at.answer = (): HomeAnswer => ({ status: 401, body: "{}" })
    expect(await exchangeKeptHome(storage, at.send)).toEqual({
      kind: "forgotten",
    })
    at.answer = (method): HomeAnswer | null =>
      method === "PUT" ? { status: 503, body: "" } : null
    expect(await exchangeKeptHome(storage, at.send)).toEqual({
      kind: "failed",
      why: "what Rust Rounds keeps: home answered 503",
    })
    expect(keptOnHome(storage).sent).toEqual({})
  })
})
