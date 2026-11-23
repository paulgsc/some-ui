/**
 * @vitest-environment node
 *
 * Run it again (RETRY): every row that couldn't finish reads as one `Stop`,
 * each `Stop` as the owner's steps, and the button is on only once nothing
 * waits on the owner; home's answers to a tap, every one.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import type { AttentionRead, AttentionTake } from "@some-ui/soundbites"
import { describe, expect, it } from "vitest"

import type { Attention, Step, Stop } from "@/lib/renders/again/model"
import {
  attentionOf,
  canRun,
  follow,
  planOf,
  readAgain,
  settled,
  stopOf,
} from "@/lib/renders/again/model"
import type { Board, RenderFailed } from "@/lib/renders/model"

const row = (extra: Partial<RenderFailed> = {}): RenderFailed => ({
  feed: "cards-essay",
  key: "rust-rounds-how-it-works-2026-11-20",
  at: 1795390000,
  by: "recorder",
  exit: 1,
  ...extra,
})

const TAKES = ["37c56646", "4499b000"]

const read = (...ids: ReadonlyArray<string>): Attention => ({
  kind: "read",
  waiting: new Set(ids),
})
const UNREAD: Attention = { kind: "unread" }

describe("stopOf", () => {
  it("reads every row home's board can send as one stop", () => {
    const cases: ReadonlyArray<[Partial<RenderFailed>, Stop["kind"]]> = [
      [{}, "burnt"],
      [{ by: "home", exit: null }, "burnt"],
      [{ feed: "call", key: "2026-11-06" }, "burnt"],
      [{ reason: "take-unheard", items: TAKES }, "takes-unheard"],
      [{ reason: "take-missing", items: TAKES }, "missing"],
      [{ reason: "clip-missing" }, "missing"],
      [{ reason: "snip-missing" }, "snips"],
      [{ reason: "snip-gone" }, "snips"],
      [{ reason: "too-long", minutes: 64, capMinutes: 60 }, "policy"],
      [{ reason: "too-large", mb: 700, capMb: 500 }, "policy"],
      [{ reason: "overflow", scenes: ["s1"], sceneCount: 1 }, "policy"],
      [{ feed: "preview", key: "rust-essay-20261111T010000Z" }, "preview"],
      // A class this phone doesn't know yet is an attempt that failed.
      [{ reason: "something-new" }, "burnt"],
      // A refusal missing its numbers is no refusal (RNR1).
      [{ reason: "too-long" }, "burnt"],
    ]
    for (const [extra, kind] of cases)
      expect(stopOf(row(extra)).kind, JSON.stringify(extra)).toBe(kind)
  })

  it("names the takes home couldn't hear, or none from a home before it did", () => {
    expect(stopOf(row({ reason: "take-unheard", items: TAKES }))).toEqual({
      kind: "takes-unheard",
      takes: TAKES,
    })
    expect(stopOf(row({ reason: "take-unheard" }))).toEqual({
      kind: "takes-unheard",
      takes: [],
    })
  })
})

describe("planOf and canRun", () => {
  const unheard: Stop = { kind: "takes-unheard", takes: TAKES }

  it("runs a burnt row at once, whatever the takes say", () => {
    const burnt: Stop = { kind: "burnt", by: "recorder" }
    for (const attention of [UNREAD, read(), read("x")])
      expect(canRun(planOf(burnt, attention, "cards-essay"))).toBe(true)
  })

  it("waits on the essay's takes that still need attention, and only those", () => {
    const plan = planOf(
      unheard,
      read("37c56646", "someone-else"),
      "cards-essay"
    )
    expect(plan).toEqual({
      kind: "takes",
      takes: TAKES,
      waiting: ["37c56646"],
      read: true,
    })
    expect(canRun(plan)).toBe(false)
  })

  it("turns the button on once none of them waits", () => {
    const plan = planOf(unheard, read("someone-else"), "cards-essay")
    expect(plan).toMatchObject({ waiting: [], read: true })
    expect(canRun(plan)).toBe(true)
  })

  it("never offers the button on a guess: takes not read count as waiting", () => {
    const plan = planOf(unheard, UNREAD, "cards-essay")
    expect(plan).toMatchObject({ waiting: TAKES, read: false })
    expect(canRun(plan)).toBe(false)
  })

  it("waits on every take needing attention where home named none", () => {
    const unnamed: Stop = { kind: "takes-unheard", takes: [] }
    expect(canRun(planOf(unnamed, read("a", "b"), "cards-essay"))).toBe(false)
    expect(planOf(unnamed, read("a", "b"), "cards-essay")).toMatchObject({
      waiting: ["a", "b"],
    })
    expect(canRun(planOf(unnamed, UNREAD, "cards-essay"))).toBe(false)
    expect(canRun(planOf(unnamed, read(), "cards-essay"))).toBe(true)
  })

  it("offers nothing this phone can't change", () => {
    const stops: ReadonlyArray<Stop> = [
      {
        kind: "policy",
        refusal: { kind: "too-long", minutes: 64, capMinutes: 60 },
      },
      { kind: "missing", what: "take" },
      { kind: "missing", what: "clip" },
      { kind: "snips", gone: true },
      { kind: "snips", gone: false },
      { kind: "preview" },
    ]
    for (const stop of stops)
      for (const attention of [UNREAD, read()])
        expect(canRun(planOf(stop, attention, "cards-essay")), stop.kind).toBe(
          false
        )
  })
})

describe("attentionOf", () => {
  const take = (id: string): AttentionTake => ({
    id,
    of: "studio",
    ref: "ep04:s3:2",
    recordedAt: "2026-11-20T09:00:00.000Z",
    heard: null,
    verdict: {
      kind: "failed",
      reasons: ["deadline"],
      rule: "heard-1",
      language: null,
    },
    hearAgain: null,
  })

  it("reads the ids home lists", () => {
    const listed: AttentionRead = {
      kind: "read",
      page: { takes: [take("a"), take("b")], total: 2 },
    }
    expect(attentionOf(listed)).toEqual(read("a", "b"))
  })

  it("leaves out a take home is hearing again: it waits on no one (#3339)", () => {
    const hearing: AttentionRead = {
      kind: "read",
      page: {
        takes: [
          {
            ...take("a"),
            hearAgain: { open: false, hearing: true, askAgainAt: null },
          },
          {
            ...take("b"),
            hearAgain: { open: true, hearing: false, askAgainAt: null },
          },
        ],
        total: 2,
      },
    }
    expect(attentionOf(hearing)).toEqual(read("b"))
  })

  it("reads a list home cut short as unread, so a take past it never counts as answered", () => {
    const cut: AttentionRead = {
      kind: "read",
      page: { takes: [take("a")], total: 101 },
    }
    expect(attentionOf(cut)).toEqual(UNREAD)
  })

  it("reads every other answer as unread", () => {
    for (const kind of [
      "unpaired",
      "away",
      "busy",
      "older",
      "unreadable",
    ] as const)
      expect(attentionOf({ kind })).toEqual(UNREAD)
  })
})

describe("planOf on a row home makes no other of on ask", () => {
  it("leaves a clip's walk to home, which tries it again by itself", () => {
    const burnt: Stop = { kind: "burnt", by: "recorder" }
    expect(planOf(burnt, UNREAD, "clip-walk")).toEqual({ kind: "byItself" })
    expect(canRun(planOf(burnt, UNREAD, "clip-walk"))).toBe(false)
    expect(canRun(planOf(burnt, UNREAD, "call"))).toBe(true)
  })
})

const STEP: Step = {
  state: "asked",
  askedAt: 1_795_390_000,
  startedAt: null,
  endedAt: null,
  reason: null,
  items: [],
}

describe("readAgain", () => {
  const answer = (status: number, body: unknown): HomeAnswer => ({
    status,
    body: JSON.stringify(body),
  })

  it("reads home's Step on every answer that carries one", () => {
    expect(
      readAgain(
        answer(202, { asset: "video", state: "asked", askedAt: 1_795_390_000 })
      )
    ).toEqual({ kind: "step", step: STEP })
    expect(
      readAgain(answer(200, { asset: "video", state: "done", endedAt: 5 }))
    ).toEqual({
      kind: "step",
      step: { ...STEP, state: "done", askedAt: null, endedAt: 5 },
    })
    expect(
      readAgain(
        answer(409, {
          asset: "video",
          state: "blocked",
          reason: "take-unheard",
          items: TAKES,
          itemCount: 2,
        })
      )
    ).toEqual({
      kind: "step",
      step: {
        ...STEP,
        state: "blocked",
        askedAt: null,
        reason: "take-unheard",
        items: TAKES,
      },
    })
  })

  it("reads an ISO time as Unix seconds, and one it can't read as none", () => {
    const read = readAgain(
      answer(202, {
        state: "waiting",
        askedAt: "2026-11-23T00:00:00.000Z",
        startedAt: "soon",
      })
    )
    expect(read).toMatchObject({
      step: {
        askedAt: Date.parse("2026-11-23T00:00:00.000Z") / 1000,
        startedAt: null,
      },
    })
  })

  it("reads a home without the route, or without the episode, as not here", () => {
    expect(readAgain(answer(404, {}))).toEqual({ kind: "notHere" })
    expect(readAgain(answer(405, {}))).toEqual({ kind: "notHere" })
  })

  it("reads anything else as unreadable", () => {
    expect(readAgain(answer(500, {}))).toEqual({ kind: "unreadable" })
    expect(readAgain(answer(422, { state: "failed" }))).toEqual({
      kind: "unreadable",
    })
    expect(readAgain(answer(202, { state: "made" }))).toEqual({
      kind: "unreadable",
    })
    expect(readAgain({ status: 202, body: "not json" })).toEqual({
      kind: "unreadable",
    })
  })
})

describe("follow", () => {
  const FEED = "cards-essay"
  const KEY = "home-database-safety-2026-11-21"
  const empty: Board = {
    now: null,
    waiting: [],
    failed: [],
    done: [],
    coming: [],
  }
  const NOW = 1_795_390_600

  it("moves along the line as the board says, keeping every time home said", () => {
    const waiting = follow(
      STEP,
      { ...empty, waiting: [{ feed: FEED, key: KEY, at: 1 }] },
      FEED,
      KEY,
      NOW
    )
    expect(waiting).toEqual({ ...STEP, state: "waiting" })
    const rendering = follow(
      waiting,
      {
        ...empty,
        now: {
          feed: FEED,
          key: KEY,
          state: "rendering",
          since: 1_795_390_100,
          stateSince: 1_795_390_200,
          gaveWay: 0,
          heldBy: null,
          stuck: false,
          estimate: null,
        },
      },
      FEED,
      KEY,
      NOW
    )
    expect(rendering).toEqual({
      ...STEP,
      state: "rendering",
      startedAt: 1_795_390_200,
    })
    const done = follow(
      rendering,
      { ...empty, done: [{ feed: FEED, key: KEY, at: 1_795_391_000 }] },
      FEED,
      KEY,
      NOW
    )
    expect(done).toEqual({
      ...STEP,
      state: "done",
      startedAt: 1_795_390_200,
      endedAt: 1_795_391_000,
    })
  })

  it("reads a failure after the ask as this run's, and the one before as the one it ran again", () => {
    const old = {
      feed: FEED,
      key: KEY,
      at: 1_795_389_000,
      by: "recorder" as const,
      exit: 1,
    }
    expect(follow(STEP, { ...empty, failed: [old] }, FEED, KEY, NOW)).toBe(STEP)
    const later = { ...old, at: 1_795_390_500 }
    expect(follow(STEP, { ...empty, failed: [later] }, FEED, KEY, NOW)).toEqual(
      {
        ...STEP,
        state: "failed",
        endedAt: 1_795_390_500,
      }
    )
    const refused = { ...later, reason: "take-unheard", items: TAKES }
    expect(
      follow(STEP, { ...empty, failed: [refused] }, FEED, KEY, NOW)
    ).toMatchObject({
      state: "blocked",
      reason: "take-unheard",
      items: TAKES,
    })
  })

  it("reads a run's end against the tap where home names no ask time", () => {
    const unnamed: Step = { ...STEP, state: "waiting", askedAt: null }
    const tapped = 1_795_390_000
    const old = {
      feed: FEED,
      key: KEY,
      at: tapped - 600,
      by: "recorder" as const,
      exit: 1,
    }
    expect(
      follow(unnamed, { ...empty, failed: [old] }, FEED, KEY, tapped)
    ).toBe(unnamed)
    const burnt = { ...old, at: tapped + 300 }
    expect(
      follow(unnamed, { ...empty, failed: [burnt] }, FEED, KEY, tapped)
    ).toMatchObject({
      state: "failed",
      endedAt: tapped + 300,
    })
    // A phone a minute ahead of home still sees the run's own end.
    const skewed = { ...old, at: tapped - 60 }
    expect(
      follow(unnamed, { ...empty, failed: [skewed] }, FEED, KEY, tapped)
    ).toMatchObject({ state: "failed" })
  })

  it("never takes an earlier make of the episode for this run's", () => {
    const earlier = { feed: FEED, key: KEY, at: 1_795_380_000 }
    expect(follow(STEP, { ...empty, done: [earlier] }, FEED, KEY, NOW)).toBe(
      STEP
    )
  })

  it("never moves a step back to waiting once it is in the oven", () => {
    const rendering: Step = { ...STEP, state: "rendering", startedAt: 5 }
    expect(
      follow(
        rendering,
        { ...empty, waiting: [{ feed: FEED, key: KEY, at: 1 }] },
        FEED,
        KEY,
        NOW
      )
    ).toBe(rendering)
  })

  it("calls a step over once it is made or stopped", () => {
    expect(settled(STEP)).toBe(false)
    for (const state of ["done", "failed", "blocked", "missing"] as const)
      expect(settled({ ...STEP, state })).toBe(true)
    for (const state of ["asked", "waiting", "rendering"] as const)
      expect(settled({ ...STEP, state })).toBe(false)
  })
})
