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
 *   The opening's questions (#3269) come first, each an item, `opening:<n>`,
 *   whose take names `<week>:opening:<n>` and goes in the send's `opening`.
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
 *   take, the tickets passed over and, where home keeps them, the decision
 *   at each fork (`verdicts`, RR29), on this phone (`./store`). A decision
 *   changed since the last Send counts as a change to send again. The takes
 *   go home as voice notes (apps/www `lib/home-link/voice-copy`), and the week
 *   sent goes home as it is kept (`lib/kept-home`, RR14), where home makes
 *   the week's record from it.
 */
import type { Decision, DecisionsSent } from "@rust-rounds/lib/decisions"
import type { Week } from "@rust-rounds/lib/formats/week"
import { openingTakeSent } from "@rust-rounds/lib/week-play/opening"
import {
  itemOf,
  openingItem,
  openingOf,
  pointItem,
  weekItems,
} from "@rust-rounds/lib/week-play/points"
import type {
  BundleDraft,
  BundleMachine,
  BundleSpec,
  BundleState,
  HomeSent,
  PatternTake,
  SendsAtHomeSaid,
} from "@some-ui/voice-capture"
import {
  bundleMachine,
  HOME_UNKNOWN,
  isPastDue,
  latestSend,
  sendsAtHomeSaid,
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
  /**
   * The decision at every fork with options (RR29, C693), by ticket and
   * fork, where this build's home keeps them (contract epoch 24 on); absent
   * otherwise, and for a `/1` week, whose forks offer nothing to pick.
   */
  readonly verdicts?: ReadonlyArray<WeekVerdict>
  /**
   * The takes of the opening's questions said this week (#3269, C736), by
   * question, each under the version of the opening it answers, where this
   * build's home keeps them (contract epoch 25 on); absent when none was
   * said. Each goes home as a voice note named `<week>:opening:<n>`. Home
   * plays the newest of each question's takes under the week's version,
   * from this week or an earlier one, so a question not said again goes
   * with the take it already holds.
   */
  readonly opening?: ReadonlyArray<OpeningSent>
}

/** One opening take as sent: its question, from 1, and how long it runs, in whole ms. */
export type OpeningSent = {
  readonly n: number
  readonly take: string
  /** When it was recorded, ISO. */
  readonly recordedAt: string
  /** The version of the opening its words answer. */
  readonly version: number
  readonly ms: number
}

/** The opening a week's spec records takes for: its version and how many questions. */
export type OpeningSpec = { readonly version: number; readonly count: number }

/**
 * One fork's decision as sent: named `<week>:<ticket>:<n>:verdict`, beside
 * the fork's take, `<week>:<ticket>:<n>` (RR24), whose words say why. Its
 * shape is the essay's `DecisionSchema` (video-render, RR29), less an own
 * option's words, which are the fork's take.
 */
type WeekVerdict = {
  readonly ref: string
  readonly decision: Decision
}

/** The ref a fork's decision is sent under: `2026-w47:TB-101:1:verdict`. */
const verdictRef = (week: string, ticket: string, fork: number): string =>
  `${ticketLine(week, pointItem(ticket, fork))}:verdict`

/** The decisions of `sent` as `<ref>=<decision>` lines, to tell a change. */
const verdictLines = (sent: WeekSent): ReadonlyArray<string> =>
  (sent.verdicts ?? []).map(
    ({ ref, decision }) =>
      `${ref}=${decision.kind === "option" ? decision.option : decision.kind}`
  )

/** `decisions` as they go home with a week sent. */
const weekVerdicts = (
  week: string,
  decisions: DecisionsSent
): ReadonlyArray<WeekVerdict> =>
  decisions.flatMap(({ ticket, forks }) =>
    forks.map(({ fork, decision }) => ({
      ref: verdictRef(week, ticket, fork),
      decision,
    }))
  )

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

/** What home's own record of a week says was sent (RR30). */
export type HomeWeekSent = HomeSent

/**
 * A week's sends as home has them, as far as this phone knows, and whether
 * home's own record said so (`homeSaid`, RR30).
 */
