/**
 * What the phone holds to play, and the order it plays it in. Pure: `./store`
 * keeps it, `./machine` reads it.
 *
 * - **The worked example is always held.** `indexing-01` (`lib/worked-example`)
 *   is the first round, with rustc's recorded runs bundled, so the session
 *   plays end to end before any tutor has written a round or home has
 *   recorded a run.
 * - **Rounds and tutor notes are only added.** A round taken from a tutor is
 *   appended, and every version of the tutor notes is kept, oldest first.
 * - **There is no last card.** `nextCard` offers the cards not played yet,
 *   then the one played longest ago, so Next always has somewhere to go.
 * - **What home holds is only added to as well** (RR4b, #2347). A round
 *   pasted here is sent home (`lib/home`), and the rounds home holds come
 *   back with the runs home recorded of their programs: a round the phone
 *   lacks is appended, and a card's run is filled in once and never
 *   replaced. Every write is merged (`mergeHeld`); an open session takes
 *   the store's writes through `heldOverSession` (RH1).
 */
import type {
  Card,
  CardRef,
  Round,
  RoundLog,
  RustcRun,
  TutorNotes,
} from "@rust-rounds/lib/formats"
import type { Finding } from "@rust-rounds/lib/lint"
import { lintRound } from "@rust-rounds/lib/lint"
import {
  INDEXING_01,
  INDEXING_01_NOTES,
  INDEXING_01_RUNS,
} from "@rust-rounds/lib/worked-example"
import { canonicalJson } from "@some-ui/core-utils"

/**
 * Why home did not take a round sent from here: it holds another round
 * under that id (`other-round`), or it refused the round itself
 * (`not-taken`). Either way the round stays here and plays, and is not
 * sent again.
 */
export type HomeRefusal = {
  readonly id: string
  readonly why: "other-round" | "not-taken"
}

/** What this phone knows of the rounds home holds, by round id. */
export type OnHome = {
  /** Rounds taken here that home took when this phone sent them. */
  readonly sent: ReadonlyArray<string>
  /** Rounds this phone took from home, which it did not hold before. */
  readonly fetched: ReadonlyArray<string>
  /** Rounds taken here that home did not take. */
  readonly refused: ReadonlyArray<HomeRefusal>
  /** Rounds home holds that this phone can't read, so doesn't play. */
  readonly unread: ReadonlyArray<string>
  /**
   * Cards, by `cardKey`, whose program home ended for good without a
   * recording the phone can read (refused, the runner lost twice, or
   * recorded in a shape this phone can't read): no run of it will come,
   * so the card stops waiting for one and is not asked about again.
   */
  readonly ended: ReadonlyArray<string>
}

export type Held = {
  /** Rounds taken from a tutor, or from home, in the order taken. */
  readonly rounds: ReadonlyArray<Round>
  /** rustc's recorded run of a card's program, by `cardKey`. */
  readonly runs: Readonly<Record<string, RustcRun>>
  /** Every version of the tutor notes taken, oldest first. */
  readonly notes: ReadonlyArray<TutorNotes>
  /** The last reply taken carried no tutor notes: the next tutor hears so. */
  readonly notesMissing: boolean
  readonly home: OnHome
}

export const NOTHING_ON_HOME: OnHome = {
  sent: [],
  fetched: [],
  refused: [],
  unread: [],
  ended: [],
}

export const NOTHING_HELD: Held = {
  rounds: [],
  runs: {},
  notes: [],
  notesMissing: false,
  home: NOTHING_ON_HOME,
}

/** A card's name across rounds: `indexing-01/a`. */
export const cardKey = (ref: CardRef): string => `${ref.round}/${ref.card}`

/** The round a `cardKey` names: ids are slugs, so the key has one `/`. */
const roundOfKey = (key: string): string => key.slice(0, key.indexOf("/"))

/** `ids`, then each of `more` not among them. */
function joined(
  ids: ReadonlyArray<string>,
  more: ReadonlyArray<string>
): ReadonlyArray<string> {
  const seen = new Set(ids)
  const added = more.filter((id) => !seen.has(id))
  return added.length === 0 ? ids : [...ids, ...new Set(added)]
}

