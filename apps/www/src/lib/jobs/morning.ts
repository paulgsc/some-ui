/**
 * What this morning's run did, as this phone knows it (RUN1, #2052): one
 * closed set of states, each with one theme, one stop for its icon, one road
 * and one set of words, drawn by Today's title bar in J0's language
 * (`components/journey-status`). Pure, and the one place these words live,
 * so they say what the run did and what this phone holds, never how it
 * travels (`__tests__/morning.test.ts`).
 *
 * Every run leaves a record of itself, a stopped one included (RUN2), which
 * home keeps and this phone reads (RUN3): a run that couldn't do all it set
 * out to is `trouble`, with the first reason it gave, whatever else is held.
 * Of two records one morning (a re-run), the one that added the picks
 * speaks, so a re-run that stops because the picks were in doesn't turn a
 * good morning into trouble. `quiet` is home answering, after the run was
 * due, with no picks and, from a home that keeps them, no record of a run.
 *
 * The phone can say home has no word of the run only from what home told it
 * after the run was due: a look made before then says only when it last
 * heard from home (`away`).
 */
import { assertNever, counted } from "@some-ui/core-utils"
import type { JobsRun } from "@some-ui/job-desk"
import { pacificDay, PICKS_PER_DAY } from "@some-ui/job-desk"

import type { JourneyTheme, Mark, Road, Said, Stop } from "@/lib/journey"
import { whenSaid } from "@/lib/journey"

import type { JobsState } from "./model"
import { decisionOf, digestOf, pacificMinutes, placesFull } from "./model"

/** When the scheduled run starts, Pacific (`packages/job-desk/ROUTINE.md`). */
const RUN_STARTS = { hour: 7, minute: 52 }

/**
 * Its picks reach home by then: a run takes minutes (8.5 on record), so an
 * hour is room to spare, and home's pass is every 15 minutes.
 */
const DUE_AFTER_MINUTES = 60 + 15

export const MORNING_IDS = [
  "picked",
  "decided",
  "rested",
  "full",
  "trouble",
  "before",
  "running",
  "away",
  "quiet",
  "not-kept",
] as const

export type MorningId = (typeof MORNING_IDS)[number]

/** This morning's run, and what its words need. */
export type Morning = {
  readonly id: MorningId
  /** How many it picked, and how many of those wait on a decision. */
  readonly picked: number
  readonly undecided: number
  /** How many postings it read. */
  readonly seen: number
  /** When this phone last heard from home (ISO), or null. */
  readonly lookedAt: string | null
  /** For `trouble`: the first reason the run gave, as it wrote it. */
  readonly problem: string | null
  /** For `quiet`: home keeps the runs' records, and holds none this morning. */
  readonly unrecorded: boolean
  /**
   * For `trouble`: the run put today's picks in Drive, and this phone doesn't
   * hold them, so Drive is the way in.
   */
  readonly inDrive: boolean
}

const STARTS = RUN_STARTS.hour * 60 + RUN_STARTS.minute
const DUE = STARTS + DUE_AFTER_MINUTES

/** Whether `at` falls on Pacific day `today` at or after the run was due. */
function afterDue(at: Date, today: string): boolean {
  return pacificDay(at) === today && pacificMinutes(at) >= DUE
}

/**
 * The record that speaks for Pacific day `today`'s run, of `runs` (newest
 * first): the newest that added the picks, or else the newest, or null.
 */
function runOf(runs: ReadonlyArray<JobsRun>, today: string): JobsRun | null {
  const todays = runs.filter((r) => pacificDay(new Date(r.startedAt)) === today)
  return todays.find((r) => r.added.length > 0) ?? todays.at(0) ?? null
}

