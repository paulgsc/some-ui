/**
 * The Cooking page's trains (LEDGER-WEB, #3425; C1116): each of the owner's
 * live goals is a train on its way to a destination, and the graph of work
 * under it is flattened into one line of the stops that gate it, each held
 * by someone. Pure: the run record (`some-ui.run/1`, `@some-ui/video-render`)
 * names the goals and their legs, and what GitHub said of each pull request,
 * workflow run and ask (`Facts`) decides where each train stands.
 *
 * Rules that hold by structure:
 *
 * - **A train stands at one stop.** Its stops are its legs in the record's
 *   order, then its destination. The first leg not done is where it stands;
 *   every leg before it is passed, every one after is ahead. A train whose
 *   legs are all done has arrived.
 * - **A stop says who holds it.** `Holder` is a closed set; each kind of leg
 *   decides its holder from what GitHub or the record says of it, and a leg
 *   whose facts couldn't be read keeps its usual holder and says so.
 * - **A goal leg is the other train.** It is done when that train arrives,
 *   and held by whoever holds that train; the record refuses goals that
 *   wait on each other, so this always ends.
 */
import { assertNever } from "@some-ui/core-utils"
import type { Lands, Leg, Phase, RunFile, RunGoal } from "@some-ui/video-render"
import { LANDS_OF, refKey } from "@some-ui/video-render"

import { COOKING_WORDS as W } from "./words"

/** Who holds a stop: the owner, a Claude session, the checks, or home. */
export const HOLDERS = ["you", "claude", "checks", "home"] as const

export type Holder = (typeof HOLDERS)[number]

type StopState = "passed" | "here" | "ahead"

/** A line of a stop's log: when, if known, and what happened. */
type LogLine = { readonly at: string | null; readonly says: string }

/** Where a stop's link goes: its page on GitHub, or the train it waits on. */
type StopLink =
  | { readonly kind: "page"; readonly url: string }
  | { readonly kind: "goal"; readonly goal: string }

export type Stop = {
  /** Its kind of leg, or the destination. */
  readonly leg: Leg["leg"] | "arrive"
  readonly label: string
  readonly state: StopState
  /** Who holds it; `null` for the destination. */
  readonly holder: Holder | null
  /** What holds it now, in the owner's words. */
  readonly now: string
  /** Since when it has stood as it does (ISO), when known. */
  readonly since: string | null
  /** What happened at it, newest first. */
  readonly log: ReadonlyArray<LogLine>
  readonly link: StopLink | null
  /** A step of the owner's that may be taken whenever they like. */
  readonly canWait: boolean
}

export type Train = {
  readonly id: string
  readonly kind: RunGoal["kind"]
  readonly lands: Lands
  readonly title: string
  readonly dest: string
  readonly motive: string
  readonly stops: ReadonlyArray<Stop>
  /** The stop it stands at: the destination once it has arrived. */
  readonly current: number
  readonly arrived: boolean
}

/** A pull request, as GitHub said of it. */
export type PrFacts = {
  readonly url: string
  readonly state: "open" | "merged" | "closed"
  readonly openedAt: string
  readonly mergedAt: string | null
  /** Its head's checks, counted; all zero before any has started. */
  readonly checks: {
    readonly waiting: number
    readonly running: number
    readonly passed: number
    readonly failed: number
    /** Checks that wait on someone's approval. */
    readonly approval: number
  }
}

/** A workflow run, as GitHub said of it. */
export type RunFacts = {
  readonly url: string
  readonly state: "approval" | "waiting" | "running" | "passed" | "failed"
  readonly startedAt: string
  readonly endedAt: string | null
}

/** An ask, as GitHub said of it. */
export type AskFacts = {
  readonly url: string
  readonly open: boolean
  readonly filedAt: string
  /** What it asks, for a leg that names the ask and no step (a decision). */
  readonly question: string
  /** What each of its steps says, in order (none for a decision). */
  readonly steps: ReadonlyArray<string>
}

/** What GitHub said, by `refKey` (pull requests, asks) and `runKey`; `null` when it couldn't be read. */
export type Facts = {
  readonly prs: ReadonlyMap<string, PrFacts | null>
  readonly runs: ReadonlyMap<string, RunFacts | null>
  readonly asks: ReadonlyMap<string, AskFacts | null>
}

