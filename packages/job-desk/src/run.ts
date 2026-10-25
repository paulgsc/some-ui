import { z } from "zod"

import { digestFileName } from "./digest"
import type { Finding } from "./findings"
import { parseWith, text, type Parsed } from "./shared"

const Instant = z.iso.datetime({ offset: true })
const Count = z.number().int().nonnegative()

/** The longest a problem may run: one sentence on a phone screen. */
export const MAX_PROBLEM = 200

/** What one morning run did, a stopped one included (ROUTINE.md §9). */
export const JobsRunSchema = z.object({
  schema: z.literal("some-ui.routine-run/1"),
  routine: z.literal("jobs"),
  startedAt: Instant,
  finishedAt: Instant,
  outcome: z.enum(["done", "partly", "stopped"]),
  found: z.object({ postings: Count, scouts: Count, decisions: Count }),
  added: z.array(
    z.object({ folder: z.literal("brief"), name: text, title: text })
  ),
  problems: z.array(text),
})

export type JobsRun = z.infer<typeof JobsRunSchema>

export function parseJobsRun(raw: string): Parsed<JobsRun> {
  return parseWith(JobsRunSchema, "a jobs run record", raw)
}

/** `run-jobs-<stamp>.json`, the stamp being when the run started, in UTC to the second. */
export function runFileName(startedAt: string): string {
  const stamp = new Date(startedAt)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[-:]/g, "")
  return `run-jobs-${stamp}.json`
}

const PACIFIC_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

/** The Pacific calendar day of `at`, `YYYY-MM-DD`: the morning run's "today". */
export function pacificDay(at: Date): string {
  return PACIFIC_DAY.format(at)
}

/**
 * How it works rather than what it did: a status code, an address, a
 * variable, a file format or a step of ROUTINE.md. The phone shows each
 * problem as written (RUN3), so none may name these.
 */
export const MACHINERY =
  /\b(mailbox|schema|json|checker|curl|connector|token|env\w*|api|http\w*|https?:|status|error|request|sync\w*|server|retry|null|undefined)\b|\b[1-5]\d\d\b(?! [a-z])|§|\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b|\.(lan|local|com|json)\b/i

/**
 * The rules the schema can't state: the name, the clock, what each outcome
 * means, and the problems as the phone will show them. `fileName` is the
 * name the record goes to the mailbox under.
 */
export function runFindings(
  run: JobsRun,
  fileName: string
): ReadonlyArray<Finding> {
  const found: Array<Finding> = []
  const name = runFileName(run.startedAt)
  if (fileName !== name) {
    found.push({
      path: "startedAt",
      message: `the file is ${fileName}, but a run that started then is ${name}`,
    })
  }
  if (Date.parse(run.finishedAt) < Date.parse(run.startedAt)) {
    found.push({ path: "finishedAt", message: "before startedAt" })
  }

  const digest = digestFileName(pacificDay(new Date(run.startedAt)))
  run.added.forEach((added, i) => {
    if (added.name !== digest) {
      found.push({
        path: `added.${i}.name`,
        message: `this morning's digest is ${digest}`,
      })
    }
  })
  if (run.added.length > 1) {
    found.push({ path: "added", message: "a run adds one digest at most" })
  }

  if (run.outcome === "stopped" && run.added.length > 0) {
    found.push({
      path: "outcome",
      message: "a stopped run wrote no digest; one that did is partly",
    })
  }
  if (run.outcome !== "stopped" && run.added.length === 0) {
    found.push({
      path: "outcome",
      message: "no digest was added, so the run stopped",
    })
  }
  if (run.outcome === "done" && run.problems.length > 0) {
    found.push({
      path: "outcome",
      message: "a run with problems is partly or stopped",
    })
  }
  if (run.outcome !== "done" && run.problems.length === 0) {
    found.push({
      path: "problems",
      message: `a run that is ${run.outcome} says why`,
    })
  }

  run.problems.forEach((problem, i) => {
    if (problem.length > MAX_PROBLEM) {
      found.push({
        path: `problems.${i}`,
        message: `over ${MAX_PROBLEM} characters`,
      })
    }
    if (!/[.!?]$/.test(problem)) {
      found.push({ path: `problems.${i}`, message: "not a sentence" })
    }
    const machinery = MACHINERY.exec(problem)
    if (machinery) {
      found.push({
        path: `problems.${i}`,
        message: `says how it works ("${machinery[0]}"), not what was done`,
      })
    }
  })
  return found
}
