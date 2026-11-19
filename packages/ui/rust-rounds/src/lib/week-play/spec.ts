/**
 * A week answered on the phone (RR13, paulgsc/some-ui#2688), as a bundle
 * (`@some-ui/voice-capture`'s `bundleMachine`): the brief before the cards,
 * one card per ticket, a spoken take per ticket on the take pattern, then
 * every take looked over and sent home together. The machine holds the
 * bundle's rules (nothing leaves before Send, one take per ticket, a delete
 * before Send asks first); this is the week's spec over it:
 *
 * - **A take names its week and ticket**: `<week>:<ticket>`, like
 *   `2026-w46:QM-311`, which is also its voice note's `ref` on home
 *   (paulgsc/server `voice_repo::is_rust_round_ref`, #723). With a take per
 *   point (RR24, #3248, `./points`), each speak-to point is an item of its
 *   own and its take names it: `<week>:<ticket>:<n>`, from 1. A take of the
 *   whole ticket, recorded before, stays its ticket's item: it still shows,
 *   counts for every point and is sent, and nothing records one any more.
 * - **The draft is the week's**, named by the week's id, so a week sent
 *   opens on what was sent, and one week's takes never answer another's.
 * - **No ticket must be said**: a ticket left unsaid goes as not answered,
 *   which the essay speaks to. Send needs one take at least, and closes at
 *   the week's deadline (`due`): a take not sent by then stays on the phone.
 * - **The week stays open until `due`** (RR22, #2832; the owner's call,
 *   C56): after a Send every ticket can still be said, said again (Redo
 *   keeps the earlier take) or answered for the first time, and the week
 *   sent again. Each Send is kept on this phone beside the earlier ones
 *   (`./store`'s `weeksSent` only grow); home keeps only the latest it was
 *   sent, in place of the one before, and what it holds at `due` is what
 *   counts, for good. So each Send holds the whole week: a ticket sent
 *   before and not said since goes again with the take home already holds
 *   (`record`'s `last`), and sending again needs something changed. At
 *   `due` the week closes: nothing records or sends, and the screen reads
 *   back what home held then (`weekAtHome`).
 * - **No typing.** A ticket's answer is spoken; when voice doesn't come
 *   through, the card offers to try again or come back later.
 * - **What Send keeps** is the week sent (`WeekSent`): when, each ticket's
 *   take, and the tickets passed over, on this phone (`./store`). The takes
 *   go home as voice notes (apps/www `lib/home-link/voice-copy`), and the week
 *   sent goes home as it is kept (`lib/kept-home`, RR14), where home makes
 *   the week's record from it.
 */
import type { Week } from "@rust-rounds/lib/formats/week"
import { itemOf, pointItem, weekItems } from "@rust-rounds/lib/week-play/points"
import type {
  BundleDraft,
  BundleMachine,
  BundleSpec,
  BundleState,
  SendsAtHome,
} from "@some-ui/voice-capture"
import {
  bundleMachine,
  isPastDue,
  latestSend,
  sendsAtHome,
  weekSendKey,
} from "@some-ui/voice-capture"

/** A week's answers as sent, kept on this phone. */
export type WeekSent = {
  /** The week's id: `2026-w46`. */
  readonly week: string
  /** When it was sent, ISO. */
  readonly at: string
  /**
   * Each ticket said, in the week's order, with its take: of the whole
   * ticket, then of each point said on its own, by point.
   */
  readonly answers: ReadonlyArray<WeekAnswer>
  /** The tickets not said, in the week's order. */
  readonly passed: ReadonlyArray<string>
}

/** One take sent: of a whole ticket, or of one of its points (`point`, from 1). */
export type WeekAnswer = {
  readonly ticket: string
  /** The speak-to point it answers, from 1; absent for the whole ticket. */
  readonly point?: number
  readonly take: string
  /** When the take was recorded, ISO. */
  readonly recordedAt: string
}

