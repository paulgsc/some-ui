/**
 * The interview week played on the phone (IW5, paulgsc/some-ui#2936), as a
 * bundle (`@some-ui/voice-capture`'s `bundleMachine`): the brief before the
 * cards, one card per question and one per teleprompter read, a spoken take
 * on each, then every take looked over and sent home together. The machine
 * holds the bundle's rules (nothing leaves before Send, one take per card, a
 * delete before Send asks first); this is the week's spec over it:
 *
 * - **Two flows, one bundle** (#2931): the questions first, in the week's
 *   order, then its cards, each card's item named `read:<card>`. A question
 *   is never named `read` and an id has no colon (`@some-ui/interview-week`'s
 *   `readWeek`), so the two never meet.
 * - **A take names its week and what it answers**, IW1's refs: an answer is
 *   `<week>:<question>` and a read `<week>:read:<card>`, which is also its
 *   voice note's `ref` on home, said `of=interview` (`lib/home-link/voice-copy`).
 * - **The draft is the week's**, named by the week's id.
 * - **Nothing must be said**: a question or card left unsaid goes as passed
 *   over, which the essay speaks to. Send needs one take at least, and closes
 *   at the week's deadline (`due`).
 * - **The week stays open until `due`**, as Rust Rounds' does (RR22): after a
 *   Send every card can be said, said again or said for the first time, and
 *   the week sent again. Each Send is kept on this phone beside the earlier
 *   ones (`./store`'s `interviewSent` only grow); home keeps the latest as
 *   its draft, and the draft standing at `due` is final (paulgsc/server#847).
 *   So each Send holds the whole week: a card sent before and not said since
 *   goes again with the take home already holds.
 * - **No typing.** An answer and a read are spoken.
 */
import type { InterviewWeek } from "@some-ui/interview-week"
import type {
  BundleDraft,
  BundleMachine,
  BundleSpec,
  BundleState,
  SendsAtHome,
} from "@some-ui/voice-capture"
import { bundleMachine, isPastDue } from "@some-ui/voice-capture"

import type { Rung } from "./ladder"

/** A take as a send names it. */
type Taken = { readonly take: string; readonly recordedAt: string }

/** A question's take as a send names it, with the rung it was said on when the phone knew (IW8). */
type Answered = Taken & { readonly question: string; readonly rung?: Rung }

/** A week's takes as sent, kept on this phone, in home's shape (`PUT /interview-weeks/:id/sent`). */
export type InterviewSent = {
  /** The week's id: `2026-w47`. */
  readonly week: string
  /** When it was sent, ISO. */
  readonly at: string
  /** Each question said, in the week's order, with its take. */
  readonly answers: ReadonlyArray<Answered>
  /** Each card read, in the week's order, with its take. */
  readonly reads: ReadonlyArray<Taken & { readonly card: string }>
  /** The questions not said, in the week's order. */
  readonly passed: ReadonlyArray<string>
  /** The cards not read, in the week's order. */
  readonly passedReads: ReadonlyArray<string>
}

/** What Send still needs: a take, or a week still open. */
type InterviewNeed = "nothing" | "closed"

export type InterviewKind = {
  readonly item: string
  readonly draft: BundleDraft
  readonly record: InterviewSent
  readonly edit: { readonly type: "none" }
  readonly context: null
  readonly need: InterviewNeed
}

export type InterviewState = BundleState<InterviewKind>

const READ = "read:"

/** A card's item in the bundle: `read:<card>`. */
export const readItem = (card: string): string => `${READ}${card}`

/** The card an item reads, or null for a question's. */
export const cardOf = (item: string): string | null =>
  item.startsWith(READ) ? item.slice(READ.length) : null

/** The week's items, in the order the cards come: the questions, then the reads. */
export const itemsOf = (
  week: Pick<InterviewWeek, "questions" | "cards">
): ReadonlyArray<string> => [
  ...week.questions.map(({ id }) => id),
  ...week.cards.map(({ id }) => readItem(id)),
]

/** What a take of `week`'s `item` answers: its voice note's `ref` (IW1). */
export const takeLine = (week: string, item: string): string =>
  `${week}:${item}`

/** Whether `at` is past the week's deadline. */
export const isClosed = (
  week: Pick<InterviewWeek, "due">,
  at: string
): boolean => isPastDue(week.due, at)

/** A week's sends as home has them: the latest it holds, and the latest made. */
export type InterviewAtHome = SendsAtHome<InterviewSent>

/** Every take a send names, answers then reads. */
export const takesOf = (sent: InterviewSent): ReadonlyArray<string> => [
  ...sent.answers.map(({ take }) => take),
  ...sent.reads.map(({ take }) => take),
]

/** The take `sent` holds for `item`, if it holds one. */
export function sentTakeOf(
  sent: InterviewSent | null,
  item: string
): string | null {
  if (sent === null) return null
  const card = cardOf(item)
  return card === null
    ? (sent.answers.find(({ question }) => question === item)?.take ?? null)
    : (sent.reads.find((read) => read.card === card)?.take ?? null)
}

function interviewSpec(week: InterviewWeek): BundleSpec<InterviewKind> {
  return {
    items: itemsOf(week),
    answersOf: takeLine,
    required: () => false,
    typing: false,
    typedMax: 0,
    withAnswers: (_draft, answers) => answers,
    fresh: (_id, at) => ({ id: week.id, at, typed: {}, later: [] }),
    edit: (draft) => draft,
    missing: (_draft, at, said) =>
      isClosed(week, at) ? "closed" : said === 0 ? "nothing" : null,
    resumesOnCards: () => false,
    record: (draft, answers, _passed, at, last): InterviewSent => {
      // An answer carried from the last send keeps the rung it went with.
      const said = new Map<string, Taken & { readonly rung?: Rung }>(
        answers.flatMap(({ item, take }) =>
          take === null ? [] : [[item, { take: take.id, recordedAt: take.at }]]
        )
      )
      // A card sent before and not said since goes again as home holds it.
      for (const { question, ...taken } of last?.answers ?? []) {
        if (!said.has(question)) said.set(question, taken)
      }
      for (const { card, ...taken } of last?.reads ?? []) {
        if (!said.has(readItem(card))) said.set(readItem(card), taken)
      }
      const questions = week.questions.map(({ id }) => id)
      const cards = week.cards.map(({ id }) => id)
      return {
        week: draft.id,
        at,
        answers: questions.flatMap((question) => {
          const taken = said.get(question)
          return taken === undefined ? [] : [{ question, ...taken }]
        }),
        reads: cards.flatMap((card) => {
          const taken = said.get(readItem(card))
          return taken === undefined ? [] : [{ card, ...taken }]
        }),
        passed: questions.filter((question) => !said.has(question)),
        passedReads: cards.filter((card) => !said.has(readItem(card))),
      }
    },
    idOf: (sent) => sent.week,
    named: takesOf,
    resends: true,
    closed: (_draft, at) => isClosed(week, at),
  }
}

/** The week's bundle: the shared machine over its spec. */
export const interviewMachine = (
  week: InterviewWeek
): BundleMachine<InterviewKind> => bundleMachine(interviewSpec(week))