/**
 * `next` written over `stored`, keeping everything `stored` holds: its
 * rounds, the run of each card it holds one for, every version of the tutor
 * notes and what it knows of home, with what `next` adds after. The session
 * and the exchange with home each write what they read earlier, so neither
 * may drop what the other wrote since. Whether the last reply carried tutor
 * notes is `next`'s, which only the session's reply changes.
 */
export function mergeHeld(stored: Held, next: Held): Held {
  const ids = new Set(stored.rounds.map((round) => round.id))
  const notes = new Set(stored.notes.map((each) => canonicalJson(each)))
  const sent = joined(stored.home.sent, next.home.sent)
  const fetched = joined(stored.home.fetched, next.home.fetched)
  const onHome = new Set([...sent, ...fetched])
  const refusedIds = new Set(stored.home.refused.map(({ id }) => id))
  return {
    rounds: [
      ...stored.rounds,
      ...next.rounds.filter((round) => !ids.has(round.id)),
    ],
    runs: { ...next.runs, ...stored.runs },
    notes: [
      ...stored.notes,
      ...next.notes.filter((each) => !notes.has(canonicalJson(each))),
    ],
    notesMissing: next.notesMissing,
    home: {
      sent,
      fetched,
      refused: [
        ...stored.home.refused,
        ...next.home.refused.filter(({ id }) => !refusedIds.has(id)),
      ].filter(({ id }) => !onHome.has(id)),
      // A round can be on home and still not read back here.
      unread: joined(stored.home.unread, next.home.unread),
      ended: joined(stored.home.ended, next.home.ended),
    },
  }
}

/**
 * What the store holds now (`stored`) written over what an open session holds
 * (`session`), keeping the session's version of every round it holds (RH1):
 * a round the phone did not keep plays on, and home's copy of the same id,
 * taken in the meantime, replaces neither the round nor any card of it. The
 * stored runs and ended programs of a replaced version's cards go with it, so
 * nothing home knows of one version shows under the other's program. The
 * store keeps home's version, which the next opening plays.
 */
export function heldOverSession(stored: Held, session: Held): Held {
  const ours = new Map(session.rounds.map((round) => [round.id, round]))
  const replaced = new Set(
    stored.rounds
      .filter((round) => {
        const mine = ours.get(round.id)
        return (
          mine !== undefined && canonicalJson(mine) !== canonicalJson(round)
        )
      })
      .map((round) => round.id)
  )
  const kept = (key: string): boolean => !replaced.has(roundOfKey(key))
  return mergeHeld(
    {
      ...stored,
      rounds: stored.rounds.map((round) => ours.get(round.id) ?? round),
      runs: Object.fromEntries(
        Object.entries(stored.runs).filter(([key]) => kept(key))
      ),
      home: { ...stored.home, ended: stored.home.ended.filter(kept) },
    },
    session
  )
}

/** Every round the phone can play: the worked example, then those taken. */
export function playable(held: Held): ReadonlyArray<Round> {
  return [
    INDEXING_01,
    ...held.rounds.filter((round) => round.id !== INDEXING_01.id),
  ]
}

/** rustc's recorded run of a card's program; null when none is on the phone. */
export function runOf(held: Held, ref: CardRef): RustcRun | null {
  const recorded = held.runs[cardKey(ref)]
  if (recorded !== undefined) return recorded
  return ref.round === INDEXING_01.id
    ? (INDEXING_01_RUNS[ref.card] ?? null)
    : null
}

/** Home ended the card's program for good without a run (`OnHome.ended`). */
export const noRunWillCome = (held: Held, ref: CardRef): boolean =>
  held.home.ended.includes(cardKey(ref))

/**
 * Why a card has no run on the phone: one may still come from home
 * (`waits`), home ended its program for good (`ended`), home didn't take
 * its round (`refused`), this phone couldn't read its round as home holds
 * it, so reads it no more (`unread`), or the build has no home (`no-home`).
 */
export type NoRun = "waits" | "ended" | "refused" | "unread" | "no-home"

export function whyNoRun(held: Held, ref: CardRef, home: boolean): NoRun {
  if (!home) return "no-home"
  if (held.home.refused.some(({ id }) => id === ref.round)) return "refused"
  if (held.home.unread.includes(ref.round)) return "unread"
  return noRunWillCome(held, ref) ? "ended" : "waits"
}

