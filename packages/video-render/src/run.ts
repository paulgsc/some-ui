/**
 * A coordinator's run: what GitHub can't know about the work in flight,
 * kept as one ```` ```json run ```` block in the body of the run's `[ORCH]`
 * issue, labelled `orch` (`RUN_LABEL`). The desktop web's Cooking page
 * (`apps/www`, `lib/cooking`) joins it to what GitHub holds: pull requests,
 * their checks, workflow runs and asks (C1115).
 *
 * The record names the owner's live goals, each of a kind known here
 * (`GOAL_KINDS`), and the legs that stand between each goal and its arrival,
 * in order: a worker's work, a pull request to merge, a workflow run, a step
 * of an ask that is the owner's, another goal, or something home does. The
 * order of legs is the record's, per goal, because the same kind of goal
 * waits on different things from one day to the next (C1162).
 *
 * ```json run
 * {
 *   "schema": "some-ui.run/1",
 *   "day": "2026-11-22",
 *   "goals": [
 *     {
 *       "id": "G2", "kind": "install-apk",
 *       "title": "Install the latest APK", "dest": "The new app on your S21",
 *       "motive": "The phone gets today's app.",
 *       "legs": [
 *         { "leg": "run", "repo": "some-ui", "run": 45065710340, "says": "The APK is built" },
 *         { "leg": "yours", "ask": { "repo": "some-ui", "kind": "issue", "number": 3433 }, "step": 4 }
 *       ]
 *     }
 *   ],
 *   "workers": [],
 *   "cleared": []
 * }
 * ```
 *
 * Every `says`, `title`, `dest`, `motive` and log line is written for the
 * owner, in plain words: the page shows them as they are. Pure.
 */
import { z } from "zod"

import type { Parsed } from "./cut-list"
import { parseFenced } from "./fence"
import { words } from "./format"
import { epicTag, IssueSchema, PrSchema, WORK_REPOS } from "./refs"

/** The schema a run block is filed in. */
export const RUN_SCHEMA = "some-ui.run/1"

/** The label every `[ORCH]` issue carries, so the page finds the run's. */
export const RUN_LABEL = "orch"

/** The kinds of goal. A goal of a new kind is a new member here. */
export const GOAL_KINDS = [
  "deploy-home",
  "install-apk",
  "watch-on-phone",
  "publish-site",
  "land-change",
] as const

export type GoalKind = (typeof GOAL_KINDS)[number]

/** Where a goal lands: the Cooking page's chips. */
export const LANDS = ["home", "phone", "site", "code"] as const

export type Lands = (typeof LANDS)[number]

/** Where each kind of goal lands; a kind missing here doesn't compile. */
export const LANDS_OF = {
  "deploy-home": "home",
  "install-apk": "phone",
  "watch-on-phone": "phone",
  "publish-site": "site",
  "land-change": "code",
} as const satisfies Record<GoalKind, Lands>

/** A goal's id in the run: "G1". */
const goalId = z.string().regex(/^G[1-9]\d{0,2}$/)

/** One leg between a goal and its arrival. */
export const LegSchema = z.discriminatedUnion("leg", [
  /** A worker's work, until it is ready to be checked (`phase`). */
  z.strictObject({ leg: z.literal("work"), worker: epicTag, says: words }),
  /** A pull request, until it merges. */
  z.strictObject({ leg: z.literal("merge"), pr: PrSchema, says: words }),
  /** A workflow run, until it succeeds: a build, a deploy. */
  z.strictObject({
    leg: z.literal("run"),
    repo: z.enum(WORK_REPOS),
    run: z.number().int().positive(),
    says: words,
  }),
  /**
   * Something only the owner does: a step of a checklist ask (by its place
   * in the ask's `steps`), a decision ask (an ask with no step), or, with no
   * ask, what `says` says. `canWait` marks one the owner may take whenever
   * they like.
   */
  z.strictObject({
    leg: z.literal("yours"),
    ask: IssueSchema.optional(),
    step: z.number().int().nonnegative().optional(),
    says: words.optional(),
    canWait: z.boolean().optional(),
  }),
  /** Another goal of the run, until it arrives. */
  z.strictObject({ leg: z.literal("goal"), goal: goalId }),
  /** Something home does on its own: hearing a take, rendering an essay. */
  z.strictObject({ leg: z.literal("home"), says: words }),
])

export type Leg = z.infer<typeof LegSchema>

const GoalSchema = z.strictObject({
  id: goalId,
  kind: z.enum(GOAL_KINDS),
  /** What the owner wants, in a few words: "Deploy home". */
  title: words,
  /** Where it arrives: "Home runs today's release". */
  dest: words,
  /** Why, in a sentence or two. */
  motive: words,
  legs: z.array(LegSchema).min(1).max(12),
})

export type RunGoal = z.infer<typeof GoalSchema>

