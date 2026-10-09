/**
 * What the read-aloud drill keeps on the device between sittings: each
 * word's pace, the practice record, and the set left unfinished
 * (adaptive-learning canon Cor. 4.6 (iii), Def. 6.6, Rem. 4.10, Rem. 7.5).
 *
 * All three sit outside the belief envelope. The pace book is pacing and
 * nothing more; the record is a count shown to the learner; the unfinished
 * set is a place in content, like the handheld lesson's resume point. Losing
 * any of them costs exactly that and nothing else (Thm. 7.2), which is why
 * every failure below is silent: eviction, a full quota, a private window, a
 * document an older build wrote. Everything read is parsed, not trusted, and
 * none of it leaves the device.
 */

import { localStorageOrNull } from "@some-ui/core-utils"
import type { StorageLike } from "@topik/lib/topik/adapter/storage"
import type { ReadAloudLevel } from "@topik/lib/topik/read-aloud/content"
import type {
  PaceBook,
  PaceEntry,
  PracticeRecord,
} from "@topik/lib/topik/read-aloud/records"
import {
  addRep,
  addSet,
  parsePaceBook,
  parsePracticeRecord,
  prunePaceBook,
} from "@topik/lib/topik/read-aloud/records"
import type { SetProgress } from "@topik/lib/topik/read-aloud/set-machine"
import { z } from "zod"

export const READ_ALOUD_STORAGE_KEYS = {
  paces: "topik:read-aloud-paces",
  record: "topik:read-aloud-record",
  progress: "topik:read-aloud-progress",
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
  /** The set left unfinished at this level, or null. */
  progress: (level: ReadAloudLevel) => SetProgress | null
  saveProgress: (level: ReadAloudLevel, progress: SetProgress | null) => void
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
  }),
})

export function createReadAloudStore(
  storage: StorageLike | null = localStorageOrNull()
): ReadAloudStore {
  const read = (key: string): unknown => {
    try {
      const raw = storage?.getItem(key)
      if (!raw) return null
      const parsed: unknown = JSON.parse(raw)
      return parsed
    } catch {
      return null
    }
  }

  const write = (key: string, value: unknown): void => {
    try {
      storage?.setItem(key, JSON.stringify(value))
    } catch {
      // Quota, privacy mode: what was lost is pace or a count, nothing more.
    }
  }

  const paces = (): PaceBook =>
    parsePaceBook(read(READ_ALOUD_STORAGE_KEYS.paces))
  const record = (): PracticeRecord =>
    parsePracticeRecord(read(READ_ALOUD_STORAGE_KEYS.record))

  return {
    paces,
    savePace: (wordId, pace): void => {
      write(READ_ALOUD_STORAGE_KEYS.paces, { ...paces(), [wordId]: pace })
    },
    prunePaces: (wordIds): void => {
      write(READ_ALOUD_STORAGE_KEYS.paces, prunePaceBook(paces(), wordIds))
    },
    record,
    count: (event, day): PracticeRecord => {
      const next =
        event.type === "rep"
          ? addRep(record(), day, event.creditMs)
          : addSet(record(), day)
      write(READ_ALOUD_STORAGE_KEYS.record, next)
      return next
    },
    progress: (level): SetProgress | null => {
      const parsed = ProgressDocumentSchema.safeParse(
        read(READ_ALOUD_STORAGE_KEYS.progress)
      )
      // A set drawn for another level is not this level's to resume.
      return parsed.success && parsed.data.level === level
        ? parsed.data.progress
        : null
    },
    saveProgress: (level, progress): void => {
      write(
        READ_ALOUD_STORAGE_KEYS.progress,
        progress && progress.queue.length > 0
          ? { version: 1, level, progress }
          : null
      )
    },
  }
}