export const runKey = (repo: string, run: number): string =>
  `${repo}/runs/${String(run)}`

/** What a leg says of itself before it is placed on the line. */
type Reading = {
  readonly done: boolean
  readonly label: string
  readonly holder: Holder
  readonly now: string
  readonly since: string | null
  readonly log: ReadonlyArray<LogLine>
  readonly link: StopLink | null
  readonly canWait: boolean
}

const PHASES_DONE: ReadonlySet<Phase> = new Set(["ready", "admitted"])

const newestFirst = (lines: ReadonlyArray<LogLine>): Array<LogLine> =>
  [...lines].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))

const plain = (
  label: string,
  holder: Holder,
  now: string,
  more: Partial<Reading> = {}
): Reading => ({
  done: false,
  label,
  holder,
  now,
  since: null,
  log: [],
  link: null,
  canWait: false,
  ...more,
})

function prReading(says: string, pr: PrFacts | null | undefined): Reading {
  if (pr === null || pr === undefined) return plain(says, "checks", W.unread)
  const log = newestFirst([
    { at: pr.openedAt, says: W.log.opened },
    ...(pr.mergedAt === null ? [] : [{ at: pr.mergedAt, says: W.log.merged }]),
  ])
  const more = {
    since: pr.openedAt,
    log,
    link: { kind: "page", url: pr.url },
  } as const
  switch (pr.state) {
    case "merged": {
      return plain(says, "claude", W.now.merged, {
        ...more,
        done: true,
        since: pr.mergedAt,
      })
    }
    case "closed": {
      return plain(says, "claude", W.now.closed, more)
    }
    case "open": {
      const c = pr.checks
      const total = c.waiting + c.running + c.passed + c.failed + c.approval
      if (c.approval > 0) return plain(says, "you", W.now.approve, more)
      if (c.failed > 0)
        return plain(says, "claude", W.now.checkFailed(c.failed), more)
      if (total === 0)
        return plain(says, "checks", W.now.checksNotStarted, more)
      if (c.running > 0 || c.waiting > 0)
        return plain(
          says,
          "checks",
          c.running === 0
            ? W.now.waitingForRunner
            : W.now.checksRunning(c.passed, total),
          more
        )
      return plain(says, "claude", W.now.readyToMerge, more)
    }
    default: {
      return assertNever(pr.state)
    }
  }
}

function runReading(says: string, run: RunFacts | null | undefined): Reading {
  if (run === null || run === undefined) return plain(says, "checks", W.unread)
  const log = newestFirst([
    { at: run.startedAt, says: W.log.started },
    ...(run.endedAt === null
      ? []
      : [{ at: run.endedAt, says: W.log.finished }]),
  ])
  const more = {
    since: run.startedAt,
    log,
    link: { kind: "page", url: run.url },
  } as const
  switch (run.state) {
    case "approval": {
      return plain(says, "you", W.now.approve, more)
    }
    case "waiting": {
      return plain(says, "checks", W.now.waitingForRunner, more)
    }
    case "running": {
      return plain(says, "checks", W.now.running, more)
    }
    case "passed": {
      return plain(says, "checks", W.now.done, {
        ...more,
        done: true,
        since: run.endedAt,
      })
    }
    case "failed": {
      return plain(says, "claude", W.now.runFailed, more)
    }
    default: {
      return assertNever(run.state)
    }
  }
}

