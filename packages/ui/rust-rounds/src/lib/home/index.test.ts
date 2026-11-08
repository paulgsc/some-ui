/**
 * The exchange with home (RR4b, #2347), against a home kept in memory that
 * answers as paulgsc/server's `handlers/rust_rounds.rs` does: a pasted round
 * goes home once, home's rounds and the runs it recorded come back and are
 * only added to what plays, and nothing the session wrote meanwhile is lost.
 */
import type { Round, RustcRun } from "@rust-rounds/lib/formats"
import { resolvePrograms } from "@rust-rounds/lib/formats"
import type { RoundFromHome } from "@rust-rounds/lib/home"
import {
  exchangeRounds,
  READS_PER_EXCHANGE,
  roundsCounts,
  roundsTaken,
  roundsToSend,
} from "@rust-rounds/lib/home"
import {
  noRunWillCome,
  NOTHING_HELD,
  playable,
  runOf,
  whyNoRun,
} from "@rust-rounds/lib/play/held"
import { keptRounds } from "@rust-rounds/lib/play/store"
import { INDEXING_01, INDEXING_01_RUNS } from "@rust-rounds/lib/worked-example"
import type { HomeAnswer, HomeCall } from "@some-ui/core-utils"
import { inMemoryStorage, isRecord } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

const PASTED: Round = { ...INDEXING_01, id: "indexing-02" }

const PRINTS: RustcRun = {
  outcome: "prints",
  toolchain: "rustc 1.97.0",
  compileStderr: "",
  stdout: "ok\n",
}

/** What home keeps of a program it refused or lost: a `stopped` run that printed nothing. */
const STOPPED: RustcRun = {
  outcome: "stopped",
  toolchain: "rustc 1.97.0",
  compileStderr: "",
  why: "exit",
  stdout: "",
  stderr: "",
}

type Run = {
  ended: "recorded" | "refused" | "runner-lost"
  rustc: RustcRun | Record<string, never>
}

type Forced = (method: string, path: string) => HomeAnswer | null

type Home = {
  readonly send: HomeCall
  readonly calls: Array<string>
  readonly rounds: Map<string, unknown>
  readonly runs: Map<string, Array<Run>>
  /** An answer to give in place of home's own, while it returns one. */
  answer: Forced | null
}

/** Home, in memory: rounds by id, newest last, and runs by `<round>/<card>`. */
function home(): Home {
  const rounds = new Map<string, unknown>()
  const runs = new Map<string, Array<Run>>()
  const calls: Array<string> = []
  const answers = (method: string, path: string, body: unknown): HomeAnswer => {
    const id = decodeURIComponent(path.split("/")[2] ?? "")
    if (method === "PUT") {
      const text = typeof body === "string" ? body : ""
      const held = rounds.get(id)
      if (held === undefined) {
        rounds.set(id, JSON.parse(text))
        return { status: 201, body: "{}" }
      }
      return JSON.stringify(held) === text
        ? { status: 200, body: "{}" }
        : { status: 409, body: "{}" }
    }
    if (path === "/rust-rounds") {
      const listed = [...rounds.keys()].reverse().map((each) => ({
        id: each,
        contentHash: "0".repeat(64),
        receivedAt: "2026-11-02T10:00:00.000Z",
      }))
      return { status: 200, body: JSON.stringify({ rounds: listed }) }
    }
    const round = rounds.get(id)
    if (round === undefined) return { status: 404, body: "{}" }
    const cards =
      isRecord(round) && Array.isArray(round.cards)
        ? round.cards.filter(isRecord)
        : []
    const served: RoundFromHome = {
      id,
      round,
      programs: cards
        .filter((card) => card.kind !== "refine")
        .map((card) => ({
          card: String(card.id),
          runs: runs.get(`${id}/${String(card.id)}`) ?? [],
        })),
    }
    return { status: 200, body: JSON.stringify(served) }
  }
  const made: Home = {
    calls,
    rounds,
    runs,
    answer: null,
    send: (method, path, body) => {
      calls.push(`${method} ${path}`)
      return Promise.resolve(
        made.answer?.(method, path) ?? answers(method, path, body)
      )
    },
  }
  return made
}