/** This morning's run at `now`, given whether Jobs is kept on home. */
export function morningOf(state: JobsState, kept: boolean, now: Date): Morning {
  const today = pacificDay(now)
  const digest = digestOf(state, today)
  const { lookedAt, runs } = state.home
  const run = runs === null ? null : runOf(runs, today)
  const base = {
    picked: 0,
    undecided: 0,
    seen: 0,
    lookedAt,
    problem: null,
    unrecorded: false,
    inDrive: false,
  }
  if (digest !== null) {
    const picked = digest.picks.length
    const undecided = digest.picks.filter(
      (p) => decisionOf(state, today, p.id) === null
    ).length
    const counts = { ...base, picked, undecided, seen: digest.seen }
    if (run !== null && run.outcome !== "done") {
      return { ...counts, id: "trouble", problem: run.problems[0] ?? null }
    }
    if (picked > 0) {
      return { id: undecided > 0 ? "picked" : "decided", ...counts }
    }
    return { id: placesFull(digest) ? "full" : "rested", ...counts }
  }
  if (run !== null && run.outcome !== "done") {
    return {
      ...base,
      id: "trouble",
      problem: run.problems[0] ?? null,
      inDrive: run.added.length > 0,
    }
  }
  const minutes = pacificMinutes(now)
  if (minutes < STARTS) return { id: "before", ...base }
  if (minutes < DUE) return { id: "running", ...base }
  if (!kept) return { id: "not-kept", ...base }
  const heard = lookedAt !== null && afterDue(new Date(lookedAt), today)
  if (!heard) return { id: "away", ...base }
  return { ...base, id: "quiet", unrecorded: runs !== null && run === null }
}

/** Whether `m` offers the picker: where Drive is a real way in. */
export function offersDrive(m: Morning): boolean {
  return m.id === "away" || m.id === "quiet" || m.id === "not-kept" || m.inDrive
}

/** The road a run's picks take: home's, or Drive's by the share sheet. */
const HOME_ROAD: ReadonlyArray<Stop> = ["run", "mailbox", "home", "phone"]
const DRIVE_ROAD: ReadonlyArray<Stop> = ["run", "drive", "phone"]

const R: Mark = "reached"
const U: Mark = "unconfirmed"
const A: Mark = "ahead"

const HERE: Road = {
  stops: HOME_ROAD,
  marks: [R, R, R, R],
  legs: ["passed", "passed", "passed"],
}

/** Each state's theme, the stop its icon shows, and its road. */
const SHAPES: Readonly<
  Record<MorningId, { theme: JourneyTheme; at: Stop; road: Road }>
> = {
  picked: { theme: "waiting", at: "phone", road: HERE },
  decided: { theme: "read", at: "phone", road: HERE },
  rested: { theme: "read", at: "run", road: HERE },
  full: { theme: "waiting", at: "run", road: HERE },
  // Its record came home; what it set out to do stopped at the run.
  trouble: {
    theme: "stopped",
    at: "run",
    road: {
      stops: HOME_ROAD,
      marks: ["stopped", A, A, R],
      legs: ["broken", "ahead", "ahead"],
    },
  },
  before: {
    theme: "moving",
    at: "run",
    road: {
      stops: HOME_ROAD,
      marks: [A, A, A, A],
      legs: ["ahead", "ahead", "ahead"],
    },
  },
  running: {
    theme: "moving",
    at: "run",
    road: {
      stops: HOME_ROAD,
      marks: [U, A, A, A],
      legs: ["under-way", "ahead", "ahead"],
    },
  },
  away: {
    theme: "waiting",
    at: "home",
    road: {
      stops: HOME_ROAD,
      marks: [U, A, A, R],
      legs: ["ahead", "ahead", "ahead"],
    },
  },
  quiet: {
    theme: "stopped",
    at: "home",
    road: {
      stops: HOME_ROAD,
      marks: [U, U, R, R],
      legs: ["ahead", "ahead", "passed"],
    },
  },
  "not-kept": {
    theme: "waiting",
    at: "drive",
    road: { stops: DRIVE_ROAD, marks: [U, A, R], legs: ["ahead", "ahead"] },
  },
}

export function morningTheme(id: MorningId): JourneyTheme {
  return SHAPES[id].theme
}

export function morningStop(id: MorningId): Stop {
  return SHAPES[id].at
}

export function morningRoad(id: MorningId): Road {
  return SHAPES[id].road
}

const START_TIME = `${RUN_STARTS.hour}:${String(RUN_STARTS.minute).padStart(2, "0")}`

const postings = (n: number): string => counted(n, "posting")

