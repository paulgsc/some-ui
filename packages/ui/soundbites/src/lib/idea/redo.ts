/**
 * Saying one answer of an idea already on home again (ST26, #2579): "Say it
 * again" on Ideas on home records a new take for that answer, which waits on
 * this phone until the idea is sent again, and "Send it again" sends it.
 * The owner's ruling (#2453, question 3): on that send, the take it
 * replaces is set aside on home.
 *
 * Pure: what `./on-home`'s machine and `./on-home-runtime` decide with.
 *
 * - **The record only grows.** Sending again adds the new take after the
 *   answer's takes and a date after the idea's sends (`sendAgain`), which
 *   `./model`'s `grows` allows: the newest take is the answer, and nothing
 *   is rewritten. Home keeps every send as a revision.
 * - **A redo's take waits on a desk of its own** (www's `lib/idea-takes`,
 *   `some-ui:idea-redo-takes`), which the new idea's bundle never opens, so
 *   its clean-up of a kept idea's takes never reaches one.
 * - **One waiting take per answer.** A take said again before the idea is
 *   sent replaces the waiting one, which never left the phone and nothing
 *   will send, so it is deleted for good (`overtaken`), as a new idea's is
 *   before its Send. Only a draft: a take a kept idea names (`namedTakes`)
 *   is the idea's record, even while it still waits after a send again cut
 *   short, and is never offered, overtaken or deleted as a draft.
 * - **A send cut short is finished** (`cutShort`): a waiting take the idea
 *   kept already names goes home, and the take before it is set aside.
 */
import type { PatternTake } from "@some-ui/voice-capture"

import { answerOf, answersOf } from "./draft"
import type { Idea, QuestionId } from "./model"
import { IDEA_QUESTIONS, isFollowUp } from "./model"

/** A redo waiting to be sent: the question it answers, and its take. */
export type Redo = {
  readonly question: QuestionId
  readonly take: string
  /** When it was recorded, as an ISO time. */
  readonly at: string
}

const newestFirst = (a: PatternTake, b: PatternTake): number =>
  b.recordedAt.localeCompare(a.recordedAt)

/** The newest waiting take in its answer's view, by what it answers. */
function keepers(
  takes: ReadonlyArray<PatternTake>
): ReadonlyMap<string, PatternTake> {
  const kept = new Map<string, PatternTake>()
  for (const take of [...takes].sort(newestFirst)) {
    if (take.waits !== true || take.standing !== "current") continue
    if (!kept.has(take.answers)) kept.set(take.answers, take)
  }
  return kept
}

/** Each redo of `idea` waiting on this phone, in the questions' order. */
export function waitingRedos(
  takes: ReadonlyArray<PatternTake>,
  idea: string
): ReadonlyArray<Redo> {
  const kept = keepers(takes)
  return IDEA_QUESTIONS.flatMap((question): ReadonlyArray<Redo> => {
    const take = kept.get(answersOf(idea, question))
    return take === undefined
      ? []
      : [{ question, take: take.id, at: take.recordedAt }]
  })
}

/**
 * The waiting takes nothing will send: on an answer whose newest waiting
 * take replaced them. Each never left the phone.
 */
export function overtaken(
  takes: ReadonlyArray<PatternTake>
): ReadonlyArray<string> {
  const kept = keepers(takes)
  return takes
    .filter((take) => {
      if (take.waits !== true || answerOf(take.answers) === null) return false
      // One set aside with its idea (#2805) is never a draft to delete.
      if (take.standing === "set-aside") return false
      const keeper = kept.get(take.answers)
      return keeper !== undefined && keeper.id !== take.id
    })
    .map((take) => take.id)
}

/**
 * The questions of `idea` whose answer can be said again: it was sent
 * whole, and the answer was said as a take with no typed words standing for
 * it, so home names that take.
 */
export function sayable(idea: Idea): ReadonlyArray<QuestionId> {
  if (idea.about === undefined || (idea.sent?.length ?? 0) === 0) return []
  return idea.answers.flatMap((answer): ReadonlyArray<QuestionId> => {
    const { question } = answer
    if (isFollowUp(question)) return []
    const said = (answer.takes?.length ?? 0) > 0
    const typed = answer.versions.some((version) => version.how === "typed")
    return said && !typed ? [question] : []
  })
}

