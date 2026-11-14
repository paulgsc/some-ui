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
import type {
  AddedSet,
  WordSetsList,
} from "@topik/lib/topik/read-aloud/added-sets"
import {
  archiveSet,
  bringBack,
  homeSet,
  readAddedSets,
  storedSet,
  wordSetsList,
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
  /**
   * Archives the set `id` at `at` (MD7, the owner's own act from My data):
   * it leaves Read aloud and "Ready for you" and is kept whole. Whether the
   * phone kept the change.
   */
  archive: (id: string, at: string) => boolean
  /**
   * Brings the archived set `id` back in use, when there is room under
   * `ADDED_SET_LIMIT`. Whether the phone kept the change: false when there
   * was no room.
   */
  bringBack: (id: string) => boolean
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

/** Those told of each write read aloud keeps (www's drain, to send it). */
const written = new Set<() => void>()

/**
 * Calls `listener` after each write read aloud's stores keep, in any store
 * on this page. Returns an unsubscribe.
 */
export function onReadAloudWritten(listener: () => void): () => void {
  written.add(listener)
  return (): void => {
    written.delete(listener)
  }
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
  const write = <T>(
    key: string,
    reader: Reader<T>,
    value: unknown
  ): boolean => {
    const kept = writeKept(storage, key, value, reader)
    if (kept) for (const listener of written) listener()
    return kept
  }

  const paces = (): PaceBook =>
    read(READ_ALOUD_STORAGE_KEYS.paces, READERS.paces, {})
  const record = (): PracticeRecord =>
    read(READ_ALOUD_STORAGE_KEYS.record, READERS.record, emptyRecord())
  const sets = (): Array<AddedSet> =>
    read(READ_ALOUD_STORAGE_KEYS.sets, READERS.sets, [])
  const saveSets = (next: ReadonlyArray<AddedSet>): boolean =>
    write(READ_ALOUD_STORAGE_KEYS.sets, READERS.sets, next.map(storedSet))
  /**
   * Keeps what `edit` makes of the sets when it changed one: false when
   * nothing changed (an unknown id, no room) or the phone didn't keep it.
   */
  const change = (
    edit: (before: Array<AddedSet>) => Array<AddedSet>
  ): boolean => {
    const before = sets()
    const next = edit(before)
    return next.some((set, at) => set !== before[at]) && saveSets(next)
  }

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
    sets,
    saveSets: (next): void => {
      saveSets(next)
    },
    archive: (id, at): boolean =>
      change((before) => archiveSet(before, id, at)),
    bringBack: (id): boolean => change((before) => bringBack(before, id)),
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

/** The word sets on this phone, as My data reads and archives them (MD7). */
export type PhoneWordSets = {
  /** Every set kept, judged at `now`. */
  readonly list: (now: Date) => WordSetsList
  /** Whether the phone kept the archive. */
  readonly archive: (id: string, at: string) => boolean
  /** Whether the phone kept it; false too when there is no room. */
  readonly bringBack: (id: string) => boolean
}

/** This phone's word sets, through the read-aloud store. */
export function phoneWordSets(
  storage: KeyedStorage | null = localStorageOrNull()
): PhoneWordSets {
  const store = createReadAloudStore(storage)
  return {
    list: (now) => wordSetsList(store.sets(), now),
    archive: (id, at) => store.archive(id, at),
    bringBack: (id) => store.bringBack(id),
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

/** Which of home's Korean kinds a read-aloud entry is (paulgsc/server `korean_repo::Kind`). */
type KoreanKind = "set" | "pace" | "tally" | "record" | "progress" | "feedback"

/** One entry of home's Korean record: its kind, its key there, and its body as kept here. */
export type KoreanEntry = {
  readonly kind: KoreanKind
  readonly key: string
  readonly body: unknown
}

/** The key of the read-aloud store's single documents (record, progress, feedback). */
const SINGLE_DOCUMENT = "phone"

/**
 * A single document this phone kept and has since cleared (a set finished,
 * the last answer taken back), as home keeps it: home takes an object, and
 * an entry left out would leave home holding the document as it was.
 */
const CLEARED = { version: 1, cleared: true } as const

/**
 * Whether this phone cleared `key`: a cleared document is kept as the text
 * `null`. One never kept has no text, and one this build cannot read keeps
 * its own bytes, so neither reads as cleared and home's copy stands.
 */
function clearedHere(storage: KeyedStorage | null, key: string): boolean {
  try {
    return storage?.getItem(key)?.trim() === "null"
  } catch {
    return false
  }
}

/** The single document `body` under `kind`, `CLEARED` once it was kept and cleared, or none. */
function singleDocument(
  kind: "progress" | "feedback",
  body: unknown,
  cleared: boolean
): Array<KoreanEntry> {
  if (body !== null) return [{ kind, key: SINGLE_DOCUMENT, body }]
  return cleared ? [{ kind, key: SINGLE_DOCUMENT, body: CLEARED }] : []
}

/**
 * `id` as a key home takes (letters, digits, `.`, `_`, `-` and `~`; not
 * starting `.` or `http`, not ending `.json`), one to one: any other
 * character, and `~` itself, is written `~<hex>~`, and a key that would
 * start or end as home refuses is marked `~p~` before or `~s~` after. An id
 * of letters, digits, `.`, `_` and `-` alone is its own key.
 */
export function plainKey(id: string): string {
  const escaped = Array.from(id, (char) =>
    /^[\w.-]$/.test(char)
      ? char
      : `~${(char.codePointAt(0) ?? 0).toString(16)}~`
  ).join("")
  const lead = /^(\.|http)/.test(escaped) || escaped === "" ? "~p~" : ""
  const tail = /\.json$/i.test(escaped) ? "~s~" : ""
  return `${lead}${escaped}${tail}`
}

/**
 * Everything the read-aloud store keeps, as entries of home's Korean record
 * (KO-HOME KH3, #2103): each word set by its deck, each word's pace, each
 * sentence's tally row, and the practice record, the set left unfinished and
 * the last answers as single documents. Each body is what this phone keeps,
 * in the form it keeps it; a single document kept and since cleared is
 * `CLEARED`. Read only.
 */
export function readAloudForHome(
  storage: KeyedStorage | null = localStorageOrNull()
): Array<KoreanEntry> {
  const store = createReadAloudStore(storage)
  const progress = openKept(
    storage,
    READ_ALOUD_STORAGE_KEYS.progress,
    READERS.progress,
    null
  ).value
  const feedback = storedFeedback(store.feedback())
  const record = store.record()
  return [
    ...store.sets().map(
      (set): KoreanEntry => ({
        kind: "set",
        key: plainKey(set.deck.id),
        body: homeSet(set),
      })
    ),
    ...Object.entries(store.paces()).map(
      ([wordId, pace]): KoreanEntry => ({
        kind: "pace",
        key: plainKey(wordId),
        body: { wordId, ...pace },
      })
    ),
    ...Object.entries(store.tally()).map(
      ([sentence, row]): KoreanEntry => ({
        kind: "tally",
        key: plainKey(sentence),
        body: { sentence, ...row },
      })
    ),
    ...(record.days.length > 0
      ? [{ kind: "record", key: SINGLE_DOCUMENT, body: record } as const]
      : []),
    ...singleDocument(
      "progress",
      progress,
      clearedHere(storage, READ_ALOUD_STORAGE_KEYS.progress)
    ),
    ...singleDocument(
      "feedback",
      feedback,
      clearedHere(storage, READ_ALOUD_STORAGE_KEYS.feedback)
    ),
  ]
}
