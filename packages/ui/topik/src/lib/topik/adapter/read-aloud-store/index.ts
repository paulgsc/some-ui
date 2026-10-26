/**
 * What the read-aloud drill keeps on the device between sittings: each
 * word's pace, the practice record, the set left unfinished, the word
 * sets added from storage, the learner's two answers at a sitting's end and
 * the tally of each sentence shown
 * (adaptive-learning canon Cor. 4.6 (iii), Def. 6.6, Rem. 4.10, Rem. 7.5).
 *
 * The added sets are content, kept so the learner need not pick them again;
 * losing them costs the picking. The others sit outside the belief
 * envelope. The pace book is pacing and nothing more; the record is a count
 * shown to the learner; the unfinished set is a place in content, like the
 * handheld lesson's resume point; the tally is a row per sentence, which the
 * mark on a sentence reads. Losing
 * any of them costs exactly that and nothing else (Thm. 7.2), which is why
 * every failure below is silent: eviction, a full quota, a private window.
 * Only the answers and the tally say whether the phone kept them, since the
 * learner is told. Everything read is parsed, not trusted, through
 * core-utils' `openKept`: a document an older build wrote, or one that does
 * not parse, is copied aside under `<key>:unreadable:` before anything is
 * written over it, and nothing is written over one that could not be. Nothing
 * here sends any of it anywhere (`readAloudPracticeRecord` below).
 */

import type { KeyedStorage, Salvaged } from "@some-ui/core-utils"
import {
  jsonOf,
  localStorageOrNull,
  openKept,
  writeKept,
} from "@some-ui/core-utils"
import type { AddedSet } from "@topik/lib/topik/read-aloud/added-sets"
import {
  readAddedSets,
  storedSet,
} from "@topik/lib/topik/read-aloud/added-sets"
import type { ReadAloudLevel } from "@topik/lib/topik/read-aloud/content"
import type { ReadAloudFeedback } from "@topik/lib/topik/read-aloud/feedback"
import {
  readFeedback,
  storedFeedback,
} from "@topik/lib/topik/read-aloud/feedback"
import type {
  PaceBook,
  PaceEntry,
  PracticeRecord,
} from "@topik/lib/topik/read-aloud/records"
import {
  addRep,
  addSet,
  emptyRecord,
  prunePaceBook,
  readPaceBook,
  readPracticeRecord,
} from "@topik/lib/topik/read-aloud/records"
import type { SetProgress } from "@topik/lib/topik/read-aloud/set-machine"
import type { Tally } from "@topik/lib/topik/read-aloud/tally"
import {
  emptyTally,
  readTally,
  storedTally,
} from "@topik/lib/topik/read-aloud/tally"
import { z } from "zod"

export const READ_ALOUD_STORAGE_KEYS = {
  paces: "topik:read-aloud-paces",
  record: "topik:read-aloud-record",
  progress: "topik:read-aloud-progress",
  sets: "topik:read-aloud-sets",
  feedback: "topik:read-aloud-feedback",
  tally: "topik:read-aloud-tally",
} as const

/** A counted rep or a finished set, as the drill reports it. */
type ReadAloudCount = { type: "rep"; creditMs: number } | { type: "set" }

export type ReadAloudStore = {
  paces: () => PaceBook
  savePace: (wordId: string, pace: PaceEntry) => void
  /** Drop every word the vocabulary no longer names (Rem. 7.5). */
  prunePaces: (wordIds: Iterable<string>) => void
  record: () => PracticeRecord
  /** Add a count to the record and return the record as it now stands. */
  count: (event: ReadAloudCount, day: string) => PracticeRecord
  /**
   * The set left unfinished at this level, drawn from the deck `deckId`, or
   * null. One is kept at a time: a set drawn from another deck replaces it.
   */
  progress: (level: ReadAloudLevel, deckId: string) => SetProgress | null
  saveProgress: (
    level: ReadAloudLevel,
    deckId: string,
    progress: SetProgress | null
  ) => void
  /** The word sets added from storage, oldest first. */
  sets: () => Array<AddedSet>
  saveSets: (sets: ReadonlyArray<AddedSet>) => void
  /** What the learner said at the end of a sitting, or null if nothing. */
  feedback: () => ReadAloudFeedback | null
  /** Whether the phone kept it: the learner is told when it did not. */
  saveFeedback: (feedback: ReadAloudFeedback | null) => boolean
  /** The tally of each sentence shown; empty when none is kept. */
  tally: () => Tally
  /** Whether the phone kept it; the drill runs on either way. An empty tally clears it. */
  saveTally: (tally: Tally) => boolean
}

const Id = z.string().min(1)

const ItemSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("word"),
    key: Id,
    wordId: Id,
    text: z.string().min(1),
    lineId: Id,
    syllables: z.number().int().min(0),
  }),
  z.object({
    kind: z.literal("sentence"),
    key: Id,
    lineId: Id,
    text: z.string().min(1),
    syllables: z.number().int().min(0),
    wordIds: z.array(Id),
  }),
])

