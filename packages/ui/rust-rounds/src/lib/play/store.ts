/**
 * Rust Rounds' kept records on the phone, through the one reader and writer
 * of a kept record (core-utils `openKept`/`writeKept`, KR1): a value this
 * build cannot read whole is copied aside before anything is written over
 * it, and storage that cannot be read takes no write at all.
 *
 * - `LOG_KEY`, the log (`some-ui.rust-round-log/1`). Append-only: `append`
 *   opens what is stored and adds to it, never writing the session's own copy
 *   over it.
 * - `HELD_KEY`, what plays: the rounds taken, rustc's recorded runs, every
 *   version of the tutor notes (`./held`).
 * - `PLACE_KEY`, the card on screen and how far into it, so leaving at any
 *   card and coming back lands on it with nothing lost; and the cards left
 *   while their voice note was still being kept (`pending`), so a note that
 *   lands after the app was left, or was ended, still finds its card.
 */
import type { CardEvent, CardRef, RoundLog } from "@rust-rounds/lib/formats"
import {
  CardEventSchema,
  RoundLogSchema,
  RoundSchema,
  RustcRunSchema,
  TutorNotesSchema,
} from "@rust-rounds/lib/formats"
import type { KeyedStorage } from "@some-ui/core-utils"
import { openKept, readJson, writeKept } from "@some-ui/core-utils"
import { z } from "zod"

import type { Held } from "./held"
import { NOTHING_HELD } from "./held"
import { HELD_KEY, LOG_KEY, PLACE_KEY } from "./keys"
import type { LogAdd, SessionHead } from "./log"
import { appendToLog, EMPTY_LOG } from "./log"

export { HELD_KEY, LOG_KEY, PLACE_KEY } from "./keys"

/** How far into a card: choosing, speaking to a choice, or seeing rustc's result. */
type Stage = "choose" | "speak" | "see"

/**
 * Whether the card was played before it came up: never, in an earlier turn,
 * or just now, the only card left to come back to.
 */
export type Again = "fresh" | "played" | "same"

/** The card on screen, and what has happened on it so far. */
export type Visit = CardRef & {
  readonly stage: Stage
  /** The `pick` of the choice taken; null while none is. */
  readonly picked: string | null
  /** The voice note said on this card; null while none is kept. */
  readonly note: string | null
  /** rustc's result has been shown. */
  readonly shown: boolean
  readonly pinned: boolean
  readonly again: Again
}

/** What the entry says to come back to a card: its concept and number. */
export type Title = { readonly concept: string; readonly number: number }

/** Where the person is: the card on screen, and the concept they chose. */
export type Place = {
  readonly visit: Visit
  /** The concept picked from the menu; null for Mixed. */
  readonly menu: string | null
  readonly title: Title
}

/** A card left while its voice note was still being kept: logged once it lands. */
export type Pending = {
  /** What the take was started on (`lineOf`). */
  readonly line: string
  /** When the take was started (ms since the epoch). */
  readonly since: number
  readonly title: Title
  /** The card's event, its note still null. */
  readonly event: CardEvent
  readonly guessedWrong: boolean
}

const HeldSchema = z.strictObject({
  v: z.literal(1),
  rounds: z.array(RoundSchema),
  runs: z.record(z.string(), RustcRunSchema),
  notes: z.array(TutorNotesSchema),
  notesMissing: z.boolean(),
})

const TitleSchema = z.strictObject({
  concept: z.string(),
  number: z.int().positive(),
})

const PlaceRecordSchema = z.strictObject({
  v: z.literal(1),
  place: z
    .strictObject({
      visit: z.strictObject({
        round: z.string(),
        card: z.string(),
        stage: z.enum(["choose", "speak", "see"]),
        picked: z.string().nullable(),
        note: z.string().nullable(),
        shown: z.boolean(),
        pinned: z.boolean(),
        again: z.enum(["fresh", "played", "same"]),
      }),
      menu: z.string().nullable(),
      title: TitleSchema,
    })
    .nullable(),
  pending: z.array(
    z.strictObject({
      line: z.string(),
      since: z.number(),
      title: TitleSchema,
      event: CardEventSchema,
      guessedWrong: z.boolean(),
    })
  ),
})

function parsed<T>(schema: z.ZodType<T>): (value: unknown) => T | null {
  return (value) => {
    const result = schema.safeParse(value)
    return result.success ? result.data : null
  }
}

const readLog = readJson(parsed(RoundLogSchema))
const readHeld = readJson(parsed(HeldSchema))
const readPlace = readJson(parsed(PlaceRecordSchema))

/** What the store opened: each record, or what stands in for one it could not read. */
export type Opened = {
  readonly log: RoundLog
  readonly held: Held
  readonly place: Place | null
  readonly pending: ReadonlyArray<Pending>
}

export type RoundsStore = {
  readonly open: () => Opened
  /** Adds to the stored log; false when the phone did not keep it. */
  readonly append: (head: SessionHead, add: LogAdd) => boolean
  /** Keeps what plays; false when the phone did not keep it. */
  readonly hold: (held: Held) => boolean
  /** Keeps the card on screen and the cards waiting on a note; false when the phone did not keep them. */
  readonly place: (
    place: Place | null,
    pending: ReadonlyArray<Pending>
  ) => boolean
}

/** The records in `storage`; with none (or one that throws), nothing is kept. */
export function keptRounds(storage: KeyedStorage | null): RoundsStore {
  return {
    open(): Opened {
      const { v: _held, ...held } = openKept(storage, HELD_KEY, readHeld, {
        v: 1,
        ...NOTHING_HELD,
      }).value
      const { place, pending } = openKept(storage, PLACE_KEY, readPlace, {
        v: 1,
        place: null,
        pending: [],
      }).value
      return {
        log: openKept(storage, LOG_KEY, readLog, EMPTY_LOG).value,
        held,
        place,
        pending,
      }
    },
    append(head, add): boolean {
      const kept = openKept(storage, LOG_KEY, readLog, EMPTY_LOG)
      if (!kept.writable) return false
      return writeKept(
        storage,
        LOG_KEY,
        appendToLog(kept.value, head, add),
        readLog
      )
    },
    hold(held): boolean {
      return writeKept(storage, HELD_KEY, { v: 1, ...held }, readHeld)
    },
    place(place, pending): boolean {
      return writeKept(storage, PLACE_KEY, { v: 1, place, pending }, readPlace)
    },
  }
}