/**
 * Every take the kept ideas name: each one the idea's record, which no
 * clean-up of drafts may delete, even while it still waits to go home.
 */
export function namedTakes(ideas: ReadonlyArray<Idea>): ReadonlyArray<string> {
  return ideas.flatMap((idea) =>
    idea.answers.flatMap((answer) => (answer.takes ?? []).map((t) => t.take))
  )
}

/** By idea and question, the take each said answer is now. */
export function latestTakes(
  ideas: ReadonlyArray<Idea>
): Readonly<Record<string, Readonly<Record<string, string>>>> {
  return Object.fromEntries(
    ideas.map((idea) => [
      idea.id,
      Object.fromEntries(
        idea.answers.flatMap((answer) => {
          const take = answer.takes?.at(-1)?.take
          return take === undefined ? [] : [[answer.question, take]]
        })
      ),
    ])
  )
}

/** What sending an idea again does. */
export type Resent = {
  /** The idea as it is kept now: grown, never rewritten. */
  readonly idea: Idea
  /** The waiting takes that now go home. */
  readonly release: ReadonlyArray<string>
  /** The takes they replace, to set aside on home. */
  readonly replaced: ReadonlyArray<string>
}

/** `at`, or just after `last` when it is not later (a clock set back). */
function after(at: string, last: string | undefined): string {
  if (last === undefined) return at
  const ms = Date.parse(last)
  return Date.parse(at) > ms ? at : new Date(ms + 1).toISOString()
}

/**
 * `idea` sent again at `at` with `redos`: each redo's take after its
 * answer's takes, and a send after its sends. Null when no redo answers a
 * question it can say again (`sayable`) with a take it doesn't hold yet.
 */
export function sendAgain(
  idea: Idea,
  redos: ReadonlyArray<Redo>,
  at: string
): Resent | null {
  const can = new Set<string>(sayable(idea))
  const fresh = redos.filter((redo) => {
    const answer = idea.answers.find((each) => each.question === redo.question)
    return (
      can.has(redo.question) &&
      answer?.takes?.some((each) => each.take === redo.take) === false
    )
  })
  if (fresh.length === 0) return null
  const replaced: Array<string> = []
  const answers = idea.answers.map((answer) => {
    const redo = fresh.find((each) => each.question === answer.question)
    if (redo === undefined) return answer
    const takes = answer.takes ?? []
    const before = takes.at(-1)?.take
    if (before !== undefined) replaced.push(before)
    return { ...answer, takes: [...takes, { at: redo.at, take: redo.take }] }
  })
  const sent = idea.sent ?? []
  return {
    idea: { ...idea, answers, sent: [...sent, after(at, sent.at(-1))] },
    release: fresh.map((redo) => redo.take),
    replaced,
  }
}

/**
 * Waiting takes an idea kept already names (a send again cut short before
 * its takes went), and the take each replaced: to let go home, and to set
 * aside there.
 */
export function cutShort(
  ideas: ReadonlyArray<Idea>,
  takes: ReadonlyArray<PatternTake>
): Pick<Resent, "release" | "replaced"> {
  const release: Array<string> = []
  const replaced: Array<string> = []
  for (const take of takes) {
    if (take.waits !== true) continue
    const answered = answerOf(take.answers)
    if (answered === null) continue
    const said = ideas
      .find((idea) => idea.id === answered.idea)
      ?.answers.find((answer) => answer.question === answered.question)?.takes
    const at = said?.findIndex((each) => each.take === take.id) ?? -1
    if (at < 0) continue
    release.push(take.id)
    const before = said?.[at - 1]?.take
    if (before !== undefined) replaced.push(before)
  }
  return { release, replaced }
}

/**
 * Waiting takes already set aside with their idea (#2805) whose release
 * wasn't stored: each settle lets them go home, set aside.
 */
export const asideWaiting = (
  takes: ReadonlyArray<PatternTake>
): ReadonlyArray<string> =>
  takes
    .filter((take) => take.waits === true && take.standing === "set-aside")
    .map((take) => take.id)
