/**
 * This morning's run, as the phone knows it (RUN1, RUN3): each state of the
 * union derived from a record built for it, by the Pacific day and clock and
 * the runs' records home told, and none of its words naming the machinery.
 */
import type { JobsRun } from "@some-ui/job-desk"
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
  morningSign,
  morningStop,
  offersDrive,
  runSaid,
} from "@/lib/jobs/morning"

import { digest, run } from "./fixture"

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

/** `state`, with home having told these runs' records, newest first. */
const told = (state: JobsState, runs: ReadonlyArray<JobsRun>): JobsState => ({
  ...state,
  home: { ...state.home, runs },
})

/** 07:52 on the 22nd in Los Angeles, and a re-run at 09:00. */
const MORNING = "2026-10-22T14:52:07Z"
const RERUN = "2026-10-22T16:00:00Z"
const STOPPED = run(MORNING, "stopped")
const PARTLY = run(MORNING, "partly", ["One voice note couldn’t be heard."])

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
  stopped: {
    state: told(lookedAt("2026-10-22T16:30:00Z"), [STOPPED]),
    kept: true,
    now: AFTER,
  },
  partly: { state: told(holding(), [PARTLY]), kept: true, now: AFTER },
  "partly-in-drive": {
    state: told(lookedAt("2026-10-22T16:30:00Z"), [PARTLY]),
    kept: true,
    now: AFTER,
  },
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

  it("says a stopped run stopped, with its first reason, however early", () => {
    const heard = told(lookedAt("2026-10-22T15:05:00Z"), [STOPPED])
    for (const now of [RUNNING, AFTER]) {
      const m = morningOf(heard, true, now)
      expect(m).toMatchObject({ id: "stopped", problem: STOPPED.problems[0] })
      expect(morningSaid(m, now)).toEqual({
        title: "This morning’s run stopped",
        line: STOPPED.problems[0],
      })
    }
  })

  it("says a run that left something undone did only part of it, and what it still picked", () => {
    const m = morningOf(told(holding(), [PARTLY]), true, AFTER)
    expect(m).toMatchObject({ id: "partly", picked: 2, seen: 12 })
    expect(morningSaid(m, AFTER).title).toBe(
      "This morning’s run did only part of it"
    )
    expect(morningSaid(m, AFTER).line).toBe(
      "One voice note couldn’t be heard. It still read 12 postings and picked 2."
    )
  })

  it("offers Drive for a run whose picks are there but not on this phone", () => {
    const heard = told(lookedAt("2026-10-22T16:30:00Z"), [PARTLY])
    const m = morningOf(heard, true, AFTER)
    expect(m.id).toBe("partly-in-drive")
    expect(offersDrive(m)).toBe(true)
    expect(morningSaid(m, AFTER).line).toBe(
      "One voice note couldn’t be heard. Its picks are in Drive, not on this phone; open them from there."
    )
    // A stopped run put nothing in Drive, and picks this phone holds need none.
    const stopped = morningOf(told(heard, [STOPPED]), true, AFTER)
    expect(offersDrive(stopped)).toBe(false)
    expect(offersDrive(morningOf(told(holding(), [PARTLY]), true, AFTER))).toBe(
      false
    )
  })

  it("lets the run that added the picks speak for a morning re-run", () => {
    // The re-run stopped because today's picks were already in.
    const rerun = run(RERUN, "stopped", [
      "Today’s picks were already in Drive, so this run added none.",
    ])
    const morning = told(holding(), [rerun, run(MORNING)])
    expect(morningOf(morning, true, AFTER).id).toBe("picked")
  })

  it("hears nothing of today from yesterday's stopped run", () => {
    const yesterday = run("2026-10-21T14:52:07Z", "stopped")
    const heard = told(lookedAt("2026-10-22T16:30:00Z"), [yesterday])
    expect(morningOf(heard, true, AFTER)).toMatchObject({
      id: "quiet",
      unrecorded: true,
    })
  })

  it("says home has no record of a run only from a home that keeps them", () => {
    const at = "2026-10-22T16:30:00Z"
    const keeps = morningOf(told(lookedAt(at), []), true, AFTER)
    expect(keeps).toMatchObject({ id: "quiet", unrecorded: true })
    expect(morningSaid(keeps, AFTER).line).toMatch(
      /^Home had no record of a run/
    )
    const keepsNone = morningOf(lookedAt(at), true, AFTER)
    expect(keepsNone).toMatchObject({ id: "quiet", unrecorded: false })
  })

  it("gives each state a form of its own: its icon's stop and sign", () => {
    const forms = MORNING_IDS.map(
      (id) => `${morningStop(id)} ${morningSign(id)}`
    )
    expect(new Set(forms).size).toBe(MORNING_IDS.length)
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
    const runs = [STOPPED, PARTLY, run(MORNING)].map((r) => runSaid(r, AFTER))
    expect(
      [...said, ...legend, ...runs].filter((text) => MACHINERY.test(text))
    ).toEqual([])
  })
})