/** What Send still needs, besides nothing: a take, or a week still open. */
type WeekNeed = "nothing" | "closed"

export type WeekKind = {
  readonly item: string
  readonly draft: BundleDraft
  readonly record: WeekSent
  readonly edit: { readonly type: "none" }
  readonly context: null
  readonly need: WeekNeed
}

export type WeekState = BundleState<WeekKind>

/**
 * What a take of `week`'s item answers, a ticket or one of its points
 * (`./points`): its voice note's `ref` too.
 */
export const ticketLine = (week: string, item: string): string =>
  `${week}:${item}`

/** The order answers go in: by ticket, the whole ticket's first, then by point. */
const answerOrder = (week: Week, answer: WeekAnswer): number =>
  week.tickets.findIndex(({ id }) => id === answer.ticket) * 1_000 +
  (answer.point ?? 0)

const answerKey = (answer: Pick<WeekAnswer, "ticket" | "point">): string =>
  answer.point === undefined
    ? answer.ticket
    : pointItem(answer.ticket, answer.point)

/** Whether `at` is past the week's deadline. */
export const isClosed = (week: Pick<Week, "due">, at: string): boolean =>
  isPastDue(week.due, at)

/** The shared week-send helpers, by the names this week's modules use. */
export { latestSend, weekSendKey }

/** A week's sends as home has them, as far as this phone knows. */
export type WeekAtHome = SendsAtHome<WeekSent>

/**
 * What home holds of `week` (the owner's call, C56): of the sends kept on
 * this phone, the latest by `at` home holds (`held` says, by what the link
 * remembers), and the latest made.
 */
export const weekAtHome = (
  kept: ReadonlyArray<WeekSent>,
  week: Pick<Week, "id">,
  held: (sent: WeekSent) => boolean
): WeekAtHome => sendsAtHome(kept, week.id, held)

function weekSpec(week: Week, perPoint: boolean): BundleSpec<WeekKind> {
  return {
    items: weekItems(week.tickets, perPoint),
    answersOf: ticketLine,
    required: () => false,
    typing: false,
    typedMax: 0,
    withAnswers: (_draft, answers) => answers,
    fresh: (_id, at) => ({ id: week.id, at, typed: {}, later: [] }),
    edit: (draft) => draft,
    missing: (_draft, at, said) =>
      isClosed(week, at) ? "closed" : said === 0 ? "nothing" : null,
    resumesOnCards: () => false,
    record: (draft, answers, _passed, at, last): WeekSent => {
      const said = new Map<string, WeekAnswer>(
        answers.flatMap(({ item, take }) => {
          if (take === null) return []
          const { ticket, point } = itemOf(item)
          const answer: WeekAnswer =
            point === null
              ? { ticket, take: take.id, recordedAt: take.at }
              : { ticket, point, take: take.id, recordedAt: take.at }
          return [[item, answer]]
        })
      )
      // A ticket, or point, sent before and not said since goes again as
      // home holds it.
      for (const earlier of last?.answers ?? []) {
        const key = answerKey(earlier)
        if (!said.has(key)) said.set(key, earlier)
      }
      const sent = [...said.values()].sort(
        (a, b) => answerOrder(week, a) - answerOrder(week, b)
      )
      const answered = new Set(sent.map(({ ticket }) => ticket))
      return {
        week: draft.id,
        at,
        answers: sent,
        passed: week.tickets
          .map(({ id }) => id)
          .filter((ticket) => !answered.has(ticket)),
      }
    },
    idOf: (sent) => sent.week,
    named: (sent) => sent.answers.map(({ take }) => take),
    resends: true,
    closed: (_draft, at) => isClosed(week, at),
  }
}

/**
 * The week's bundle: the shared machine over its spec, a take per point
 * where `perPoint` (home serves them; `./points`), else a take per ticket.
 */
export const weekMachine = (
  week: Week,
  perPoint = false
): BundleMachine<WeekKind> => bundleMachine(weekSpec(week, perPoint))
