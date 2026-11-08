/**
 * The weeks from home (RR13, #2688), against a home in memory that answers
 * as paulgsc/server's `handlers/rust_rounds.rs` does for `/rust-weeks`: a
 * week comes once and is kept whole, each ticket's first recorded run fills
 * in, and nothing else of the phone's changes.
 */
import type { RustcRun } from "@rust-rounds/lib/formats"
import { QUILLMOSS_WEEK } from "@rust-rounds/lib/sample-week"
import {
  exchangeWeeks,
  heldWeek,
  keptWeeks,
  WEEK_READS_PER_EXCHANGE,
} from "@rust-rounds/lib/weeks"
import type { HomeAnswer, HomeCall } from "@some-ui/core-utils"
import { inMemoryStorage } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

const PRINTS: RustcRun = {
  outcome: "prints",
  toolchain: "rustc 1.97.0",
  compileStderr: "",
  stdout: "7 ok\n8 late\n",
}

type Run = { ended: "recorded" | "refused" | "runner-lost"; rustc: unknown }

type Served = {
  readonly id: string
  readonly sha256: string
  readonly week: unknown
  readonly runs: Record<string, Array<Run>>
}

const SHA = "a".repeat(64)

function home(served: Array<Served>): {
  send: HomeCall
  calls: Array<string>
} {
  const calls: Array<string> = []
  const json = (status: number, body: unknown): HomeAnswer => ({
    status,
    body: JSON.stringify(body),
  })
  const send: HomeCall = (method, path) => {
    calls.push(`${method} ${path}`)
    if (path === "/rust-weeks") {
      return Promise.resolve(
        json(200, {
          weeks: served.map(({ id, sha256 }) => ({
            id,
            sha256,
            receivedAt: "2026-11-08T12:00:00Z",
          })),
        })
      )
    }
    const one = served.find((each) => path === `/rust-weeks/${each.id}`)
    if (one === undefined) return Promise.resolve(json(404, {}))
    return Promise.resolve(
      json(200, {
        id: one.id,
        sha256: one.sha256,
        receivedAt: "2026-11-08T12:00:00Z",
        week: one.week,
        tickets: Object.entries(one.runs).map(([ticket, runs]) => ({
          ticket,
          sourceHash: SHA,
          runs: runs.map((run) => ({
            toolchain: "rustc 1.97.0",
            refusal: null,
            ...run,
          })),
        })),
      })
    )
  }
  return { send, calls }
}

const week46 = (runs: Record<string, Array<Run>> = {}): Served => ({
  id: QUILLMOSS_WEEK.id,
  sha256: SHA,
  week: QUILLMOSS_WEEK,
  runs,
})

describe("the weeks from home (RR13)", () => {
  it("keeps a week it lacks, whole, with each ticket's first recorded run", async () => {
    const store = keptWeeks(inMemoryStorage())
    const { send } = home([
      week46({
        "QM-311": [{ ended: "recorded", rustc: PRINTS }],
        "QM-312": [{ ended: "refused", rustc: PRINTS }],
      }),
    ])
    expect(await exchangeWeeks(store, send)).toEqual({ kind: "synced" })
    const held = heldWeek(store.held(), QUILLMOSS_WEEK.id)
    expect(held?.week).toEqual(QUILLMOSS_WEEK)
    expect(held?.runs).toEqual({ "QM-311": PRINTS })
    // A refused program waits no more; one with no run yet still does.
    expect(held?.ended).toEqual(["QM-312"])
  })

  it("reads a week again only while a ticket waits on its run", async () => {
    const store = keptWeeks(inMemoryStorage())
    const served = [
      week46({ "QM-311": [{ ended: "recorded", rustc: PRINTS }] }),
    ]
    await exchangeWeeks(store, home(served).send)
    const again = home([
      week46({
        "QM-311": [{ ended: "recorded", rustc: PRINTS }],
        "QM-312": [{ ended: "recorded", rustc: PRINTS }],
        "QM-313": [{ ended: "runner-lost", rustc: PRINTS }],
      }),
    ])
    await exchangeWeeks(store, again.send)
    expect(again.calls).toEqual(["GET /rust-weeks", "GET /rust-weeks/2026-w46"])
    const held = heldWeek(store.held(), QUILLMOSS_WEEK.id)
    expect(Object.keys(held?.runs ?? {})).toEqual(["QM-311", "QM-312"])
    expect(held?.ended).toEqual(["QM-313"])
    const done = home(served)
    await exchangeWeeks(store, done.send)
    expect(done.calls).toEqual(["GET /rust-weeks"])
  })

  it("keeps the first copy of a week, and leaves another under its id on home", async () => {
    const store = keptWeeks(inMemoryStorage())
    await exchangeWeeks(store, home([week46()]).send)
    const other = {
      ...week46({ "QM-311": [{ ended: "recorded", rustc: PRINTS }] }),
      sha256: "b".repeat(64),
      week: { ...QUILLMOSS_WEEK, story: "Another story." },
    }
    const again = home([other])
    await exchangeWeeks(store, again.send)
    expect(again.calls).toEqual(["GET /rust-weeks"])
    expect(heldWeek(store.held(), QUILLMOSS_WEEK.id)?.week).toEqual(
      QUILLMOSS_WEEK
    )
  })

  it("notes a week it can't read and doesn't read it again", async () => {
    const store = keptWeeks(inMemoryStorage())
    const broken = { ...week46(), week: { ...QUILLMOSS_WEEK, tickets: [] } }
    await exchangeWeeks(store, home([broken]).send)
    expect(store.held()).toEqual({ weeks: [], unread: [`2026-w46@${SHA}`] })
    const again = home([broken])
    await exchangeWeeks(store, again.send)
    expect(again.calls).toEqual(["GET /rust-weeks"])
  })

  it(`reads at most ${WEEK_READS_PER_EXCHANGE} weeks an exchange, newest first`, async () => {
    const store = keptWeeks(inMemoryStorage())
    // As home lists them: newest first.
    const weeks = [51, 50, 49, 48, 47].map((n) => ({
      ...week46(),
      id: `2026-w${n}`,
    }))
    const { send, calls } = home(weeks)
    await exchangeWeeks(store, send)
    expect(calls.slice(1)).toEqual(
      weeks
        .slice(0, WEEK_READS_PER_EXCHANGE)
        .map(({ id }) => `GET /rust-weeks/${id}`)
    )
  })

  it("stops reading once home says it is busy, sending nothing after it (AD3)", async () => {
    const store = keptWeeks(inMemoryStorage())
    const weeks = [51, 50, 49].map((n) => ({ ...week46(), id: `2026-w${n}` }))
    const { send, calls } = home(weeks)
    const busy: HomeCall = (method, path, body) => {
      if (path !== "/rust-weeks/2026-w50") return send(method, path, body)
      calls.push(`${method} ${path}`)
      return Promise.resolve({ status: 429, body: "" })
    }
    expect(await exchangeWeeks(store, busy)).toMatchObject({ kind: "failed" })
    expect(calls).toEqual([
      "GET /rust-weeks",
      "GET /rust-weeks/2026-w51",
      "GET /rust-weeks/2026-w50",
    ])
  })

  it("says home forgot the phone, and keeps nothing, on a 401", async () => {
    const store = keptWeeks(inMemoryStorage())
    const send: HomeCall = () => Promise.resolve({ status: 401, body: "" })
    expect(await exchangeWeeks(store, send)).toEqual({ kind: "forgotten" })
    expect(store.held()).toEqual({ weeks: [], unread: [] })
  })
})
