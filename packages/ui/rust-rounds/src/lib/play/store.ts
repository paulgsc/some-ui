/**
 * Rust Rounds' kept records on the phone, through the one reader and writer
 * of a kept record (core-utils `openKept`/`writeKept`, KR1): a value this
 * build cannot read whole is copied aside before anything is written over
 * it, and storage that cannot be read takes no write at all.
 *
 * - `LOG_KEY`, the log (`some-ui.rust-round-log/1`). Append-only: `append`
 *   opens what is stored and adds to it, never writing the session's own copy
 *   over it. A card's event is added once: one the stored log already holds
 *   (the same card, left at the same moment) is not added again, so two
 *   openings that both settle a card left waiting on its note log it once.
 *   An addition the phone refused is not dropped: it is kept (`unlogged`, in
 *   the place record, and in memory should that write be refused too, which
 *   then lasts only as long as this opening) and
 *   written with the next addition, or by `flush` at the next opening, and
 *   `append` says false until every one of them is in the log.
 * - `HELD_KEY`, what plays: the rounds taken, rustc's recorded runs, every
 *   version of the tutor notes (`./held`).
 * - `PLACE_KEY`, the card on screen and how far into it, so leaving at any
 *   card and coming back lands on it with nothing lost; the take under way
 *   (`taking`) and the cards left while their voice note was still being
 *   kept (`pending`), so a note that lands after the screen was left, or the
 *   app was ended, still finds its card at the next opening; and the
 *   additions the log refused (`unlogged`), which only the store writes.
 */
import type { CardEvent, CardRef, RoundLog } from "@rust-rounds/lib/formats"
import {
  CardEventSchema,
  CardRefSchema,
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
import { appendToLog, EMPTY_LOG, holdsAdd } from "./log"

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
  /**
   * The card's event, with the note it had when left: null, or the note a
   * Redo under way would supersede (D2).
   */
  readonly event: CardEvent
  readonly guessedWrong: boolean
}

/** A take under way: the card it was started on (`lineOf`), and when (ms since the epoch). */
export type Taking = { readonly line: string; readonly since: number }

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

const TakingSchema = z.strictObject({ line: z.string(), since: z.number() })

/** An addition the log refused, with the session it belongs to. */
type Unlogged = { readonly head: SessionHead; readonly add: LogAdd }

const UnloggedSchema = z.strictObject({
  head: z.strictObject({ id: z.string(), startedAt: z.string() }),
  add: z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("card"),
      event: CardEventSchema,
      guessedWrong: z.boolean(),
    }),
    z.strictObject({ kind: z.literal("pin"), ref: CardRefSchema }),
  ]),
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
  // Absent from a record kept before there was one: none under way.
  taking: TakingSchema.nullable().default(null),
  unlogged: z.array(UnloggedSchema).default([]),
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

/** Where the session was: the card on screen, the take under way, and the cards waiting on a note. */
type Whereabouts = {
  readonly place: Place | null
  readonly taking: Taking | null
  readonly pending: ReadonlyArray<Pending>
}

/** What the store opened: each record, or what stands in for one it could not read. */
export type Opened = Whereabouts & {
  readonly log: RoundLog
  readonly held: Held
  /** How many additions the log refused, still kept to write to it. */
  readonly unlogged: number
}

const NO_PLACE: z.infer<typeof PlaceRecordSchema> = {
  v: 1,
  place: null,
  taking: null,
  unlogged: [],
  pending: [],
}

export type RoundsStore = {
  readonly open: () => Opened
  /**
   * Adds to the stored log, once, after every addition it refused before: a
   * card's event the log already holds is not added again. False while any
   * of them is not kept.
   */
  readonly append: (head: SessionHead, add: LogAdd) => boolean
  /** Writes the additions the log refused before; false while any is not kept. */
  readonly flush: () => boolean
  /** Keeps what plays; false when the phone did not keep it. */
  readonly hold: (held: Held) => boolean
  /** Keeps where the session is; false when the phone did not keep it. */
  readonly place: (whereabouts: Whereabouts) => boolean
}

/** The records in `storage`; with none (or one that throws), nothing is kept. */
export function keptRounds(storage: KeyedStorage | null): RoundsStore {
  const openPlace = (): z.infer<typeof PlaceRecordSchema> =>
    openKept(storage, PLACE_KEY, readPlace, NO_PLACE).value
  /**
   * The additions the log refused, oldest first: read from the place record
   * once, then held here too, so one is kept even if that record refuses it.
   */
  let unlogged: ReadonlyArray<Unlogged> | null = null
  const waiting = (): ReadonlyArray<Unlogged> =>
    (unlogged ??= openPlace().unlogged)

  /** Writes `adds` to the log in order; keeps them to write again when it is refused. */
  function write(adds: ReadonlyArray<Unlogged>): boolean {
    if (adds.length === 0) return true
    const kept = openKept(storage, LOG_KEY, readLog, EMPTY_LOG)
    const log = adds.reduce(
      (each, { head, add }) =>
        holdsAdd(each, add) ? each : appendToLog(each, head, add),
      kept.value
    )
    const written =
      kept.writable &&
      (log === kept.value || writeKept(storage, LOG_KEY, log, readLog))
    const before = waiting()
    unlogged = written ? [] : adds
    if (before.length > 0 || !written) {
      writeKept(
        storage,
        PLACE_KEY,
        { ...openPlace(), unlogged: waiting() },
        readPlace
      )
    }
    return written
  }

  return {
    open(): Opened {
      const { v: _held, ...held } = openKept(storage, HELD_KEY, readHeld, {
        v: 1,
        ...NOTHING_HELD,
      }).value
      const { v: _place, unlogged: refused, ...whereabouts } = openPlace()
      unlogged ??= refused
      return {
        log: openKept(storage, LOG_KEY, readLog, EMPTY_LOG).value,
        held,
        ...whereabouts,
        unlogged: waiting().length,
      }
    },
    append: (head, add): boolean => write([...waiting(), { head, add }]),
    flush: (): boolean => write(waiting()),
    hold(held): boolean {
      return writeKept(storage, HELD_KEY, { v: 1, ...held }, readHeld)
    },
    place(whereabouts): boolean {
      return writeKept(
        storage,
        PLACE_KEY,
        { v: 1, ...whereabouts, unlogged: waiting() },
        readPlace
      )
    },
  }
}
