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

export type Held = {
  /** Rounds taken from a tutor, in the order taken. */
  readonly rounds: ReadonlyArray<Round>
  /** rustc's recorded run of a card's program, by `cardKey`. */
  readonly runs: Readonly<Record<string, RustcRun>>
  /** Every version of the tutor notes taken, oldest first. */
  readonly notes: ReadonlyArray<TutorNotes>
  /** The last reply taken carried no tutor notes: the next tutor hears so. */
  readonly notesMissing: boolean
}

export const NOTHING_HELD: Held = {
  rounds: [],
  runs: {},
  notes: [],
  notesMissing: false,
}

/** A card's name across rounds: `indexing-01/a`. */
const cardKey = (ref: CardRef): string => `${ref.round}/${ref.card}`

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
