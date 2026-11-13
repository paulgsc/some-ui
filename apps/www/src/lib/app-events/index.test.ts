/**
 * @vitest-environment jsdom
 *
 * What this phone saw happen as it ran (CK2): every take ending as the
 * event names it, kept to wait for home, at most `APP_EVENTS_WAITING`, and
 * let go only by id once home holds it.
 */
import type { TakeEnded, TakeOutcome } from "@some-ui/voice-capture"
import { afterEach, describe, expect, it } from "vitest"

import type { AppEvent } from "@/lib/app-events"
import {
  APP_EVENTS_WAITING,
  appEventsRevision,
  appEventsWaiting,
  keepAppEvent,
  letGoHeldAppEvents,
  recordEngagement,
  TAKE_WENT,
  takeEventOf,
} from "@/lib/app-events"

const ended = (over: Partial<TakeEnded> = {}): TakeEnded => ({
  seq: 1,
  answers: "the item, never sent",
  ending: "kept",
  id: "k1",
  reason: null,
  unheard: false,
  ...over,
})

const outcome = (over: Partial<TakeOutcome> = {}): TakeOutcome => ({
  screen: "jobs.notes",
  ended: ended(),
  startedAt: Date.UTC(2026, 10, 3, 9, 0),
  readyMs: 310,
  durationMs: 4_200,
  peak: 0.312_345,
  ...over,
})

const event = (id: string): AppEvent =>
  takeEventOf(outcome(), id, "42a72b958", 0)

afterEach(() => {
  letGoHeldAppEvents(new Set(appEventsWaiting().map((e) => e.id)))
})

describe("a take's outcome as an event", () => {
  it("names the process, screen, ending and how it went, and nothing the take was about", () => {
    expect(takeEventOf(outcome(), "e1", "42a72b958", 0)).toEqual({
      family: "outcome",
      id: "e1",
      at: "2026-11-03T09:00:00.000Z",
      build: "42a72b958",
      process: "phone-recording",
      screen: "jobs.notes",
      ending: "kept",
      went: "worked",
      readyMs: 310,
      durationMs: 4_200,
      peak: 0.312,
    })
    expect(JSON.stringify(takeEventOf(outcome(), "e1", null, 0))).not.toContain(
      "the item"
    )
  })

  it.each([
    [ended({ ending: "kept", unheard: true }), "kept-unheard", "failed"],
    [
      ended({ ending: "blocked", reason: "denied" }),
      "blocked-denied",
      "failed",
    ],
    [
      ended({ ending: "blocked", reason: "elsewhere" }),
      "blocked-elsewhere",
      "stopped",
    ],
    [ended({ ending: "blocked", reason: null }), "blocked-failed", "failed"],
  ] as const)("names %o as %s, which %s", (end, ending, went) => {
    const named = takeEventOf(outcome({ ended: end }), "e1", null, 0)
    expect([named.ending, named.went]).toEqual([ending, went])
  })

  it("gives every ending id a name home takes: lowercase words joined by hyphens", () => {
    for (const id of Object.keys(TAKE_WENT)) {
      expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    }
  })

  it("stamps a take the kit did not time with when it ended", () => {
    const untimed = outcome({
      startedAt: null,
      readyMs: null,
      durationMs: null,
      peak: null,
    })
    expect(
      takeEventOf(untimed, "e1", null, Date.UTC(2026, 10, 3))
    ).toMatchObject({
      at: "2026-11-03T00:00:00.000Z",
      readyMs: null,
      durationMs: null,
      peak: null,
    })
  })
})

describe("the events waiting for home (TE2)", () => {
  it("keeps each newest first, and moves its revision on each change", () => {
    const before = appEventsRevision()
    expect(keepAppEvent(event("e1"))).toBe(true)
    expect(keepAppEvent(event("e2"))).toBe(true)
    expect(appEventsWaiting().map((e) => e.id)).toEqual(["e2", "e1"])
    expect(appEventsRevision()).toBe(before + 2)
    letGoHeldAppEvents(new Set(["e1"]))
    expect(appEventsWaiting().map((e) => e.id)).toEqual(["e2"])
    letGoHeldAppEvents(new Set())
    expect(appEventsRevision()).toBe(before + 3)
  })

  it("refuses a new one once full, and lets none of the waiting ones go for it", () => {
    for (let i = 0; i < APP_EVENTS_WAITING; i += 1) keepAppEvent(event(`e${i}`))
    expect(keepAppEvent(event("one-more"))).toBe(false)
    const waiting = appEventsWaiting()
    expect(waiting).toHaveLength(APP_EVENTS_WAITING)
    expect(waiting.at(-1)?.id).toBe("e0")
  })
})

describe("an engagement event (ENG2)", () => {
  const taken = {
    kind: "taken",
    pipeline: "topik",
    affordance: "routine-lens",
    surface: "apk",
    at: "2026-11-03T09:00:00.000Z",
  } as const

  it("waits beside the outcomes as exactly its kind's fields, under an id and the build", () => {
    expect(recordEngagement(taken, "42a72b958", "g1")).toBe(true)
    keepAppEvent(event("e1"))
    expect(appEventsWaiting().map((e) => e.family)).toEqual([
      "outcome",
      "engagement",
    ])
    expect(appEventsWaiting()[1]).toEqual({
      ...taken,
      family: "engagement",
      id: "g1",
      build: "42a72b958",
    })
  })

  it("is refused when the registry doesn't list it", () => {
    expect(
      recordEngagement({ ...taken, affordance: "no-such-thing" }, null, "g1")
    ).toBe(false)
    expect(appEventsWaiting()).toEqual([])
  })

  it("reads back by its shape alone, so one kept under an earlier registry still goes", () => {
    const kept = {
      ...taken,
      affordance: "since-retired",
      family: "engagement",
      id: "g1",
      build: null,
    }
    localStorage.setItem("some-ui:app-events", JSON.stringify([kept]))
    keepAppEvent(event("e1"))
    expect(appEventsWaiting().map((e) => e.id)).toEqual(["e1", "g1"])
  })

  it("is not read back with a field outside its kind's", () => {
    const said = {
      ...taken,
      family: "engagement",
      id: "g1",
      build: null,
      words: "what I said",
    }
    localStorage.setItem("some-ui:app-events", JSON.stringify([said]))
    keepAppEvent(event("e1"))
    expect(appEventsWaiting().map((e) => e.id)).toEqual(["e1"])
  })
})