/** Every train of the run, each placed by what `facts` says. */
export function trainsOf(run: RunFile, facts: Facts): Array<Train> {
  const goals = new Map(run.goals.map((g) => [g.id, g]))
  const workers = new Map(run.workers.map((w) => [w.tag, w]))
  const cleared = new Map(
    run.cleared.map((c) => [`${c.goal}/${String(c.leg)}`, c.at])
  )
  const placed = new Map<string, Train>()

  const reading = (goal: RunGoal, leg: Leg, at: number): Reading => {
    const clearedAt = cleared.get(`${goal.id}/${String(at)}`) ?? null
    switch (leg.leg) {
      case "merge": {
        return prReading(leg.says, facts.prs.get(refKey(leg.pr)))
      }
      case "run": {
        return runReading(leg.says, facts.runs.get(runKey(leg.repo, leg.run)))
      }
      case "yours": {
        const ask =
          leg.ask === undefined ? undefined : facts.asks.get(refKey(leg.ask))
        const label =
          leg.says ??
          (leg.step === undefined ? ask?.question : ask?.steps[leg.step]) ??
          (leg.step === undefined ? W.yourCall : W.stepOf(leg.step))
        const done = clearedAt !== null || ask?.open === false
        return plain(label, "you", ask === null ? W.unread : W.now.yours, {
          done,
          since: clearedAt ?? ask?.filedAt ?? null,
          log: newestFirst([
            ...(ask?.filedAt === undefined
              ? []
              : [{ at: ask.filedAt, says: W.log.asked }]),
            ...(clearedAt === null
              ? []
              : [{ at: clearedAt, says: W.log.youDone }]),
          ]),
          link:
            ask === undefined || ask === null
              ? null
              : { kind: "page", url: ask.url },
          canWait: leg.canWait === true,
        })
      }
      case "home": {
        return plain(leg.says, "home", W.now.home, {
          done: clearedAt !== null,
          since: clearedAt,
          log:
            clearedAt === null ? [] : [{ at: clearedAt, says: W.log.homeDone }],
        })
      }
      case "work": {
        const worker = workers.get(leg.worker)
        const log = newestFirst(worker?.log ?? [])
        return plain(
          leg.says,
          "claude",
          worker === undefined ? W.unread : W.phase[worker.phase],
          {
            done: worker !== undefined && PHASES_DONE.has(worker.phase),
            since: log.at(-1)?.at ?? null,
            log,
          }
        )
      }
      case "goal": {
        const other = place(leg.goal)
        // Once it has arrived, the one who held its last leg.
        const at = other.stops.at(other.arrived ? -2 : other.current)
        return plain(
          W.waitsOn(other.title),
          at?.holder ?? "claude",
          at?.now ?? W.unread,
          {
            done: other.arrived,
            since: at?.since ?? null,
            link: { kind: "goal", goal: other.id },
          }
        )
      }
      default: {
        return assertNever(leg)
      }
    }
  }

  const place = (id: string): Train => {
    const known = placed.get(id)
    if (known !== undefined) return known
    const goal = goals.get(id)
    if (goal === undefined) throw new Error(`no goal ${id}`)
    const readings = goal.legs.map((leg, at) => reading(goal, leg, at))
    const first = readings.findIndex((r) => !r.done)
    const current = first === -1 ? readings.length : first
    // A leg further down the line that is already done (a train it waits on
    // that has arrived) draws as passed: the line says what is left.
    const state = (at: number): StopState =>
      at < current || readings[at]?.done === true
        ? "passed"
        : at === current
          ? "here"
          : "ahead"
    const stops: Array<Stop> = [
      ...readings.map((r, at) => ({
        leg: goal.legs[at]?.leg ?? "home",
        label: r.label,
        state: state(at),
        holder: r.holder,
        now: r.done ? W.now.done : r.now,
        since: r.since,
        log: r.log,
        link: r.link,
        canWait: r.canWait,
      })),
      {
        leg: "arrive",
        label: goal.dest,
        state: first === -1 ? "here" : "ahead",
        holder: null,
        now: first === -1 ? W.now.arrived : W.now.notYet,
        since: null,
        log: [],
        link: null,
        canWait: false,
      },
    ]
    const train: Train = {
      id: goal.id,
      kind: goal.kind,
      lands: LANDS_OF[goal.kind],
      title: goal.title,
      dest: goal.dest,
      motive: goal.motive,
      stops,
      current,
      arrived: first === -1,
    }
    placed.set(id, train)
    return train
  }

  return run.goals.map((g) => place(g.id))
}

/** The stop a train stands at. */
export const hereOf = (train: Train): Stop => {
  const stop = train.stops.at(train.current)
  if (stop === undefined) throw new Error(`${train.id} stands nowhere`)
  return stop
}

/** Trains in a fixed order by id, to break a tie. */
export const byId = (a: Train, b: Train): number => a.id.localeCompare(b.id)

/** Two times in order, the unknown last; ISO times sort as text. */
export const bySince = (a: string | null, b: string | null): number =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1

/** Whether the train waits on the owner where it stands. */
export const onYou = (train: Train): boolean =>
  !train.arrived && hereOf(train).holder === "you"
