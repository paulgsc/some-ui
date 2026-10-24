/**
 * What the handheld says of the reflections routine (`adapter/routine-runs`):
 * when it last ran, whether it brought anything new, and whether it has gone
 * quiet. Pure, and the one place those words live, so they stay in the
 * person's terms: what the routine did and what this phone holds, never how
 * it travels (`index.test.ts`).
 *
 * The phone can say the routine went quiet only from what home told it after
 * the run was due: a look made before then, away from home, says only when
 * it last looked.
 */

import { counted, dayWords } from "@some-ui/core-utils"
import { routineKey } from "@topik/lib/topik/adapter/routine-files"
import type {
  HeldRuns,
  RoutineRun,
} from "@topik/lib/topik/adapter/routine-runs"

export type RoutineShape =
  /** Something it added is not opened yet. */
  | "fresh"
  /** It ran and everything it added is opened. */
  | "opened"
  /** It ran and had nothing to answer. */
  | "rested"
  /** No run is known yet. */
  | "unheard"
  /** Home has heard of no run since the last one was due. */
  | "quiet"
  /** Its last run could not finish. */
  | "trouble"
  /** Its run is due, and this phone hasn't looked at home since. */
  | "away"

export type RoutineView = {
  shape: RoutineShape
  /** Beside the mark: a word or two. */
  word: string
  /** The sentence the mark stands for. */
  line: string
}

/** A run is due again a day and two hours after it started, unless it says otherwise. */
const DUE_AFTER_MS = 26 * 60 * 60 * 1000

/** An instant as a person says it beside `today`: "today at 9:02". */
function when(iso: string, today: string): string {
  const time = new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
  return `${dayWords(iso, today)} at ${time}`
}

const dueBy = (run: RoutineRun): string =>
  run.nextBy ??
  new Date(new Date(run.startedAt).getTime() + DUE_AFTER_MS).toISOString()

/** "a drama", "2 dramas", or null for none. */
const some = (n: number, noun: string): string | null =>
  n === 0 ? null : n === 1 ? `a ${noun}` : counted(n, noun)

const joined = (parts: ReadonlyArray<string | null>): string =>
  parts.filter((part) => part !== null).join(" and ")

/** "2 word sets and a drama". */
function whatOf(added: RoutineRun["added"]): string {
  const scenes = added.filter((file) => file.folder === "scene").length
  return joined([
    some(scenes, "word set"),
    some(added.length - scenes, "drama"),
  ])
}

/** "2 reflections and a drama prompt", or null for nothing. */
function foundOf(found: RoutineRun["found"]): string | null {
  const parts = [
    some(found.reflections, "reflection"),
    some(found.prompts, "drama prompt"),
  ]
  return parts.every((part) => part === null) ? null : joined(parts)
}

export const ROUTINE_WORDS = {
  title: "The routine",
  /** The mark's button name: what it opens. */
  open: (view: RoutineView): string => `The routine: ${view.line}`,
  what: "Each morning the routine answers what you shared: a word set for each study reflection, a drama for each drama prompt. With nothing new to answer, it adds nothing.",
  history: "Its runs",
  legend: "What the mark says",
  done: "Done",
  kept: (since: string, today: string): string =>
    `Kept on this phone, as home told it, since ${dayWords(since, today)}.`,
  /** Each shape, as the legend says it. */
  shapes: {
    fresh: "Something new it left that you haven't opened.",
    opened: "It ran, and you've opened all it left.",
    rested: "It ran with nothing to answer.",
    quiet: "Home has no word of a run since one was due.",
    trouble: "Its last run couldn't finish.",
    away: "A run is due, and this phone hasn't looked at home since.",
    unheard: "No run heard of yet.",
  } satisfies Record<RoutineShape, string>,
} as const

/** What the mark says now, given what the phone holds and has opened. */
export function routineView(
  held: HeldRuns,
  opened: ReadonlySet<string>,
  now: Date,
  today: string
): RoutineView {
  const last = held.runs.at(0)
  if (last === undefined || held.lookedAt === null) {
    return {
      shape: "unheard",
      word: "Not yet",
      line: "No run of the routine heard of yet. It answers your reflections each morning.",
    }
  }
  const due = dueBy(last)
  if (now.toISOString() > due) {
    if (held.lookedAt < due) {
      return {
        shape: "away",
        word: "Away",
        line: `This phone last looked at home ${when(held.lookedAt, today)}. The routine last ran ${when(last.startedAt, today)}.`,
      }
    }
    return {
      shape: "quiet",
      word: "Quiet",
      line: `Home has no word of a run since ${when(last.startedAt, today)}. The routine may not have run.`,
    }
  }
  if (last.outcome !== "done") {
    const why = last.problems.at(0)
    return {
      shape: "trouble",
      word: last.outcome === "stopped" ? "Stopped" : "Partly",
      line: `The routine ran ${when(last.startedAt, today)} and couldn't finish${why === undefined ? "." : `: ${why}`}`,
    }
  }
  const waiting = held.runs
    .flatMap((run) => run.added)
    .filter((file) => !opened.has(routineKey(file.folder, file.name)))
  if (waiting.length > 0) {
    return {
      shape: "fresh",
      word: `${waiting.length} new`,
      line: `New from the routine: ${whatOf(waiting)}, not opened yet. It last ran ${when(last.startedAt, today)}.`,
    }
  }
  if (last.added.length === 0) {
    return {
      shape: "rested",
      word: "Nothing new",
      line: `The routine ran ${when(last.startedAt, today)} with nothing to answer. It writes new words from your study reflections, and there were none since its last run.`,
    }
  }
  return {
    shape: "opened",
    word: "All opened",
    line: `You've opened all the routine left. It last ran ${when(last.startedAt, today)}.`,
  }
}

/** One run, as its history row says it. */
export function runLine(run: RoutineRun, today: string): string {
  const found = foundOf(run.found)
  const added =
    run.added.length === 0
      ? found === null
        ? "Nothing to answer."
        : `Found ${found}, and added nothing.`
      : `Added ${whatOf(run.added)}: ${run.added.map((file) => file.title).join("; ")}.`
  const problems = run.problems.length === 0 ? "" : ` ${run.problems.join(" ")}`
  const outcome =
    run.outcome === "done"
      ? ""
      : run.outcome === "stopped"
        ? " It stopped early."
        : " Some of it couldn't be done."
  return `${when(run.startedAt, today)}. ${added}${outcome}${problems}`
}
