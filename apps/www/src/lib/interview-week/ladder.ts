/**
 * A question's ladder on the phone (IW8, paulgsc/some-ui#3175), as pure data
 * and steps: its rungs, the script read aloud, which rung each take was said
 * on, and which take of each question goes home on its own. The runtime
 * (`./runtime`) runs the steps against the week's takes and keeps what they
 * return (`./store`'s `interviewLadder`); the pages read them.
 *
 * - **Four rungs at equal weight** (owner, 2026-11-17): read the answer,
 *   read it aloud, say it from cues, say it your way. Reading the answer
 *   records nothing; each other rung's take is marked with it.
 * - **A week written before ready answers** (`/1`) has no answer to read or
 *   read aloud, so its questions offer the last two rungs only.
 * - **The first take of each question goes home on its own** (owner,
 *   2026-11-17), so home keeps the cold first try under "keep first and
 *   latest" even when a later take replaces it before Send. Only a
 *   question's: a read's takes wait for Send as before.
 */
import type { Question, Ready } from "@some-ui/interview-week"
import type { PatternTake } from "@some-ui/voice-capture"

import { takeLine } from "./spec"

/** The rungs a take is said on: read aloud, from cues, in your own words. */
export const RUNGS = ["aloud", "cues", "own"] as const
export type Rung = (typeof RUNGS)[number]

/** A question's steps, in the ladder's order: `study` records nothing. */
export type Step = "study" | Rung

/** The steps a question offers: all four with a ready answer, the last two without. */
export const stepsOf = (
  question: Pick<Question, "ready">
): ReadonlyArray<Step> =>
  question.ready === undefined
    ? ["cues", "own"]
    : ["study", "aloud", "cues", "own"]

/** The rungs said without the answer on screen: the take page's. */
export type SayRung = Exclude<Rung, "aloud">

/**
 * The ready answer as read aloud: its parts' texts in order, a phrase a
 * line, broken after each clause's punctuation.
 */
export const scriptOf = (ready: Pick<Ready, "answer">): ReadonlyArray<string> =>
  ready.answer.flatMap(({ text }) =>
    text
      .split(/(?<=[.,;:?!])\s+/u)
      .map((phrase) => phrase.trim())
      .filter((phrase) => phrase !== "")
  )

/** What this phone keeps of a week's ladder. */
export type Ladder = {
  /** Each question's first take this week: the one that goes home on its own. */
  readonly first: Readonly<Partial<Record<string, string>>>
  /** The rung each take was said on, by the take's id. */
  readonly rungs: Readonly<Partial<Record<string, Rung>>>
  /**
   * A take asked for on a rung and not yet kept: kept here, not in memory,
   * so a take kept after its page or the whole week was left is still marked.
   */
  readonly asked?: Asked
}

export const NO_LADDER: Ladder = { first: {}, rungs: {} }

/** A take about to start on a rung: the takes its item had when it was asked for. */
export type Asked = {
  readonly item: string
  readonly rung: Rung
  readonly before: ReadonlyArray<string>
}

/** The takes of `week` answering `item`. */
export const takesFor = (
  takes: ReadonlyArray<PatternTake>,
  week: string,
  item: string
): ReadonlyArray<PatternTake> =>
  takes.filter(({ answers }) => answers === takeLine(week, item))

/**
 * Marks with its rung the take kept for the ladder's `asked` since it was
 * asked for, one its item didn't have then, and lets `asked` go. Returns the
 * ladder unchanged (the same object) while there is none.
 */
export function markRung(
  ladder: Ladder,
  takes: ReadonlyArray<PatternTake>,
  week: string
): Ladder {
  const { asked, ...rest } = ladder
  if (asked === undefined) return ladder
  const kept = takesFor(takes, week, asked.item).find(
    ({ id }) => !asked.before.includes(id) && ladder.rungs[id] === undefined
  )
  if (kept === undefined) return ladder
  return { ...rest, rungs: { ...ladder.rungs, [kept.id]: asked.rung } }
}

/** The ladder asking for a take on `asked`'s rung, or for one on none. */
export function ask(ladder: Ladder, asked: Asked | null): Ladder {
  if (asked === null && ladder.asked === undefined) return ladder
  const { asked: _was, ...rest } = ladder
  return asked === null ? rest : { ...rest, asked }
}

/**
 * Which take of each of `questions` goes home on its own: the first one
 * kept, once marked, and only it. Returns the ladder with any new marks (the same object
 * when none), and the marked takes still waiting on this phone, to let go
 * home: a mark whose take didn't go is asked again until it does.
 */
export function firsts(
  ladder: Ladder,
  takes: ReadonlyArray<PatternTake>,
  week: string,
  questions: ReadonlyArray<string>
): { readonly ladder: Ladder; readonly release: ReadonlyArray<string> } {
  const marked: Record<string, string> = {}
  for (const question of questions) {
    if (ladder.first[question] !== undefined) continue
    const first = [...takesFor(takes, week, question)]
      .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
      .at(0)
    if (first !== undefined) marked[question] = first.id
  }
  const next =
    Object.keys(marked).length === 0
      ? ladder
      : { ...ladder, first: { ...ladder.first, ...marked } }
  const firstIds = new Set(Object.values(next.first))
  return {
    ladder: next,
    release: takes
      .filter(({ id, waits }) => waits === true && firstIds.has(id))
      .map(({ id }) => id),
  }
}