/** Where a worker stands before its work reaches a pull request. */
export const PHASES = [
  "briefed",
  "reaching",
  "prototyping",
  "building",
  "settling",
  "ready",
  "admitted",
  "stopped",
] as const

export type Phase = (typeof PHASES)[number]

/** A line of a log: when, and what happened, in the owner's words. */
const LineSchema = z.strictObject({ at: z.iso.datetime(), says: words })

const WorkerSchema = z.strictObject({
  tag: epicTag,
  session: z.string().regex(/^session_[A-Za-z0-9]+$/),
  repo: z.enum(WORK_REPOS),
  branches: z.array(z.string().min(1)).max(8),
  phase: z.enum(PHASES),
  log: z.array(LineSchema).max(40).default([]),
})

export type RunWorker = z.infer<typeof WorkerSchema>

/** A leg of the owner's or home's that GitHub can't see done, marked done. */
const ClearedSchema = z.strictObject({
  goal: goalId,
  /** The leg, by its place in the goal's `legs`. */
  leg: z.number().int().nonnegative(),
  at: z.iso.datetime(),
})

const RunSchema = z
  .strictObject({
    schema: z.literal(RUN_SCHEMA),
    day: z.iso.date(),
    goals: z.array(GoalSchema).max(40),
    workers: z.array(WorkerSchema).max(40).default([]),
    cleared: z.array(ClearedSchema).default([]),
  })
  .superRefine((run, ctx) => {
    for (const problem of runProblems(run))
      ctx.addIssue({
        code: "custom",
        message: problem.message,
        path: problem.path,
      })
  })

export type RunFile = z.output<typeof RunSchema>

type Problem = {
  readonly message: string
  readonly path: Array<string | number>
}

/** What the record says that it can't mean: an unknown name, a loop, a leg cleared that GitHub sees. */
function runProblems(run: {
  readonly goals: ReadonlyArray<RunGoal>
  readonly workers: ReadonlyArray<{ readonly tag: string }>
  readonly cleared: ReadonlyArray<{
    readonly goal: string
    readonly leg: number
  }>
}): Array<Problem> {
  const problems: Array<Problem> = []
  const goals = new Map(run.goals.map((g) => [g.id, g]))
  const tags = new Set(run.workers.map((w) => w.tag))
  if (goals.size !== run.goals.length)
    problems.push({ message: "two goals share an id", path: ["goals"] })
  if (tags.size !== run.workers.length)
    problems.push({ message: "two workers share a tag", path: ["workers"] })
  run.goals.forEach((goal, g) =>
    goal.legs.forEach((leg, l) => {
      const at = ["goals", g, "legs", l]
      if (leg.leg === "goal" && !goals.has(leg.goal))
        problems.push({
          message: `it waits on ${leg.goal}, which the run doesn't list`,
          path: at,
        })
      if (leg.leg === "work" && !tags.has(leg.worker))
        problems.push({
          message: `it names ${leg.worker}, whom the run doesn't list`,
          path: at,
        })
      if (
        leg.leg === "yours" &&
        leg.ask === undefined &&
        leg.step !== undefined
      )
        problems.push({ message: "a step needs its ask", path: at })
      if (
        leg.leg === "yours" &&
        leg.ask === undefined &&
        leg.says === undefined
      )
        problems.push({
          message: "a step of yours with no ask says what it is",
          path: at,
        })
    })
  )
  for (const goal of run.goals)
    if (waitsOnItself(goal.id, goals))
      problems.push({ message: `${goal.id} waits on itself`, path: ["goals"] })
  run.cleared.forEach((c, i) => {
    const leg = goals.get(c.goal)?.legs[c.leg]
    if (leg === undefined)
      problems.push({
        message: "it clears a leg the run doesn't list",
        path: ["cleared", i],
      })
    else if (leg.leg !== "yours" && leg.leg !== "home")
      problems.push({
        message:
          "only a step of yours or home's is cleared here; GitHub says when the rest are done",
        path: ["cleared", i],
      })
  })
  return problems
}

/** Whether following `id`'s goal legs comes back to it. */
function waitsOnItself(
  id: string,
  goals: ReadonlyMap<string, RunGoal>
): boolean {
  const seen = new Set<string>()
  const next = (g: string): Array<string> =>
    (goals.get(g)?.legs ?? []).flatMap((l) =>
      l.leg === "goal" ? [l.goal] : []
    )
  const todo = next(id)
  for (let g = todo.pop(); g !== undefined; g = todo.pop()) {
    if (g === id) return true
    if (seen.has(g)) continue
    seen.add(g)
    todo.push(...next(g))
  }
  return false
}

/** The run an `[ORCH]` issue's body carries, or every reason it carries none. */
export const parseRunBody = (body: string): Parsed<RunFile> =>
  parseFenced<RunFile>(body, "run", () => RunSchema)
