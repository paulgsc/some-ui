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

import type { KeyedStorage } from "@some-ui/core-utils"
import {
  localStorageOrNull,
  openRecord,
  writeRecord,
} from "@some-ui/core-utils"
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
  /**
   * What became of the voice notes in what it found: how many reflections and
   * drama requests wait for home to hear one, how many it answered without
   * one home never heard, and whether it could read what home heard at all.
   * Null for a run from before it said so, which says nothing either way.
   */
  voice: VoiceTally | null
  /** By when its next run should have reported; absent, a day and two hours on. */
  nextBy: string | null
}

export type VoiceTally = {
  waiting: number
  missed: number
  unread: boolean
}

/** Any offset is taken, and kept as UTC, so instants compare as text. */
const Instant = z.iso
  .datetime({ offset: true })
  .transform((at) => new Date(at).toISOString())
const Count = z.number().int().nonnegative()

const RunSchema = z.object({
  schema: z.literal("some-ui.routine-run/1"),
  // The jobs routine's runs share the schema and the folder
  // (`@some-ui/job-desk`'s `JobsRunSchema`); only this routine's are read.
  routine: z.literal("reflections"),
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
  voice: z
    .object({ waiting: Count, missed: Count, unread: z.boolean() })
    .nullish()
    .transform((voice) => voice ?? null),
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
 * build does not know, or another routine's, is left out.
 */
export function parseRoutineRuns(answer: unknown): RunsAnswer | null {
  const parsed = AnswerSchema.safeParse(answer)
  if (!parsed.success) return null
  const runs = parsed.data.runs.flatMap((held): Array<RoutineRun> => {
    const run = RunSchema.safeParse(held.file)
    if (!run.success) return []
    const { schema: _, routine: __, ...rest } = run.data
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

const newestFirst = (a: RoutineRun, b: RoutineRun): number =>
  b.startedAt.localeCompare(a.startedAt) || b.name.localeCompare(a.name)

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

const Stored = z.iso.datetime()

const StoredRun = RunSchema.omit({ schema: true, routine: true }).extend({
  name: z.string().min(1),
  startedAt: Stored,
  finishedAt: Stored.nullable(),
  nextBy: Stored.nullable(),
})

const StoredSchema = z.object({
  version: z.literal(1),
  homes: z.record(
    z.string(),
    z.object({
      runs: z.array(StoredRun),
      lookedAt: Stored.nullable(),
      since: Stored.nullable(),
    })
  ),
})

const later = (a: string | null, b: string | null): string | null =>
  a === null ? b : b === null ? a : a > b ? a : b
const earlier = (a: string | null, b: string | null): string | null =>
  a === null ? b : b === null ? a : a < b ? a : b

/** Both records of one home as one: every run of either, once. */
function merged(a: HeldRuns, b: HeldRuns): HeldRuns {
  const names = new Set(a.runs.map((run) => run.name))
  return {
    runs: [...a.runs, ...b.runs.filter((run) => !names.has(run.name))].sort(
      newestFirst
    ),
    lookedAt: later(a.lookedAt, b.lookedAt),
    since: earlier(a.since, b.since),
  }
}

export type RunLog = {
  /** The same object until home says something new for `key`. */
  held: (key: string) => HeldRuns
  /** Adds the runs not held yet and notes when home answered. */
  keep: (key: string, answer: RunsAnswer) => void
  subscribe: (listener: () => void) => () => void
}

function parseHomes(raw: string): Record<string, HeldRuns> | null {
  try {
    const parsed = StoredSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data.homes : null
  } catch {
    return null
  }
}

/**
 * The runs heard on this device. An unreadable record is moved aside, never
 * written over (`openRecord`); with storage that throws, nothing is
 * written, and what was heard is held until the app closes.
 */
export function createRunLog(
  storage: KeyedStorage | null = localStorageOrNull()
): RunLog {
  /** What is stored, or null when storage throws (nothing may be written). */
  const read = (): Record<string, HeldRuns> | null => {
    if (storage === null) return null
    const opened = openRecord(
      storage,
      ROUTINE_RUNS_KEY,
      parseHomes,
      `${ROUTINE_RUNS_KEY}:unreadable:`
    )
    if (opened.kind === "unreadable") return null
    return opened.kind === "kept" ? opened.value : {}
  }
  const first = read()
  let writable = first !== null
  let homes = first ?? {}
  const listeners = new Set<() => void>()
  return {
    held: (key) => homes[key] ?? NONE,
    keep(key, answer): void {
      const was = homes[key] ?? NONE
      const next = merged(was, {
        runs: answer.runs,
        lookedAt: answer.at,
        since: answer.at,
      })
      if (
        next.runs.length === was.runs.length &&
        next.lookedAt === was.lookedAt
      ) {
        return
      }
      homes = { ...homes, [key]: next }
      // Another page on this device may have kept runs since this one read:
      // what it kept is merged in, never written over.
      const stored = writable ? read() : null
      if (stored === null) writable = false
      if (stored !== null && storage !== null) {
        for (const [home, runs] of Object.entries(stored)) {
          homes = { ...homes, [home]: merged(homes[home] ?? NONE, runs) }
        }
        writeRecord(
          storage,
          ROUTINE_RUNS_KEY,
          JSON.stringify({ version: 1, homes }),
          parseHomes
        )
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