/** A phone holding `rounds`, pasted, and nothing else. */
function phone(
  rounds: ReadonlyArray<Round> = []
): ReturnType<typeof keptRounds> {
  const store = keptRounds(inMemoryStorage())
  store.hold({ ...NOTHING_HELD, rounds })
  return store
}

describe("exchangeRounds", () => {
  it("sends a pasted round home once, and fills its cards' runs once home has recorded them", async () => {
    const store = phone([PASTED])
    const at = home()

    expect(await exchangeRounds(store, at.send)).toEqual({ kind: "synced" })
    expect(at.calls).toEqual([
      "PUT /rust-rounds/indexing-02",
      "GET /rust-rounds",
      "GET /rust-rounds/indexing-02",
    ])
    expect(at.rounds.get(PASTED.id)).toEqual(PASTED)
    expect(roundsCounts(store.held())).toEqual({
      onHome: 1,
      refused: 0,
      waiting: 0,
    })
    expect(runOf(store.held(), { round: PASTED.id, card: "a" })).toBeNull()

    // Home records every program; the next exchange sends nothing and fills them.
    for (const card of resolvePrograms(PASTED).keys()) {
      at.runs.set(`${PASTED.id}/${card}`, [
        { ended: "recorded", rustc: PRINTS },
      ])
    }
    at.calls.length = 0
    await exchangeRounds(store, at.send)
    expect(at.calls).toEqual([
      "GET /rust-rounds",
      "GET /rust-rounds/indexing-02",
    ])
    for (const card of resolvePrograms(PASTED).keys()) {
      expect(runOf(store.held(), { round: PASTED.id, card })).toEqual(PRINTS)
    }

    // Every card has its run: the round is not read again.
    at.calls.length = 0
    await exchangeRounds(store, at.send)
    expect(at.calls).toEqual(["GET /rust-rounds"])
  })

  it("takes a round home holds that the phone lacks, and only the runs home recorded", async () => {
    const store = phone()
    const at = home()
    at.rounds.set(PASTED.id, PASTED)
    at.runs.set(`${PASTED.id}/a`, [
      { ended: "runner-lost", rustc: STOPPED },
      { ended: "recorded", rustc: PRINTS },
    ])
    at.runs.set(`${PASTED.id}/b`, [{ ended: "refused", rustc: STOPPED }])

    await exchangeRounds(store, at.send)
    const held = store.held()
    expect(playable(held).map((round) => round.id)).toEqual([
      INDEXING_01.id,
      PASTED.id,
    ])
    expect(held.home.fetched).toEqual([PASTED.id])
    expect(roundsTaken(held)).toBe(0)
    expect(runOf(held, { round: PASTED.id, card: "a" })).toEqual(PRINTS)
    expect(runOf(held, { round: PASTED.id, card: "b" })).toBeNull()
    // Home refused b's program for good: it waits for no run.
    expect(noRunWillCome(held, { round: PASTED.id, card: "b" })).toBe(true)
    expect(noRunWillCome(held, { round: PASTED.id, card: "c" })).toBe(false)
  })

  it("stops waiting on a card whose only recording the phone can't read", async () => {
    const store = phone([PASTED])
    const at = home()
    const programs = [...resolvePrograms(PASTED).keys()]
    for (const card of programs) {
      at.runs.set(`${PASTED.id}/${card}`, [{ ended: "recorded", rustc: {} }])
    }
    await exchangeRounds(store, at.send)
    for (const card of programs) {
      expect(noRunWillCome(store.held(), { round: PASTED.id, card })).toBe(true)
    }
    at.calls.length = 0
    await exchangeRounds(store, at.send)
    expect(at.calls).toEqual(["GET /rust-rounds"])
  })

  it("keeps a card's first run, and the worked example's bundled runs stand", async () => {
    const store = phone()
    const at = home()
    at.rounds.set(PASTED.id, PASTED)
    at.runs.set(`${PASTED.id}/a`, [{ ended: "recorded", rustc: PRINTS }])
    at.rounds.set(INDEXING_01.id, INDEXING_01)
    await exchangeRounds(store, at.send)

    at.runs.set(`${PASTED.id}/a`, [
      { ended: "recorded", rustc: { ...PRINTS, stdout: "later\n" } },
    ])
    at.calls.length = 0
    await exchangeRounds(store, at.send)
    expect(runOf(store.held(), { round: PASTED.id, card: "a" })).toEqual(PRINTS)
    // The worked example has a run of every card on the phone: never read.
    expect(at.calls).not.toContain("GET /rust-rounds/indexing-01")
    expect(runOf(store.held(), { round: INDEXING_01.id, card: "a" })).toEqual(
      INDEXING_01_RUNS.a
    )
  })

  it("leaves a round home holds under an id the phone holds other cards under, and sends it no more", async () => {
    const store = phone([PASTED])
    const at = home()
    const other = { ...PASTED, by: "claude-routine" }
    at.rounds.set(PASTED.id, other)
    at.runs.set(`${PASTED.id}/a`, [{ ended: "recorded", rustc: PRINTS }])

    expect(await exchangeRounds(store, at.send)).toEqual({ kind: "synced" })
    const held = store.held()
    expect(held.home.refused).toEqual([{ id: PASTED.id, why: "other-round" }])
    expect(held.rounds).toEqual([PASTED])
    expect(runOf(held, { round: PASTED.id, card: "a" })).toBeNull()

    at.calls.length = 0
    await exchangeRounds(store, at.send)
    expect(at.calls).toEqual(["GET /rust-rounds"])
  })

  it("keeps a round home refused on the phone, playing, and counts it", async () => {
    const store = phone([PASTED])
    const at = home()
    at.answer = (method): HomeAnswer | null =>
      method === "PUT" ? { status: 422, body: "{}" } : null

    await exchangeRounds(store, at.send)
    expect(store.held().rounds).toEqual([PASTED])
    expect(roundsCounts(store.held())).toEqual({
      onHome: 0,
      refused: 1,
      waiting: 0,
    })
    // No run of it will come, and its cards say so.
    expect(whyNoRun(store.held(), { round: PASTED.id, card: "a" }, true)).toBe(
      "refused"
    )
  })

  it("ends as forgotten on a 401, and as failed on an answer it did not expect", async () => {
    const at = home()
    at.answer = (): HomeAnswer => ({ status: 401, body: "" })
    expect(await exchangeRounds(phone([PASTED]), at.send)).toEqual({
      kind: "forgotten",
    })
    at.answer = (method): HomeAnswer | null =>
      method === "GET" ? { status: 500, body: "" } : null
    const store = phone([PASTED])
    expect(await exchangeRounds(store, at.send)).toMatchObject({
      kind: "failed",
    })
    // What landed before the failure is kept.
    expect(store.held().home.sent).toEqual([PASTED.id])
  })

  it("skips a round home fails to answer for, reads the rest, and reports the failure", async () => {
    const store = phone()
    const at = home()
    at.rounds.set("indexing-10", { ...PASTED, id: "indexing-10" })
    at.rounds.set("indexing-11", { ...PASTED, id: "indexing-11" })
    at.answer = (_method, path): HomeAnswer | null =>
      path === "/rust-rounds/indexing-11" ? { status: 500, body: "" } : null

    expect(await exchangeRounds(store, at.send)).toMatchObject({
      kind: "failed",
    })
    expect(store.held().home.fetched).toEqual(["indexing-10"])
  })

  it("stops reading once home says it is busy, sending nothing after it (AD3)", async () => {
    const store = phone()
    const at = home()
    for (const n of [10, 11, 12]) {
      at.rounds.set(`indexing-${n}`, { ...PASTED, id: `indexing-${n}` })
    }
    // Listed newest first: 12, then 11, then 10.
    at.answer = (_method, path): HomeAnswer | null =>
      path === "/rust-rounds/indexing-11" ? { status: 429, body: "" } : null

    expect(await exchangeRounds(store, at.send)).toMatchObject({
      kind: "failed",
    })
    expect(
      at.calls.filter((call) => call.startsWith("GET /rust-rounds/"))
    ).toEqual(["GET /rust-rounds/indexing-12", "GET /rust-rounds/indexing-11"])
    // What landed before home said busy is kept.
    expect(store.held().home.fetched).toEqual(["indexing-12"])
  })

  it("reads an older round once home records it, behind READS_PER_EXCHANGE newer rounds home will never run", async () => {
    const store = phone()
    const at = home()
    const programs = [...resolvePrograms(PASTED).keys()]
    at.rounds.set("old-01", { ...PASTED, id: "old-01" })
    await exchangeRounds(store, at.send)
    expect(store.held().home.fetched).toEqual(["old-01"])

    // Newer rounds, every program refused or lost for good.
    for (let n = 0; n < READS_PER_EXCHANGE; n += 1) {
      const id = `blocked-${String(n + 10)}`
      at.rounds.set(id, { ...PASTED, id })
      for (const [index, card] of programs.entries()) {
        at.runs.set(`${id}/${card}`, [
          {
            ended: index % 2 === 0 ? "refused" : "runner-lost",
            rustc: STOPPED,
          },
        ])
      }
    }
    await exchangeRounds(store, at.send)
    expect(store.held().home.fetched).toHaveLength(READS_PER_EXCHANGE + 1)

    // The old round's programs are recorded at last.
    for (const card of programs) {
      at.runs.set(`old-01/${card}`, [{ ended: "recorded", rustc: PRINTS }])
    }
    at.calls.length = 0
    await exchangeRounds(store, at.send)
    expect(at.calls).toEqual(["GET /rust-rounds", "GET /rust-rounds/old-01"])
    for (const card of programs) {
      expect(runOf(store.held(), { round: "old-01", card })).toEqual(PRINTS)
    }
  })

  it("reads at most READS_PER_EXCHANGE rounds, newest first, and notes one it can't read", async () => {
    const store = phone()
    const at = home()
    // More than one exchange reads, few enough for the next to read the rest.
    for (let n = 0; n < READS_PER_EXCHANGE + 3; n += 1) {
      const id = `indexing-${String(n + 10)}`
      at.rounds.set(id, { ...PASTED, id })
    }
    at.rounds.set("broken-01", { schema: "some-ui.rust-round/1", id: "x" })

    await exchangeRounds(store, at.send)
    const reads = at.calls.filter((call) =>
      call.startsWith("GET /rust-rounds/")
    )
    expect(reads).toHaveLength(READS_PER_EXCHANGE)
    expect(reads[0]).toBe("GET /rust-rounds/broken-01")
    expect(store.held().home.unread).toEqual(["broken-01"])
    expect(store.held().home.fetched).toHaveLength(READS_PER_EXCHANGE - 1)

    at.calls.length = 0
    await exchangeRounds(store, at.send)
    expect(at.calls).not.toContain("GET /rust-rounds/broken-01")
    expect(store.held().home.fetched).toHaveLength(READS_PER_EXCHANGE + 3)
  })

  it("does not read again a round it sent whose answer it couldn't read", async () => {
    const store = phone([PASTED])
    const at = home()
    at.answer = (method, path): HomeAnswer | null =>
      method === "GET" && path.endsWith(PASTED.id)
        ? { status: 200, body: "{}" }
        : null
    await exchangeRounds(store, at.send)
    expect(store.held().home).toMatchObject({
      sent: [PASTED.id],
      unread: [PASTED.id],
    })
    // Its cards say no run will show.
    expect(whyNoRun(store.held(), { round: PASTED.id, card: "a" }, true)).toBe(
      "unread"
    )
    at.calls.length = 0
    await exchangeRounds(store, at.send)
    expect(at.calls).toEqual(["GET /rust-rounds"])
  })

  it("loses nothing the session wrote while it ran, and the session's stale write loses nothing it took", async () => {
    const store = phone([PASTED])
    const stale = store.held()
    const at = home()
    const later = { ...PASTED, id: "indexing-03" }
    at.rounds.set("borrowing-01", { ...PASTED, id: "borrowing-01" })
    const send: HomeCall = async (method, path, body) => {
      // A reply pasted while the first request is on its way.
      if (at.calls.length === 0) {
        store.hold({ ...stale, rounds: [...stale.rounds, later] })
      }
      return at.send(method, path, body)
    }

    await exchangeRounds(store, send)
    // The session, holding what it read before, writes again.
    store.hold({ ...stale, rounds: [...stale.rounds, later] })
    const held = store.held()
    expect(held.rounds.map((round) => round.id)).toEqual([
      PASTED.id,
      later.id,
      "borrowing-01",
    ])
    expect(held.home.sent).toEqual([PASTED.id])
    expect(held.home.fetched).toEqual(["borrowing-01"])
    expect(roundsToSend(held).map((round) => round.id)).toEqual([later.id])
  })
})