/** The tutor notes written last: the worked example's before any were taken. */
export function notesNow(held: Held): TutorNotes {
  return held.notes.at(-1) ?? INDEXING_01_NOTES
}

/** What the next tutor hears about the round taken last. */
export function findingsNow(held: Held, log: RoundLog): Array<Finding> {
  const last = held.rounds.at(-1)
  if (last === undefined) return []
  return [
    ...(held.notesMissing ? [{ kind: "no-tutor-notes" } as const] : []),
    ...lintRound(last, log),
  ]
}

/** A card with its round, and its place in that round (from 1). */
export type Located = {
  readonly round: Round
  readonly card: Card
  readonly number: number
}

export function locate(
  rounds: ReadonlyArray<Round>,
  ref: CardRef
): Located | null {
  const round = rounds.find((each) => each.id === ref.round)
  const index = round?.cards.findIndex((card) => card.id === ref.card) ?? -1
  const card = round?.cards[index]
  return round === undefined || card === undefined
    ? null
    : { round, card, number: index + 1 }
}

/** The concepts with a round built from an error pasted from the desk (RR4c). */
export function deskConcepts(rounds: ReadonlyArray<Round>): Set<string> {
  return new Set(
    rounds
      .filter((round) => (round.fromMyDesk ?? []).length > 0)
      .map((round) => round.concept)
  )
}

/** Each concept the rounds cover, once, in the order first held. */
export function conceptsOf(rounds: ReadonlyArray<Round>): Array<string> {
  return [...new Set(rounds.map((round) => round.concept))]
}

/** Every card, round by round; only one concept's when `concept` names one. */
function orderOf(
  rounds: ReadonlyArray<Round>,
  concept: string | null
): Array<CardRef> {
  return rounds
    .filter((round) => concept === null || round.concept === concept)
    .flatMap((round) =>
      round.cards.map((card) => ({ round: round.id, card: card.id }))
    )
}

/** When each card was last played, by `cardKey`. */
function lastPlayed(log: RoundLog): Map<string, string> {
  const played = new Map<string, string>()
  for (const session of log.sessions) {
    for (const event of session.cards) {
      const key = cardKey(event)
      const at = played.get(key)
      if (at === undefined || event.at > at) played.set(key, event.at)
    }
  }
  return played
}

/**
 * The card after `current` (Mixed when `concept` is null): the first one not
 * played yet, looking on from `current`; with every card played, the one
 * played longest ago. Null only when the concept holds no card at all.
 */
export function nextCard(
  rounds: ReadonlyArray<Round>,
  log: RoundLog,
  concept: string | null,
  current: CardRef | null
): CardRef | null {
  const order = orderOf(rounds, concept)
  const at =
    current === null
      ? -1
      : order.findIndex((ref) => cardKey(ref) === cardKey(current))
  const onward = [...order.slice(at + 1), ...order.slice(0, Math.max(at, 0))]
  const others = onward.filter(
    (ref) => current === null || cardKey(ref) !== cardKey(current)
  )
  const played = lastPlayed(log)
  const fresh = others.find((ref) => !played.has(cardKey(ref)))
  if (fresh !== undefined) return fresh
  const oldest = [...others].sort((a, b) =>
    (played.get(cardKey(a)) ?? "").localeCompare(played.get(cardKey(b)) ?? "")
  )[0]
  return oldest ?? order[0] ?? null
}

/** Rounds none of whose cards has been played: what is new from the tutor. */
export function newRounds(
  rounds: ReadonlyArray<Round>,
  log: RoundLog
): Array<Round> {
  const played = lastPlayed(log)
  return rounds.filter((round) =>
    round.cards.every(
      (card) => !played.has(cardKey({ round: round.id, card: card.id }))
    )
  )
}

/** Refine cards not played yet: earlier notes waiting to be said again. */
export function refinesWaiting(
  rounds: ReadonlyArray<Round>,
  log: RoundLog
): number {
  const played = lastPlayed(log)
  return rounds.flatMap((round) =>
    round.cards.filter(
      (card) =>
        card.kind === "refine" &&
        !played.has(cardKey({ round: round.id, card: card.id }))
    )
  ).length
}
