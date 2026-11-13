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
 *   (paulgsc/server `voice_repo::is_rust_round_ref`, #723).
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
import type {
  BundleDraft,
  BundleMachine,
  BundleSpec,
  BundleState,
} from "@some-ui/voice-capture"
import { bundleMachine } from "@some-ui/voice-capture"

/** A week's answers as sent, kept on this phone. */
export type WeekSent = {
  /** The week's id: `2026-w46`. */
  readonly week: string
  /** When it was sent, ISO. */
  readonly at: string
  /** Each ticket said, in the week's order, with its take. */
  readonly answers: ReadonlyArray<{
    readonly ticket: string
    readonly take: string
    /** When the take was recorded, ISO. */
    readonly recordedAt: string
  }>
  /** The tickets not said, in the week's order. */
  readonly passed: ReadonlyArray<string>
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

/** What a take of `week`'s `ticket` answers: its voice note's `ref` too. */
export const ticketLine = (week: string, ticket: string): string =>
  `${week}:${ticket}`

/** Whether `at` is past the week's deadline. */
export const isClosed = (week: Pick<Week, "due">, at: string): boolean =>
  Date.parse(at) > Date.parse(week.due)

/** How home knows one send of a week, and how this phone remembers it went: `2026-w46/<at>`. */
export const weekSendKey = (sent: Pick<WeekSent, "week" | "at">): string =>
  `${sent.week}/${sent.at}`

/** A week's sends as home has them, as far as this phone knows. */
export type WeekAtHome = {
  /**
   * The latest send home holds: what counts once the week closes; null
   * when home holds none.
   */
  readonly holds: WeekSent | null
  /** The latest send made on this phone, home's or not; null for none. */
  readonly last: WeekSent | null
}

/**
 * What home holds of `week` (the owner's call, C56): of the sends kept on
 * this phone, the latest by `at` home holds (`held` says, by what the link
 * remembers), and the latest made. A send home doesn't hold by the deadline
 * never counts: home refuses it after.
 */
export function weekAtHome(
  kept: ReadonlyArray<WeekSent>,
  week: Pick<Week, "id">,
  held: (sent: WeekSent) => boolean
): WeekAtHome {
  const sends = kept.filter((sent) => sent.week === week.id)
  return { holds: latestSend(sends.filter(held)), last: latestSend(sends) }
}

/** The send of `sends` made last, by instant; null for none. */
export const latestSend = (sends: ReadonlyArray<WeekSent>): WeekSent | null =>
  sends.reduce<WeekSent | null>(
    (latest, sent) =>
      latest === null || Date.parse(sent.at) >= Date.parse(latest.at)
        ? sent
        : latest,
    null
  )

function weekSpec(week: Week): BundleSpec<WeekKind> {
  return {
    items: week.tickets.map(({ id }) => id),
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
    record: (draft, answers, passed, at, last): WeekSent => {
      const said = new Map(
        answers.flatMap(({ item, take }) =>
          take === null
            ? []
            : [[item, { ticket: item, take: take.id, recordedAt: take.at }]]
        )
      )
      // A ticket sent before and not said since goes again as home holds it.
      for (const earlier of last?.answers ?? []) {
        if (!said.has(earlier.ticket)) said.set(earlier.ticket, earlier)
      }
      const order = week.tickets.map(({ id }) => id)
      return {
        week: draft.id,
        at,
        answers: order.flatMap((ticket) => {
          const answer = said.get(ticket)
          return answer === undefined ? [] : [answer]
        }),
        passed: passed.filter((ticket) => !said.has(ticket)),
      }
    },
    idOf: (sent) => sent.week,
    named: (sent) => sent.answers.map(({ take }) => take),
    resends: true,
    closed: (_draft, at) => isClosed(week, at),
  }
}

/** The week's bundle: the shared machine over its spec. */
export const weekMachine = (week: Week): BundleMachine<WeekKind> =>
  bundleMachine(weekSpec(week))
