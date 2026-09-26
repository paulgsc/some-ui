/**
 * Lessons the learner generated, kept on this device.
 *
 * A lesson here is the learner's own: their model wrote it from the app's
 * prompt, and it lives on the client (adaptive-learning canon v1.7). Kept so a
 * lesson can be done again - cycling through the same one is fine, even
 * recommended - and bounded, because what matters is the probes and the
 * feedback, not an archive. Oldest go first. Every failure is silent for the
 * same reason the resume point's are: losing a kept lesson costs a paste.
 */

import type { ConversationBatch, TopikMetadata } from "@topik/lib/topik"
import { TopikFileSchema, TopikMetadataSchema } from "@topik/lib/topik"
import type { StorageLike } from "@topik/lib/topik/adapter/resume-point"
import { z } from "zod"

export const LESSON_STORAGE_KEY = "topik:local-lessons"

/** Kept lessons; a lesson runs to tens of kilobytes, so this stays modest. */
export const MAX_LOCAL_LESSONS = 20

export type LocalLesson = {
  meta: TopikMetadata
  batches: Array<ConversationBatch>
  /** Epoch ms it was saved. */
  at: number
}

export type LessonStore = {
  /** Newest first. */
  list(): Array<LocalLesson>
  get(key: string): LocalLesson | null
  /** Keeps it; a lesson with the same key is replaced by the new one. */
  save(meta: TopikMetadata, batches: Array<ConversationBatch>): void
  remove(key: string): void
}

const LessonDocumentSchema = z.object({
  version: z.literal(1),
  lessons: z.array(
    z.object({ meta: z.unknown(), batches: z.unknown(), at: z.number() })
  ),
})

/** `window.localStorage`, or null wherever touching it throws. */
function defaultStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

export function createLessonStore(
  storage: StorageLike | null = defaultStorage(),
  now: () => number = Date.now
): LessonStore {
  const read = (): Array<LocalLesson> => {
    try {
      const raw = storage?.getItem(LESSON_STORAGE_KEY)
      if (!raw) return []
      const doc = LessonDocumentSchema.safeParse(JSON.parse(raw))
      if (!doc.success) return []
      // Each lesson is held to today's schema on the way out, one at a time:
      // a lesson an older build kept, which no longer parses, is dropped
      // without taking the others with it.
      return doc.data.lessons.flatMap((lesson): Array<LocalLesson> => {
        const meta = TopikMetadataSchema.safeParse(lesson.meta)
        const batches = TopikFileSchema.safeParse(lesson.batches)
        return meta.success && batches.success
          ? [{ meta: meta.data, batches: batches.data, at: lesson.at }]
          : []
      })
    } catch {
      return []
    }
  }

  const write = (lessons: Array<LocalLesson>): void => {
    try {
      storage?.setItem(
        LESSON_STORAGE_KEY,
        JSON.stringify({ version: 1, lessons })
      )
    } catch {
      // Quota, privacy mode: a lost lesson is a paste away.
    }
  }

  return {
    list: read,
    get: (key): LocalLesson | null =>
      read().find((lesson) => lesson.meta.key === key) ?? null,
    save: (meta, batches): void => {
      const kept = read().filter((lesson) => lesson.meta.key !== meta.key)
      write([{ meta, batches, at: now() }, ...kept].slice(0, MAX_LOCAL_LESSONS))
    },
    remove: (key): void => {
      write(read().filter((lesson) => lesson.meta.key !== key))
    },
  }
}
