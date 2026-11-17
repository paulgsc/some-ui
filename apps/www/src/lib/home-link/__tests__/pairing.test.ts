/**
 * #3152: whether this phone is paired, as one answer with `reading` for not
 * known yet (`../model`'s `Pairing`), derived from the link's state alone.
 * Every state the link can be in × every event, each held to the pairing
 * transitions the link allows:
 *
 * - `reading` leaves only on the record's read, to `paired` or `unpaired`;
 * - `unpaired` becomes `paired` only by a pairing made;
 * - `paired` becomes `unpaired` only by an unpair, or another pairing only
 *   by pairing again;
 * - nothing returns to `reading`.
 *
 * Each way the record's read can end (a pairing, none, one lost, one it
 * couldn't read) lands in a known answer.
 *
 * A run asked for while the record is read waits as the link's state
 * (`parked`), and the read's end releases every one of them with what it
 * found (`releasedBy`); nothing else releases one, and none parks once the
 * read has ended. Why a run is turned away is `refusalOf`, which `step`
 * reads, so a refusal is said exactly when the step refuses.
 */
import { assertNever } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

import type {
  HomeLinkEvent,
  HomeLinkState,
  Pairing,
  RunStart,
} from "@/lib/home-link/model"
import {
  INITIAL,
  pairingIn,
  READING,
  refusalOf,
  releasedBy,
  samePairing,
  step,
  UNPAIRED,
} from "@/lib/home-link/model"

const BASE = "https://home.example/api/v1"

const run = (
  events: ReadonlyArray<HomeLinkEvent>,
  from: HomeLinkState = INITIAL
): HomeLinkState => events.reduce(step, from)

const READ_P1: HomeLinkEvent = {
  type: "read",
  found: { base: BASE, id: "p1", since: 1, name: null },
}

/** One of each event, so a new kind of event fails here until it has one. */
const EVENTS = {
  read: [
    READ_P1,
    { type: "read", found: null },
    { type: "read", found: "lost" },
    { type: "read", found: "unreadable" },
  ],
  pairPressed: [{ type: "pairPressed", base: BASE }],
  paired: [{ type: "paired", base: BASE, id: "p2", at: 5, name: null }],
  pairFailed: [{ type: "pairFailed", failure: "bad-code" }],
  unpairPressed: [{ type: "unpairPressed" }],
  unpaired: [
    { type: "unpaired", told: true },
    { type: "unpaired", told: false },
  ],
  unpairFailed: [{ type: "unpairFailed" }],
  syncPressed: [{ type: "syncPressed" }],
  sendPressed: [{ type: "sendPressed" }],
  keepStarted: [{ type: "keepStarted" }],
  stopPressed: [{ type: "stopPressed" }],
  drainStarted: [{ type: "drainStarted" }],
  drainStopped: [{ type: "drainStopped" }],
  drainEnded: [{ type: "drainEnded" }],
  workEnded: [{ type: "workEnded" }],
  homeBusy: [{ type: "homeBusy", until: 9, base: BASE }],
  cooled: [{ type: "cooled", at: 9 }],
  heard: [
    { type: "heard", id: "p1", known: true, at: 3 },
    { type: "heard", id: "p1", known: false, at: 3 },
  ],
  unanswered: [{ type: "unanswered", now: 4 }],
  answered: [{ type: "answered" }],
  lapsed: [{ type: "lapsed" }],
  lookAgain: [
    { type: "lookAgain", fresh: true },
    { type: "lookAgain", fresh: false },
  ],
  blocked: [{ type: "blocked", reason: "name", at: 4 }],
  unblocked: [{ type: "unblocked" }],
  parked: [
    { type: "parked", ticket: 1 },
    { type: "parked", ticket: 2 },
  ],
} satisfies {
  readonly [K in HomeLinkEvent["type"]]: ReadonlyArray<
    Extract<HomeLinkEvent, { type: K }>
  >
}

const ALL_EVENTS: ReadonlyArray<HomeLinkEvent> = Object.values(EVENTS).flat()

const PAIRED = run([READ_P1])
const FORGOTTEN = run(
  [{ type: "heard", id: "p1", known: false, at: 3 }],
  PAIRED
)
const UNPAIRED_STATE = run([{ type: "read", found: null }])

/** The link's states, by how it got there. */
const STATES: Readonly<Record<string, HomeLinkState>> = {
  reading: INITIAL,
  "reading, an ask parked": run([{ type: "parked", ticket: 1 }]),
  paired: PAIRED,
  "paired, known": run(
    [{ type: "heard", id: "p1", known: true, at: 3 }],
    PAIRED
  ),
  "paired, forgotten": FORGOTTEN,
  unpaired: UNPAIRED_STATE,
  lost: run([{ type: "read", found: "lost" }]),
  unreadable: run([{ type: "read", found: "unreadable" }]),
  "pairing, from unpaired": run(
    [{ type: "pairPressed", base: BASE }],
    UNPAIRED_STATE
  ),
  "pairing, over forgotten": run(
    [{ type: "pairPressed", base: BASE }],
    FORGOTTEN
  ),
  unpairing: run([{ type: "unpairPressed" }], PAIRED),
  syncing: run([{ type: "syncPressed" }], PAIRED),
  draining: run([{ type: "drainStarted" }], PAIRED),
  away: run([{ type: "unanswered", now: 4 }], PAIRED),
}