const ProgressDocumentSchema = z.object({
  version: z.literal(1),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  /**
   * Absent in what builds before added sets wrote, whose deck was compiled
   * in: no deck now is that one, so such a set is never resumed.
   */
  deck: z.string().min(1).optional(),
  progress: z.object({
    queue: z
      .array(
        z.object({
          item: ItemSchema,
          role: z.enum(["rep", "return", "introduction"]),
        })
      )
      .min(1),
    returns: z.record(z.string(), z.number().int().min(0)),
    counted: z.number().int().min(0),
    reported: z.boolean(),
    begun: z.boolean().optional(),
  }),
})

type ProgressDocument = z.infer<typeof ProgressDocumentSchema>

function readProgress(raw: unknown): Salvaged<ProgressDocument | null> | null {
  if (raw === null) return { value: null, whole: true }
  const parsed = ProgressDocumentSchema.safeParse(raw)
  return parsed.success ? { value: parsed.data, whole: true } : null
}

/** A reader of a stored document, on its text. */
type Reader<T> = (raw: string) => Salvaged<T> | null

/** `read` over the text's JSON; text that is not JSON is not readable. */
function onJson<T>(read: (value: unknown) => Salvaged<T> | null): Reader<T> {
  return (raw) => {
    const value = jsonOf(raw)
    return value === undefined ? null : read(value)
  }
}

const READERS = {
  paces: onJson(readPaceBook),
  record: onJson(readPracticeRecord),
  progress: onJson(readProgress),
  sets: onJson(readAddedSets),
  feedback: onJson(readFeedback),
  tally: onJson(readTally),
}

export function createReadAloudStore(
  storage: KeyedStorage | null = localStorageOrNull()
): ReadAloudStore {
  const read = <T>(key: string, reader: Reader<T>, fallback: T): T =>
    openKept(storage, key, reader, fallback).value

  /**
   * Whether the phone kept `value`; never over a document that could not be
   * read and copied aside. Quota, privacy mode: what was lost is a pace, a
   * count or an answer the learner is told of.
   */
  const write = <T>(key: string, reader: Reader<T>, value: unknown): boolean =>
    writeKept(storage, key, value, reader)

  const paces = (): PaceBook =>
    read(READ_ALOUD_STORAGE_KEYS.paces, READERS.paces, {})
  const record = (): PracticeRecord =>
    read(READ_ALOUD_STORAGE_KEYS.record, READERS.record, emptyRecord())

  return {
    paces,
    savePace: (wordId, pace): void => {
      write(READ_ALOUD_STORAGE_KEYS.paces, READERS.paces, {
        ...paces(),
        [wordId]: pace,
      })
    },
    prunePaces: (wordIds): void => {
      write(
        READ_ALOUD_STORAGE_KEYS.paces,
        READERS.paces,
        prunePaceBook(paces(), wordIds)
      )
    },
    record,
    count: (event, day): PracticeRecord => {
      const next =
        event.type === "rep"
          ? addRep(record(), day, event.creditMs)
          : addSet(record(), day)
      write(READ_ALOUD_STORAGE_KEYS.record, READERS.record, next)
      return next
    },
    progress: (level, deckId): SetProgress | null => {
      const kept = read(
        READ_ALOUD_STORAGE_KEYS.progress,
        READERS.progress,
        null
      )
      return kept !== null && kept.level === level && kept.deck === deckId
        ? kept.progress
        : null
    },
    saveProgress: (level, deckId, progress): void => {
      write(
        READ_ALOUD_STORAGE_KEYS.progress,
        READERS.progress,
        progress && progress.queue.length > 0
          ? { version: 1, level, deck: deckId, progress }
          : null
      )
    },
    sets: (): Array<AddedSet> =>
      read(READ_ALOUD_STORAGE_KEYS.sets, READERS.sets, []),
    saveSets: (sets): void => {
      write(READ_ALOUD_STORAGE_KEYS.sets, READERS.sets, sets.map(storedSet))
    },
    feedback: (): ReadAloudFeedback | null =>
      read(READ_ALOUD_STORAGE_KEYS.feedback, READERS.feedback, null),
    saveFeedback: (feedback): boolean =>
      write(
        READ_ALOUD_STORAGE_KEYS.feedback,
        READERS.feedback,
        storedFeedback(feedback)
      ),
    tally: (): Tally =>
      read(READ_ALOUD_STORAGE_KEYS.tally, READERS.tally, emptyTally()),
    saveTally: (tally): boolean =>
      write(READ_ALOUD_STORAGE_KEYS.tally, READERS.tally, storedTally(tally)),
  }
}

/**
 * The practice record as kept, for the learner's own export (Def. 7.2,
 * Rem. 7.5). It names no item and carries no outcome (Def. 6.6).
 */
export const readAloudPracticeRecord = (): PracticeRecord =>
  createReadAloudStore().record()

/** What the learner last said at the end of a sitting, for the export. */
export const readAloudFeedbackForExport = (): ReadAloudFeedback | null =>
  createReadAloudStore().feedback()