export type WeekAtHome = SendsAtHomeSaid<WeekSent>

/**
 * What home holds of `week` (the owner's call, C56): of the sends kept on
 * this phone, the latest by `at` home holds, and the latest made, settled by
 * home's own record where it spoke (`sendsAtHomeSaid`, RR30).
 */
export const weekAtHome = (
  kept: ReadonlyArray<WeekSent>,
  week: Pick<Week, "id">,
  held: (sent: WeekSent) => boolean,
  home: HomeWeekSent = HOME_UNKNOWN
): WeekAtHome => sendsAtHomeSaid(kept, week.id, held, home)

/** What the week's spec reads besides the week, each optional. */
export type WeekSpecOptions = {
  /** A take per speak-to point (RR24), else per ticket. */
  readonly perPoint?: boolean
  /** The decision at each fork, read at Send (RR29); null where home keeps none. */
  readonly decisions?: (() => DecisionsSent) | null
  /**
   * The opening the week records takes for (#3269), where the week has one
   * and this build's home keeps them; null otherwise.
   */
  readonly opening?: OpeningSpec | null
  /** The takes on this phone answering `line`, whatever their standing. */
  readonly takesOf?: (line: string) => ReadonlyArray<PatternTake>
}

/**
 * The week's spec. `decisions`, where home keeps them, reads the decision
 * at each fork when Send makes the record: they live in their own list
 * (`./store`'s `weekPicks`), not the draft. The opening's questions come
 * first among the items (#3269), and their takes go in the record's
 * `opening`, never among the tickets' answers.
 */
function weekSpec(
  week: Week,
  {
    perPoint = false,
    decisions = null,
    opening = null,
    takesOf = (): ReadonlyArray<PatternTake> => [],
  }: WeekSpecOptions
): BundleSpec<WeekKind> {
  return {
    items: weekItems(week.tickets, perPoint, opening?.count ?? 0),
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
      // Every take of each question said this week (the owner's call,
      // C783: "Every take you record goes home with the send, and only the
      // newest is used"), and those an earlier send named, each once.
      const opened = new Map<string, OpeningSent>()
      for (const earlier of last?.opening ?? [])
        opened.set(earlier.take, earlier)
      for (let n = 1; n <= (opening?.count ?? 0); n += 1) {
        for (const take of takesOf(ticketLine(draft.id, openingItem(n)))) {
          if (opening === null || opened.has(take.id)) continue
          opened.set(take.id, openingTakeSent(n, take, opening.version))
        }
      }
      const openingSent = [...opened.values()].sort(
        (a, b) =>
          a.n - b.n ||
          (a.recordedAt < b.recordedAt
            ? -1
            : a.recordedAt > b.recordedAt
              ? 1
              : 0)
      )
      const said = new Map<string, WeekAnswer>(
        answers.flatMap(({ item, take }) => {
          if (take === null || openingOf(item) !== null) return []
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
      const verdicts =
        decisions === null ? [] : weekVerdicts(draft.id, decisions())
      return {
        week: draft.id,
        at,
        answers: sent,
        passed: week.tickets
          .map(({ id }) => id)
          .filter((ticket) => !answered.has(ticket)),
        ...(verdicts.length === 0 ? {} : { verdicts }),
        ...(openingSent.length === 0 ? {} : { opening: openingSent }),
      }
    },
    idOf: (sent) => sent.week,
    named: (sent) => [
      ...sent.answers.map(({ take }) => take),
      ...(sent.opening ?? []).map(({ take }) => take),
    ],
    carries: verdictLines,
    resends: true,
    closed: (_draft, at) => isClosed(week, at),
    // Every take of the opening's answers goes home (C783).
    keepsEvery: (line) => /:opening:[1-9]$/.test(line),
  }
}

/**
 * The week's bundle: the shared machine over its spec, a take per point
 * where `perPoint` (home serves them; `./points`), else a take per ticket,
 * and the opening's questions first where `opening` is given.
 */
export const weekMachine = (
  week: Week,
  options: WeekSpecOptions = {}
): BundleMachine<WeekKind> => bundleMachine(weekSpec(week, options))
