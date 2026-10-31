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
 *   card and coming back lands on it with nothing lost.
 */
import type { CardRef, RoundLog } from "@rust-rounds/lib/formats"
import {
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
import type { LogAdd, SessionHead } from "./log"
import { appendToLog, EMPTY_LOG } from "./log"

export const LOG_KEY = "some-ui:rust-rounds.log"
export const HELD_KEY = "some-ui:rust-rounds.held"
export const PLACE_KEY = "some-ui:rust-rounds.place"

/** How far into a card: choosing, speaking to a choice, or seeing rustc's result. */
type Stage = "choose" | "speak" | "see"

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
}

/** Where the person is: the card on screen, and the concept they chose. */
export type Place = {
  readonly visit: Visit
  /** The concept picked from the menu; null for Mixed. */
  readonly menu: string | null
  /** What the entry says to come back to it: the card's concept and number. */
  readonly title: { readonly concept: string; readonly number: number }
}

const HeldSchema = z.strictObject({
  v: z.literal(1),
  rounds: z.array(RoundSchema),
  runs: z.record(z.string(), RustcRunSchema),
  notes: z.array(TutorNotesSchema),
  notesMissing: z.boolean(),
})

const PlaceSchema = z.strictObject({
  v: z.literal(1),
  visit: z.strictObject({
    round: z.string(),
    card: z.string(),
    stage: z.enum(["choose", "speak", "see"]),
    picked: z.string().nullable(),
    note: z.string().nullable(),
    shown: z.boolean(),
    pinned: z.boolean(),
  }),
  menu: z.string().nullable(),
  title: z.strictObject({
    concept: z.string(),
    number: z.int().positive(),
  }),
})

function parsed<T>(schema: z.ZodType<T>): (value: unknown) => T | null {
  return (value) => {
    const result = schema.safeParse(value)
    return result.success ? result.data : null
  }
}

const readLog = readJson(parsed(RoundLogSchema))
const readHeld = readJson(parsed(HeldSchema))
const readPlace = readJson(parsed(PlaceSchema))

/** What the store opened: each record, or what stands in for one it could not read. */
export type Opened = {
  readonly log: RoundLog
  readonly held: Held
  readonly place: Place | null
}

export type RoundsStore = {
  readonly open: () => Opened
  /** Adds to the stored log; false when the phone did not keep it. */
  readonly append: (head: SessionHead, add: LogAdd) => boolean
  /** Keeps what plays; false when the phone did not keep it. */
  readonly hold: (held: Held) => boolean
  /** Keeps the card on screen; false when the phone did not keep it. */
  readonly place: (place: Place) => boolean
}

/** The card left on screen last, or null for none (or none readable). */
export function openPlace(storage: KeyedStorage | null): Place | null {
  const place = openKept(storage, PLACE_KEY, readPlace, null).value
  return place === null
    ? null
    : { visit: place.visit, menu: place.menu, title: place.title }
}

/** The records in `storage`; with none (or one that throws), nothing is kept. */
export function keptRounds(storage: KeyedStorage | null): RoundsStore {
  return {
    open(): Opened {
      const { v: _held, ...held } = openKept(storage, HELD_KEY, readHeld, {
        v: 1,
        ...NOTHING_HELD,
      }).value
      return {
        log: openKept(storage, LOG_KEY, readLog, EMPTY_LOG).value,
        held,
        place: openPlace(storage),
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
    place(place): boolean {
      return writeKept(storage, PLACE_KEY, { v: 1, ...place }, readPlace)
    },
  }
}