/** The words of `m`, at `now`. */
export function morningSaid(m: Morning, now: Date): Said {
  const heard = m.lookedAt === null ? null : whenSaid(m.lookedAt, now)
  switch (m.id) {
    case "picked": {
      return {
        title: `This morning’s run picked ${m.picked} for you`,
        line: `It read ${postings(m.seen)}. ${m.undecided === m.picked ? "Each one waits on you." : `${m.undecided} still ${m.undecided === 1 ? "waits" : "wait"} on you.`}`,
      }
    }
    case "decided": {
      return {
        title: "You’ve decided this morning’s picks",
        line: `The run picked ${m.picked} from ${postings(m.seen)}, and you’ve decided each one.`,
      }
    }
    case "rested": {
      return {
        title: "This morning’s run picked none",
        line: `It read ${postings(m.seen)} and none made the cut. “How these were picked” says why.`,
      }
    }
    case "full": {
      return {
        title: "Your places were full this morning",
        line: "The run picked none: every place was held by a pick still open. Pass on one, or send it and say how it went, and the next run fills its place.",
      }
    }
    case "trouble": {
      const why = m.problem ?? "It didn’t say why."
      const still = m.inDrive
        ? " Its picks are in Drive; open them from there."
        : m.seen === 0 && m.picked === 0
          ? ""
          : ` It still read ${postings(m.seen)} and picked ${m.picked}.`
      return { title: "This morning’s run couldn’t finish", line: why + still }
    }
    case "before": {
      return {
        title: `Today’s run is at ${START_TIME}`,
        line: `Each morning it reads new postings and picks up to ${PICKS_PER_DAY.software} software roles and ${PICKS_PER_DAY.adjacent} software-adjacent ones.`,
      }
    }
    case "running": {
      return {
        title: "This morning’s run is under way",
        line: `It started at ${START_TIME}. Its picks usually follow within the hour.`,
      }
    }
    case "away": {
      return {
        title: "Not checked with home since the run",
        line: `${heard === null ? "This phone hasn’t heard from home yet." : `This phone last heard from home at ${heard}.`} On the home Wi‑Fi, Jobs asks home each time you come back to it; or open today’s picks from Drive.`,
      }
    }
    case "quiet": {
      if (m.unrecorded) {
        return {
          title: "No word of this morning’s run",
          line: `Home had no record of a run this morning${heard === null ? "" : ` at ${heard}`}, so it may not have started. If its picks are in Drive, open them from there.`,
        }
      }
      return {
        title: "No word of this morning’s run",
        line: `Home had nothing for today that this phone could read${heard === null ? "" : ` at ${heard}`}. The run may not have finished, or its picks didn’t reach home. If they’re in Drive, open them from there.`,
      }
    }
    case "not-kept": {
      return {
        title: "Today’s picks are in Drive",
        line: "Jobs isn’t kept on home, so picks don’t come by themselves. Open them from Drive.",
      }
    }
    default: {
      return assertNever(m.id)
    }
  }
}

/** Each state as the pop-up's list names it. */
export const MORNING_LEGEND: Readonly<Record<MorningId, string>> = {
  picked: "Picks from this morning wait on you",
  decided: "You’ve decided this morning’s picks",
  rested: "The run picked none today",
  full: "Your places were full, so it picked none",
  trouble: "The run couldn’t finish, and says why",
  before: "Today’s run hasn’t started",
  running: "Today’s run is under way",
  away: "Not checked with home since the run",
  quiet: "No word of this morning’s run",
  "not-kept": "Today’s picks are in Drive",
}

/** The icon's spoken name: what the run did, and what pressing it shows. */
export function morningLabel(said: Said): string {
  return `${said.title}. Show the way its picks come`
}

/** The heading over the pop-up's list of runs. */
export const RUNS_HEADING = "The last runs"

/** One run as the pop-up lists it: when, what it added, and what it couldn't do. */
export function runSaid(run: JobsRun, now: Date): string {
  const added = run.added[0]?.title ?? "No picks added"
  const outcome =
    run.outcome === "done"
      ? ""
      : run.outcome === "stopped"
        ? " It couldn’t finish."
        : " Some of it couldn’t be done."
  const problems = run.problems.length === 0 ? "" : ` ${run.problems.join(" ")}`
  return `${whenSaid(run.startedAt, now)}: ${added}.${outcome}${problems}`
}
