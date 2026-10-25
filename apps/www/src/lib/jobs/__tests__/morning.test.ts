/**
 * This morning's run, as the phone knows it (RUN1): each state of the union
 * derived from a record built for it, by the Pacific day and clock, and none
 * of its words naming the machinery.
 */
import { MAX_OPEN_PICKS, TRACKS } from "@some-ui/job-desk"
import { describe, expect, it } from "vitest"

import { MACHINERY } from "@/lib/home-link/__tests__/machinery"
import type { JobsState } from "@/lib/jobs/model"
import { EMPTY, step } from "@/lib/jobs/model"
import type { Morning, MorningId } from "@/lib/jobs/morning"
import {
  MORNING_IDS,
  MORNING_LEGEND,
  morningLabel,
  morningOf,
  morningRoad,
  morningSaid,
} from "@/lib/jobs/morning"

import { digest } from "./fixture"

const DAY = "2026-10-22"
/** 07:00, 08:30 and 10:00 on the 22nd in Los Angeles. */
const BEFORE = new Date("2026-10-22T14:00:00Z")
const RUNNING = new Date("2026-10-22T15:30:00Z")
const AFTER = new Date("2026-10-22T17:00:00Z")

const holding = (d = digest(DAY)): JobsState =>
  step(EMPTY, { type: "fetched", digests: [d], at: "2026-10-22T15:10:00Z" })

const lookedAt = (at: string | null): JobsState => ({
  ...EMPTY,
  home: { ...EMPTY.home, lookedAt: at },
})

function passedAll(state: JobsState): JobsState {
  return digest(DAY).picks.reduce(
    (s, pick, i) =>
      step(s, {
        type: "record",
        event: {
          type: "passed",
          day: DAY,
          pickId: pick.id,
          fingerprint: pick.fingerprint,
          reasons: [],
          note: "",
          voice: [],
        },
        stamp: { id: `e${i}`, at: "2026-10-22T16:00:00Z" },
      }),
    state
  )
}

const none = { ...digest(DAY), picks: [] }
const full = {
  ...none,
  queue: {
    open: TRACKS.flatMap((track) =>
      Array.from({ length: MAX_OPEN_PICKS[track] }, (_, i) => ({
        day: "2026-10-20",
        pickId: `${track}-${i}`,
        track,
        closed: false,
      }))
    ),
    lapsed: [],
  },
}

/** A record and a moment for each state. */
const CASES: Readonly<
  Record<MorningId, { state: JobsState; kept: boolean; now: Date }>
> = {
  picked: { state: holding(), kept: true, now: AFTER },
  decided: { state: passedAll(holding()), kept: true, now: AFTER },
  rested: { state: holding(none), kept: true, now: AFTER },
  full: { state: holding(full), kept: true, now: AFTER },
  before: { state: EMPTY, kept: true, now: BEFORE },
  running: {
    state: lookedAt("2026-10-22T15:20:00Z"),
    kept: true,
    now: RUNNING,
  },
  // Heard from home before the run was due, so home's answer says nothing yet.
  away: { state: lookedAt("2026-10-22T16:00:00Z"), kept: true, now: AFTER },
  quiet: { state: lookedAt("2026-10-22T16:30:00Z"), kept: true, now: AFTER },
  "not-kept": { state: EMPTY, kept: false, now: AFTER },
}

describe("this morning's run", () => {
  it.each(MORNING_IDS)("reaches %s from its record", (id) => {
    const { state, kept, now } = CASES[id]
    expect(morningOf(state, kept, now).id).toBe(id)
  })

  it("counts what it picked and what still waits", () => {
    const m = morningOf(holding(), true, AFTER)
    expect(m).toMatchObject({ picked: 2, undecided: 2, seen: 12 })
  })

  it("counts a look at home from an earlier day as no look since the run", () => {
    expect(morningOf(lookedAt("2026-10-21T20:00:00Z"), true, AFTER).id).toBe(
      "away"
    )
    expect(morningOf(lookedAt(null), true, AFTER).id).toBe("away")
  })

  it("says the day by the Pacific clock, not UTC's", () => {
    // 23:59 on the 22nd in Los Angeles, the 23rd in UTC: today's run held.
    const late = new Date("2026-10-23T06:59:00Z")
    expect(morningOf(holding(), true, late).id).toBe("picked")
  })

  it("draws a whole road for every state", () => {
    for (const id of MORNING_IDS) {
      const road = morningRoad(id)
      expect(road.marks).toHaveLength(road.stops.length)
      expect(road.legs).toHaveLength(road.stops.length - 1)
    }
  })

  it("says nothing of the machinery, in any state", () => {
    const said = MORNING_IDS.flatMap((id) => {
      const { state, kept, now } = CASES[id]
      const m: Morning = morningOf(state, kept, now)
      // The largest counts a run makes, as the fit fixture draws them.
      const big = { ...m, picked: 5, undecided: 4, seen: 48 }
      return [m, big].flatMap((x) => {
        const s = morningSaid(x, now)
        return [s.title, s.line, morningLabel(s)]
      })
    })
    const legend = Object.values(MORNING_LEGEND)
    expect([...said, ...legend].filter((text) => MACHINERY.test(text))).toEqual(
      []
    )
  })
})
