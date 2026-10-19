import type { HomeCall } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

import type { JobsRecordPort } from "@/lib/jobs/home"
import { exchangeJobs } from "@/lib/jobs/home"
import type { JobEvent, JobsState, PickRef } from "@/lib/jobs/model"
import { EMPTY, homeOutbox, step } from "@/lib/jobs/model"

import { digest, OPENED_AT } from "./fixture"

const D = digest("2026-10-18")
const [SW, AD] = D.picks
const ref = (p = SW): PickRef => ({
  day: D.day,
  pickId: p.id,
  fingerprint: p.fingerprint,
})

const opened = step(EMPTY, { type: "opened", digest: D, at: OPENED_AT })
const withLog = [
  { type: "taken" as const, ...ref() },
  { type: "taken" as const, ...ref(AD) },
  {
    type: "outcome" as const,
    fingerprint: SW.fingerprint,
    event: "reply" as const,
    on: "2026-10-20",
    note: "",
  },
].reduce<JobsState>(
  (state, event, i) =>
    step(state, {
      type: "record",
      event,
      stamp: { id: `e${i + 1}`, at: `2026-10-18T16:0${i}:00.000Z` },
    }),
  opened
)

/** A keeping over a state it updates as `step` would. */
function keeping(initial: JobsState): JobsRecordPort & { current: JobsState } {
  const k = {
    current: initial,
    state: (): JobsState => k.current,
    answered: (
      held: ReadonlyArray<string>,
      refused: ReadonlyArray<{ id: string; why: string }>
    ): void => {
      k.current = step(k.current, { type: "home-answered", held, refused })
    },
    restored: (events: ReadonlyArray<JobEvent>): boolean => {
      const next = step(k.current, { type: "restored", events })
      const changed = next !== k.current
      k.current = next
      return changed
    },
  }
  return k
}

type Call = { method: string; path: string; body?: string }

/** A home that answers each call from `answer`, and records it. */
function home(answer: (call: Call) => { status: number; body: unknown }): {
  send: HomeCall
  calls: Array<Call>
} {
  const calls: Array<Call> = []
  const send: HomeCall = (method, path, body) => {
    const call = { method, path, body }
    calls.push(call)
    const { status, body: out } = answer(call)
    return Promise.resolve({ status, body: JSON.stringify(out) })
  }
  return { send, calls }
}

const holding =
  (record: ReadonlyArray<unknown> = []) =>
  (call: Call): { status: number; body: unknown } => {
    if (call.method === "GET") return { status: 200, body: { events: record } }
    const event: unknown = JSON.parse(call.body ?? "{}")
    return { status: 200, body: { change: "added", event } }
  }

describe("exchangeJobs", () => {
  it("sends each event home doesn't hold, once, and reads nothing back for a phone with a log", async () => {
    const k = keeping(withLog)
    const h = home(holding())
    expect(await exchangeJobs(k, h.send)).toEqual({ kind: "synced" })
    expect(h.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "PUT /jobs/events/e1",
      "PUT /jobs/events/e2",
      "PUT /jobs/events/e3",
    ])
    expect(JSON.parse(h.calls[0]?.body ?? "")).toEqual(withLog.log[0])
    expect(k.current.home.held).toEqual(["e1", "e2", "e3"])
    expect(homeOutbox(k.current)).toEqual([])

    const again = home(holding())
    expect(await exchangeJobs(k, again.send)).toEqual({ kind: "synced" })
    expect(again.calls).toEqual([])
    expect(k.current.log).toEqual(withLog.log)
  })

  it("keeps a refused event on the phone, says why, and doesn't send it again", async () => {
    const k = keeping(withLog)
    const h = home((call) => {
      if (call.path.endsWith("/e1")) return { status: 409, body: {} }
      if (call.path.endsWith("/e2")) {
        return {
          status: 422,
          body: { error: { details: { fingerprint: ["has three parts"] } } },
        }
      }
      return holding()(call)
    })
    expect(await exchangeJobs(k, h.send)).toEqual({ kind: "synced" })
    expect(k.current.home).toEqual({
      kept: false,
      held: ["e3"],
      refused: [
        { id: "e1", why: "home holds a different event under this id" },
        { id: "e2", why: "fingerprint has three parts" },
      ],
    })
    expect(homeOutbox(k.current)).toEqual([])
  })

  it("keeps what home confirmed when the exchange stops part way", async () => {
    const k = keeping(withLog)
    const send: HomeCall = (method, path, body) =>
      path.endsWith("/e2")
        ? Promise.reject(new Error("stopped"))
        : home(holding()).send(method, path, body)
    await expect(exchangeJobs(k, send)).rejects.toThrow("stopped")
    expect(k.current.home.held).toEqual(["e1"])
  })

  it("ends on a 401, and on an answer it can't read", async () => {
    const forgot = home(() => ({ status: 401, body: {} }))
    expect(await exchangeJobs(keeping(withLog), forgot.send)).toEqual({
      kind: "forgotten",
    })
    const odd = home(() => ({ status: 500, body: {} }))
    expect(await exchangeJobs(keeping(withLog), odd.send)).toEqual({
      kind: "failed",
      why: "an event: home answered 500",
    })
  })

  it("gives an empty phone its record back, and never lays home's over a log", async () => {
    const restoredHere = keeping(EMPTY)
    const h = home(holding(withLog.log))
    expect(await exchangeJobs(restoredHere, h.send)).toEqual({
      kind: "synced",
    })
    expect(restoredHere.current.log).toEqual(withLog.log)
    expect(restoredHere.current.home.held).toEqual(["e1", "e2", "e3"])

    const full = { ...keeping(EMPTY), restored: (): boolean => false }
    expect(await exchangeJobs(full, home(holding(withLog.log)).send)).toEqual({
      kind: "failed",
      why: "this phone couldn't keep home's record",
    })

    const own = keeping(opened)
    const one = step(own.current, {
      type: "record",
      event: { type: "taken", ...ref() },
      stamp: { id: "mine", at: "2026-10-19T10:00:00.000Z" },
    })
    own.current = one
    await exchangeJobs(own, home(holding(withLog.log)).send)
    expect(own.current.log.map((e) => e.id)).toEqual(["mine"])
  })

  it("says nothing failed when the phone's first event lands while home's record is read", async () => {
    const k = keeping(EMPTY)
    const send: HomeCall = (method, path, body) => {
      k.current = step(opened, {
        type: "record",
        event: { type: "taken", ...ref() },
        stamp: { id: "mine", at: "2026-10-19T10:00:00.000Z" },
      })
      return home(holding(withLog.log)).send(method, path, body)
    }
    expect(await exchangeJobs(k, send)).toEqual({ kind: "synced" })
    expect(k.current.log.map((e) => e.id)).toEqual(["mine"])
  })
})

describe("step on home's answers", () => {
  it("takes only answers about events in its log, each once", () => {
    const answered = step(withLog, {
      type: "home-answered",
      held: ["e1", "e1", "elsewhere"],
      refused: [{ id: "e2", why: "no" }],
    })
    expect(answered.home.held).toEqual(["e1"])
    expect(answered.home.refused).toEqual([{ id: "e2", why: "no" }])
    expect(
      step(answered, {
        type: "home-answered",
        held: ["e1"],
        refused: [{ id: "e2", why: "no" }],
      })
    ).toBe(answered)
  })
})
