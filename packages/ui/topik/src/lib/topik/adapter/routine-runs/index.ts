/**
 * What each run of the reflections routine did, as home last said
 * (paulgsc/server `GET /routine/files`'s `runs`, through the Jobs mailbox's
 * `run` folder): when it ran, what it found unanswered, what it added and
 * what it could not do. The handheld says from it when the routine last ran
 * and whether it brought anything new (`core/routine-status`).
 *
 * Kept on the device (`createRunLog`), so the phone still knows away from
 * home what home last told it, for each home it reads (the port's `key`).
 * The record only grows: a run is added once, by its name, and never
 * rewritten or dropped. A run is a few hundred bytes, one a day.
 */

import { localStorageOrNull } from "@some-ui/core-utils"
import { z } from "zod"

export type RoutineRun = {
  /** Its name in the mailbox: `run-reflections-<stamp>.json`. */
  name: string
  /** ISO-8601, the routine's clock. */
  startedAt: string
  finishedAt: string | null
  /** `done`: all it found was answered; `partly`: some was not; `stopped`: it ended early. */
  outcome: "done" | "partly" | "stopped"
  /** What it found unanswered when it started. */
  found: { reflections: number; prompts: number }
  /** The files it put, each as "From the routine" names it (`openedKey`). */
  added: ReadonlyArray<{
    folder: "scene" | "drama"
    name: string
    title: string
  }>
  /** What it could not do, each a sentence. */
  problems: ReadonlyArray<string>
  /** By when its next run should have reported; absent, a day and two hours on. */
  nextBy: string | null
}

const Instant = z.iso.datetime({ offset: true })
const Count = z.number().int().nonnegative()

const RunSchema = z.object({
  schema: z.literal("some-ui.routine-run/1"),
  startedAt: Instant,
  finishedAt: Instant.nullish(),
  outcome: z.enum(["done", "partly", "stopped"]),
  found: z.object({ reflections: Count, prompts: Count }),
  added: z.array(
    z.object({
      folder: z.enum(["scene", "drama"]),
      name: z.string().min(1),
      title: z.string().min(1),
    })
  ),
  problems: z.array(z.string().min(1)).default([]),
  nextBy: Instant.nullish(),
})

const AnswerSchema = z.object({
  runs: z.array(
    z.object({ folder: z.literal("run"), name: z.string(), file: z.unknown() })
  ),
  at: Instant,
})

/** What one answer from home says of the routine's runs. */
export type RunsAnswer = {
  /** Newest first. */
  runs: ReadonlyArray<RoutineRun>
  /** When home answered, by its clock. */
  at: string
}

/**
 * The runs in home's answer, or null when it says nothing of them (a home
 * from before run records, or no answer at all). A run of a shape this
 * build does not know is left out.
 */
export function parseRoutineRuns(answer: unknown): RunsAnswer | null {
  const parsed = AnswerSchema.safeParse(answer)
  if (!parsed.success) return null
  const runs = parsed.data.runs.flatMap((held): Array<RoutineRun> => {
    const run = RunSchema.safeParse(held.file)
    if (!run.success) return []
    const { schema: _, ...rest } = run.data
    return [
      {
        ...rest,
        name: held.name,
        finishedAt: rest.finishedAt ?? null,
        nextBy: rest.nextBy ?? null,
      },
    ]
  })
  return { runs, at: parsed.data.at }
}

export const ROUTINE_RUNS_KEY = "topik:routine-runs"

/** What the phone holds for one home. */
export type HeldRuns = {
  /** Newest first, by when each started. */
  runs: ReadonlyArray<RoutineRun>
  /** When home last answered, by its clock; null before any answer. */
  lookedAt: string | null
  /** When this phone first heard from it, by home's clock. */
  since: string | null
}

const NONE: HeldRuns = { runs: [], lookedAt: null, since: null }

const StoredRun = RunSchema.omit({ schema: true }).extend({
  name: z.string().min(1),
  finishedAt: Instant.nullable(),
  nextBy: Instant.nullable(),
})

const StoredSchema = z.object({
  version: z.literal(1),
  homes: z.record(
    z.string(),
    z.object({
      runs: z.array(StoredRun),
      lookedAt: Instant.nullable(),
      since: Instant.nullable(),
    })
  ),
})

export type RunLog = {
  /** The same object until home says something new for `key`. */
  held: (key: string) => HeldRuns
  /** Adds the runs not held yet and notes when home answered. */
  keep: (key: string, answer: RunsAnswer) => void
  subscribe: (listener: () => void) => () => void
}

const newestFirst = (a: RoutineRun, b: RoutineRun): number =>
  b.startedAt.localeCompare(a.startedAt) || b.name.localeCompare(a.name)

/**
 * The runs heard on this device. A failed read is none, and is never
 * written over, so an unreadable record is not lost; a failed write keeps
 * what was heard until the app closes.
 */
export function createRunLog(
  storage: Pick<Storage, "getItem" | "setItem"> | null = localStorageOrNull()
): RunLog {
  let readable = true
  const read = (): Record<string, HeldRuns> => {
    try {
      const text = storage?.getItem(ROUTINE_RUNS_KEY) ?? null
      if (text === null) return {}
      const parsed = StoredSchema.safeParse(JSON.parse(text))
      if (parsed.success) return parsed.data.homes
    } catch {
      // Unreadable: treated as below.
    }
    readable = false
    return {}
  }
  let homes = read()
  const listeners = new Set<() => void>()
  return {
    held: (key) => homes[key] ?? NONE,
    keep(key, answer): void {
      const was = homes[key] ?? NONE
      const names = new Set(was.runs.map((run) => run.name))
      const fresh = answer.runs.filter((run) => !names.has(run.name))
      const lookedAt =
        was.lookedAt !== null && was.lookedAt.localeCompare(answer.at) >= 0
          ? was.lookedAt
          : answer.at
      if (fresh.length === 0 && lookedAt === was.lookedAt) return
      homes = {
        ...homes,
        [key]: {
          runs: [...was.runs, ...fresh].sort(newestFirst),
          lookedAt,
          since: was.since ?? answer.at,
        },
      }
      if (readable) {
        try {
          storage?.setItem(
            ROUTINE_RUNS_KEY,
            JSON.stringify({ version: 1, homes })
          )
        } catch {
          // Quota, privacy mode: held until the app closes.
        }
      }
      for (const listener of listeners) listener()
    },
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
  }
}

let shared: RunLog | null = null

/** One log per page load, over `localStorage`. */
export function sharedRunLog(): RunLog {
  shared ??= createRunLog()
  return shared
}
