/**
 * Rust Rounds' way in from Practice Home (`@some-ui/rust-rounds/entry`): its
 * name, and the week open now (`rustWeekEntry`, which once the week has
 * closed names the week whose essay it opens), or, while the phone holds
 * no week, where the session was left, read from the card kept on screen.
 * Light on purpose: it loads none of the formats' schemas, so the Home that
 * shows it carries none of the session's weight.
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import { isRecord, openKept, readJson } from "@some-ui/core-utils"

import {
  PLACE_KEY,
  WEEK_SENT_KEY,
  WEEK_TAKES_KEY,
  WEEKS_KEY,
} from "./lib/play/keys"
import type { Title } from "./lib/play/store"
import { entryLine, WORDS } from "./lib/play/words"
import { CARD_WORDS } from "./lib/week-play/card-words"
import { weekOpenNow } from "./lib/week-play/open-now"

export const RUST_ROUNDS_TITLE = WORDS.title

/** The kept card's title; null for none, or one this light read cannot make out. */
function titleOf(value: unknown): Title | null {
  const place = isRecord(value) ? value.place : null
  const title = isRecord(place) ? place.title : null
  if (!isRecord(title)) return null
  const { concept, number } = title
  return typeof concept === "string" && typeof number === "number"
    ? { concept, number }
    : null
}

/**
 * The entry's line: where the session was left, or what it is. Reads the
 * place record through the one kept-record reader; a value that is not a
 * record at all is moved aside there, as the session's own read would.
 */
export function rustRoundsEntry(storage: KeyedStorage | null): string {
  const read = readJson((value) =>
    isRecord(value) ? { title: titleOf(value) } : null
  )
  return entryLine(
    openKept(storage, PLACE_KEY, read, { title: null }).value.title
  )
}

/** A week as this light read makes it out; null where it can't. */
type CardWeek = {
  readonly id: string
  readonly opens: string
  readonly due: string
  readonly company: { readonly name: string }
  readonly tickets: ReadonlyArray<string>
}

function cardWeek(value: unknown): CardWeek | null {
  const week = isRecord(value) ? value.week : null
  if (!isRecord(week) || !isRecord(week.company)) return null
  const { id, opens, due, tickets } = week
  const { name } = week.company
  if (
    typeof id !== "string" ||
    typeof opens !== "string" ||
    typeof due !== "string" ||
    typeof name !== "string" ||
    !Array.isArray(tickets)
  ) {
    return null
  }
  const ids = tickets.flatMap((ticket) =>
    isRecord(ticket) && typeof ticket.id === "string" ? [ticket.id] : []
  )
  return { id, opens, due, company: { name }, tickets: ids }
}

/** The tickets of `week` said or sent, by the takes on the week's desk. */
function saidOn(storage: KeyedStorage | null, week: CardWeek): number {
  const read = readJson((value) => (Array.isArray(value) ? value : null))
  const takes: ReadonlyArray<unknown> = openKept<ReadonlyArray<unknown>>(
    storage,
    WEEK_TAKES_KEY,
    read,
    []
  ).value
  const said = new Set(
    takes.flatMap((take) =>
      isRecord(take) &&
      typeof take.line === "string" &&
      take.standing === undefined
        ? [take.line]
        : []
    )
  )
  return week.tickets.filter((ticket) => said.has(`${week.id}:${ticket}`))
    .length
}

/**
 * The card for the week open now: its line, and once its deadline has
 * passed, the week whose essay the card opens (RR17, #2692), else `null`.
 */
export type RustWeekCard = {
  readonly line: string
  readonly essay: string | null
}

/**
 * The card for the week open at `at` (RR13), the same week the screen opens
 * on (`lib/week-play/runtime`'s `currentWeek`); null while the phone holds no
 * week, when the card says what the rounds' entry says.
 */
export function rustWeekEntry(
  storage: KeyedStorage | null,
  at: number
): RustWeekCard | null {
  const readList = readJson((value) =>
    isRecord(value) && Array.isArray(value.weeks) ? value.weeks : null
  )
  const weeks = openKept<ReadonlyArray<unknown>>(
    storage,
    WEEKS_KEY,
    readList,
    []
  ).value.flatMap((each) => {
    const week = cardWeek(each)
    return week === null ? [] : [week]
  })
  const week = weekOpenNow(weeks, ({ opens }) => opens, at)
  if (week === null) return null
  const readSent = readJson((value) => (Array.isArray(value) ? value : null))
  const due = Date.parse(week.due)
  // The last send kept by the deadline, as home's record reads it (RR22).
  const sent = openKept<ReadonlyArray<unknown>>(
    storage,
    WEEK_SENT_KEY,
    readSent,
    []
  )
    .value.slice()
    .reverse()
    .find(
      (each) =>
        isRecord(each) &&
        each.week === week.id &&
        typeof each.at === "string" &&
        Date.parse(each.at) <= due
    )
  const of = week.tickets.length
  const closed = due < at
  // Past its deadline, the card opens the week's essay (RR17).
  const essay = closed ? week.id : null
  if (isRecord(sent) && Array.isArray(sent.answers)) {
    const n = sent.answers.length
    return {
      line: closed
        ? CARD_WORDS.closedSent(week, n, of)
        : CARD_WORDS.sent(week, n, of),
      essay,
    }
  }
  if (closed) return { line: CARD_WORDS.closed(week), essay }
  return { line: CARD_WORDS.open(week, saidOn(storage, week), of), essay }
}
