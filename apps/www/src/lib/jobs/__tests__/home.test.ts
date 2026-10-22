import type { HomeCall } from "@some-ui/core-utils"
import type { ForeignFailure } from "@some-ui/intent-kit"
import { addFailureSink } from "@some-ui/intent-kit"
import type { Digest } from "@some-ui/job-desk"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { JobsRecordPort } from "@/lib/jobs/home"
import { exchangeJobs } from "@/lib/jobs/home"
import type { JobEvent, JobsState, PickRef } from "@/lib/jobs/model"
import { DIGESTS_PER_RUN, EMPTY, homeOutbox, step } from "@/lib/jobs/model"

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

const FETCHED_AT = "2026-10-21T08:00:00.000Z"

/** A keeping over a state it updates as `step` would. */
function keeping(initial: JobsState): JobsRecordPort & {
  current: JobsState
  fetches: Array<ReadonlyArray<Digest>>
} {
  const fetches: Array<ReadonlyArray<Digest>> = []
  const k = {
    current: initial,
    fetches,
    fetched: (digests: ReadonlyArray<Digest>): void => {
      fetches.push(digests)
      k.current = step(k.current, { type: "fetched", digests, at: FETCHED_AT })
    },
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

/** A home holding `record`, and the `digests` it has taken from the mailbox. */
const holding =
  (record: ReadonlyArray<unknown> = [], digests: ReadonlyArray<unknown> = []) =>
  (call: Call): { status: number; body: unknown } => {
    if (call.path.startsWith("/jobs/digests")) {
      return { status: 200, body: { digests } }
    }
    if (call.method === "GET") return { status: 200, body: { events: record } }
    const event: unknown = JSON.parse(call.body ?? "{}")
    return { status: 200, body: { change: "added", event } }
  }

describe("exchangeJobs", () => {
  it("sends each event home doesn't hold, once, and reads no record back for a phone with a log", async () => {
    const k = keeping(withLog)
    const h = home(holding())
    expect(await exchangeJobs(k, h.send)).toEqual({ kind: "synced" })
    expect(h.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "PUT /jobs/events/e1",
      "PUT /jobs/events/e2",
      "PUT /jobs/events/e3",
      "GET /jobs/digests?after=2026-10-18",
    ])
    expect(JSON.parse(h.calls[0]?.body ?? "")).toEqual(withLog.log[0])
    expect(k.current.home.held).toEqual(["e1", "e2", "e3"])
    expect(homeOutbox(k.current)).toEqual([])

    const again = home(holding())
    expect(await exchangeJobs(k, again.send)).toEqual({ kind: "synced" })
    expect(again.calls.map((c) => c.method)).toEqual(["GET"])
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

  it("refuses nothing when home says this phone stopped sending, and ends there", async () => {
    const k = keeping(withLog)
    const h = home(() => ({
      status: 409,
      body: { error: { code: "sharing_stopped", message: "stopped" } },
    }))
    expect(await exchangeJobs(k, h.send)).toEqual({
      kind: "failed",
      why: "an event: home answered 409",
    })
    expect(h.calls).toHaveLength(1)
    expect(k.current.home.refused).toEqual([])
    expect(homeOutbox(k.current)).toHaveLength(3)
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

describe("exchangeJobs, the digests home holds", () => {
  const entry = (d: Digest): { day: string; digest: Digest } => ({
    day: d.day,
    digest: d,
  })
  const later = (
    ...days: Array<string>
  ): Array<{ day: string; digest: Digest }> =>
    days.map((day) => entry(digest(day)))

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("asks home for digests after the newest it holds, once the events are sent", async () => {
    const k = keeping(
      step(withLog, {
        type: "opened",
        digest: digest("2026-10-20"),
        at: OPENED_AT,
      })
    )
    const h = home(holding())
    expect(await exchangeJobs(k, h.send)).toEqual({ kind: "synced" })
    expect(h.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "PUT /jobs/events/e1",
      "PUT /jobs/events/e2",
      "PUT /jobs/events/e3",
      "GET /jobs/digests?after=2026-10-20",
    ])
  })

  it("asks for the newest on a phone with no digests, after reading back an empty one's record", async () => {
    const bare = { ...withLog, digests: [], current: null }
    const h = home(holding())
    await exchangeJobs(keeping(bare), h.send)
    expect(h.calls.map((c) => `${c.method} ${c.path}`).at(-1)).toBe(
      "GET /jobs/digests"
    )

    const empty = keeping(EMPTY)
    const restored = home(holding(withLog.log))
    await exchangeJobs(empty, restored.send)
    expect(restored.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /jobs",
      "GET /jobs/digests",
    ])
  })

  it("takes digests in through fetched, and shows the newest", async () => {
    const k = keeping(withLog)
    const h = home(holding([], later("2026-10-19", "2026-10-20")))
    expect(await exchangeJobs(k, h.send)).toEqual({ kind: "synced" })
    expect(k.fetches.map((f) => f.map((d) => d.day))).toEqual([
      ["2026-10-19", "2026-10-20"],
    ])
    expect(k.current.digests.map((d) => d.day)).toEqual([
      "2026-10-18",
      "2026-10-19",
      "2026-10-20",
    ])
    expect(k.current.current).toBe("2026-10-20")
  })

  it("never replaces a day the phone holds, and takes in no more than a run's worth", async () => {
    const k = keeping(withLog)
    const other = { ...digest("2026-10-18"), seen: 99 }
    const days = Array.from(
      { length: DIGESTS_PER_RUN + 2 },
      (_, i) => `2026-10-${String(19 + i)}`
    )
    const h = home(holding([], [entry(other), ...later(...days)]))
    await exchangeJobs(k, h.send)
    expect(k.current.digests.find((d) => d.day === "2026-10-18")).toBe(
      withLog.digests[0]
    )
    expect(k.fetches[0]).toHaveLength(DIGESTS_PER_RUN)
    expect(k.fetches[0]?.at(-1)?.day).toBe(days.at(-1))
    expect(k.current.digests).toHaveLength(1 + DIGESTS_PER_RUN)
  })

  it("skips a digest that is not a digest, reports only its day, and takes in the rest", async () => {
    vi.spyOn(globalThis.console, "error").mockImplementation(() => undefined)
    const failures: Array<ForeignFailure> = []
    const stop = addFailureSink((f) => failures.push(f))
    try {
      const k = keeping(withLog)
      const bad = {
        day: "2026-10-19",
        digest: { schema: "some-ui.job-digest/1", day: "2026-10-19", picks: 5 },
      }
      const h = home(holding([], [bad, ...later("2026-10-20")]))
      expect(await exchangeJobs(k, h.send)).toEqual({ kind: "synced" })
      expect(k.fetches[0]?.map((d) => d.day)).toEqual(["2026-10-20"])
      expect(failures).toHaveLength(1)
      const said = JSON.stringify(failures[0]?.error.summary)
      expect(said).toContain("2026-10-19")
      expect(said).not.toContain("picks")
    } finally {
      stop()
    }
  })

  it("ends forgotten on a 401 on the digests read, keeping what the events step learned", async () => {
    const k = keeping(withLog)
    const h = home((call) =>
      call.path.startsWith("/jobs/digests")
        ? { status: 401, body: {} }
        : holding()(call)
    )
    expect(await exchangeJobs(k, h.send)).toEqual({ kind: "forgotten" })
    expect(k.current.home.held).toEqual(["e1", "e2", "e3"])
    expect(k.fetches).toEqual([])
  })

  it("fetches nothing when the digests answer is not one it expects", async () => {
    for (const [status, body, shown] of [
      [500, {}, 500],
      [200, { digests: "none" }, 200],
      [200, { digests: [{ day: "yesterday", digest: {} }] }, 200],
    ] as const) {
      const k = keeping(withLog)
      const h = home((call) =>
        call.path.startsWith("/jobs/digests")
          ? { status, body }
          : holding()(call)
      )
      expect(await exchangeJobs(k, h.send)).toEqual({
        kind: "failed",
        why: `the digests: home answered ${shown}`,
      })
      expect(k.fetches).toEqual([])
      expect(k.current.digests).toEqual(withLog.digests)
    }
  })

  it("does not call fetched when home holds no digests, or none can be read", async () => {
    vi.spyOn(globalThis.console, "error").mockImplementation(() => undefined)
    const none = keeping(withLog)
    await exchangeJobs(none, home(holding()).send)
    const unreadable = keeping(withLog)
    await exchangeJobs(
      unreadable,
      home(holding([], [{ day: "2026-10-19", digest: {} }])).send
    )
    expect(none.fetches).toEqual([])
    expect(unreadable.fetches).toEqual([])
    expect(unreadable.current.digests).toEqual(withLog.digests)
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
