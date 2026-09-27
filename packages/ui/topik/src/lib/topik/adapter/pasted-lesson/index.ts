/**
 * The lesson the learner pasted this session, and only that one.
 *
 * On the learner's opt-in path their own model writes a lesson, and they
 * paste it in (adaptive-learning canon Cor. 8.2). The app holds it for the
 * session, in `sessionStorage`: it survives a reload of the tab and is gone
 * when the tab closes (Rem. 7.4). It is not kept longer, because it does not
 * need to be. The learner's conversation with their model already holds the
 * lesson, and doing it again means pasting it again.
 *
 * One slot: pasting another lesson replaces it. It is validated on the way
 * out, like everything read back from storage, and every failure is silent:
 * losing it costs a paste.
 */

import type { ConversationBatch, TopikMetadata } from "@topik/lib/topik"
import { TopikFileSchema, TopikMetadataSchema } from "@topik/lib/topik"
import type { StorageLike } from "@topik/lib/topik/adapter/resume-point"
import { z } from "zod"

export const PASTED_LESSON_KEY = "topik:pasted-lesson"

export type PastedLesson = {
  meta: TopikMetadata
  batches: Array<ConversationBatch>
}

export type PastedLessonStore = {
  get(): PastedLesson | null
  /** Holds this lesson for the session, replacing any other. */
  set(meta: TopikMetadata, batches: Array<ConversationBatch>): void
  clear(): void
}

const PastedDocumentSchema = z.object({
  version: z.literal(1),
  meta: TopikMetadataSchema,
  batches: TopikFileSchema,
})

/** `window.sessionStorage`, or null wherever touching it throws. */
function defaultStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage
  } catch {
    return null
  }
}

export function createPastedLessonStore(
  storage: StorageLike | null = defaultStorage()
): PastedLessonStore {
  const write = (value: string): void => {
    try {
      storage?.setItem(PASTED_LESSON_KEY, value)
    } catch {
      // Quota, privacy mode: the lesson plays from memory for this visit.
    }
  }

  return {
    get: (): PastedLesson | null => {
      try {
        const raw = storage?.getItem(PASTED_LESSON_KEY)
        if (!raw) return null
        const parsed = PastedDocumentSchema.safeParse(JSON.parse(raw))
        return parsed.success
          ? { meta: parsed.data.meta, batches: parsed.data.batches }
          : null
      } catch {
        return null
      }
    },
    set: (meta, batches): void =>
      write(JSON.stringify({ version: 1, meta, batches })),
    // An empty value is "nothing held": StorageLike has no removeItem.
    clear: (): void => write(""),
  }
}