/** Whether `event` may move the pairing from `before` to `after`. */
function allowed(
  before: Pairing,
  after: Pairing,
  event: HomeLinkEvent
): boolean {
  if (samePairing(before, after)) return true
  // Nothing returns to not known.
  if (after.kind === "reading") return false
  switch (before.kind) {
    case "reading": {
      return event.type === "read"
    }
    case "unpaired": {
      return after.kind === "paired" && event.type === "paired"
    }
    case "paired": {
      return after.kind === "unpaired"
        ? event.type === "unpaired"
        : event.type === "paired"
    }
    default: {
      return assertNever(before)
    }
  }
}

describe("whether this phone is paired (#3152)", () => {
  it("moves only along the transitions the link allows, from every state on every event", () => {
    for (const [name, state] of Object.entries(STATES)) {
      const before = pairingIn(state)
      for (const event of ALL_EVENTS) {
        const after = pairingIn(step(state, event))
        expect(
          allowed(before, after, event),
          `${name} --${JSON.stringify(event)}--> ${JSON.stringify(after)}`
        ).toBe(true)
      }
    }
  })

  it("is not known while the record is read, and known however the read ends", () => {
    expect(pairingIn(INITIAL)).toEqual(READING)
    expect(pairingIn(PAIRED)).toEqual({ kind: "paired", id: "p1" })
    for (const found of [null, "lost", "unreadable"] as const) {
      expect(pairingIn(run([{ type: "read", found }]))).toEqual(UNPAIRED)
    }
  })

  it("keeps saying paired while home has forgotten the phone, or a pairing again is under way", () => {
    expect(pairingIn(FORGOTTEN)).toEqual({ kind: "paired", id: "p1" })
    expect(pairingIn(STATES["pairing, over forgotten"] ?? INITIAL)).toEqual({
      kind: "paired",
      id: "p1",
    })
  })

  it("says two answers name the same pairing only by kind and id", () => {
    const p1: Pairing = { kind: "paired", id: "p1" }
    expect(samePairing(p1, { kind: "paired", id: "p1" })).toBe(true)
    expect(samePairing(p1, { kind: "paired", id: "p2" })).toBe(false)
    expect(samePairing(READING, UNPAIRED)).toBe(false)
    expect(samePairing(READING, READING)).toBe(true)
    expect(samePairing(p1, UNPAIRED)).toBe(false)
  })
})

const STARTS: ReadonlyArray<RunStart> = [
  { type: "syncPressed" },
  { type: "sendPressed" },
  { type: "keepStarted" },
  { type: "drainStarted" },
]

/** What a run's start changes: the person's side, or the drain's. */
const started = (before: HomeLinkState, after: HomeLinkState): boolean =>
  before.activity !== after.activity || before.drain !== after.drain

describe("a run asked for while the record is read (#3152)", () => {
  const PARKED = STATES["reading, an ask parked"] ?? INITIAL

  it("waits as the link's state, once per ticket, only while the record is read", () => {
    expect(PARKED.parked).toEqual([1])
    expect(step(PARKED, { type: "parked", ticket: 1 })).toBe(PARKED)
    expect(step(PARKED, { type: "parked", ticket: 2 }).parked).toEqual([1, 2])
    for (const [name, state] of Object.entries(STATES)) {
      if (state.link.kind === "reading") continue
      expect(step(state, { type: "parked", ticket: 9 }), name).toBe(state)
    }
  })

  it("is released by the read alone, with whatever the read found", () => {
    const two = run([{ type: "parked", ticket: 2 }], PARKED)
    for (const event of ALL_EVENTS) {
      const after = step(two, event)
      const released = releasedBy(two, after)
      if (event.type === "read") {
        expect(after.parked).toEqual([])
        const to = pairingIn(after)
        expect(to.kind).not.toBe("reading")
        expect(released).toEqual([
          { ticket: 1, to },
          { ticket: 2, to },
        ])
      } else {
        expect(released, JSON.stringify(event)).toEqual([])
        expect(after.parked.length).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it("is turned away for the reason the step refuses it, from every state", () => {
    for (const [name, state] of Object.entries(STATES)) {
      for (const start of STARTS) {
        const why = refusalOf(state, start)
        const after = step(state, start)
        expect(why === null, `${name} --${start.type}--> ${String(why)}`).toBe(
          started(state, after)
        )
        if (state.link.kind === "reading") expect(why).toBe("reading")
      }
    }
  })

  it("names each refusal", () => {
    const at = (name: string): HomeLinkState => STATES[name] ?? INITIAL
    expect(refusalOf(at("unpaired"), { type: "keepStarted" })).toBe("unpaired")
    expect(refusalOf(at("unpaired"), { type: "drainStarted" })).toBe("unpaired")
    expect(refusalOf(at("unpaired"), { type: "syncPressed" })).toBeNull()
    expect(refusalOf(at("syncing"), { type: "keepStarted" })).toBe("busy")
    expect(refusalOf(at("draining"), { type: "drainStarted" })).toBe("busy")
    expect(refusalOf(at("draining"), { type: "keepStarted" })).toBeNull()
    expect(refusalOf(at("unpairing"), { type: "sendPressed" })).toBe("pairing")
    expect(refusalOf(at("unpairing"), { type: "drainStarted" })).toBe("pairing")
    expect(
      refusalOf(at("pairing, from unpaired"), { type: "syncPressed" })
    ).toBe("pairing")
  })
})
