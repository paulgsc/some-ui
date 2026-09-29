/**
 * The lesson the learner pasted this session, and only that one.
 *
 * On the learner's opt-in path their own model writes a lesson, and they
 * paste it in (adaptive-learning canon Cor. 8.2). The app holds it for the
 * session, in `sessionStorage`: it survives a reload of the tab and is gone
 * when the tab closes (Rem. 7.4). The device keeps it no longer: the
 * learner's conversation with their model already holds the lesson, and
 * doing it again means pasting it again.
 *
 * It is kept longer only when the learner asks, for that lesson, and then
 * on their account rather than on the device: "Keep on this account" puts
 * this slot's own document (`serializePastedLesson`) on the host's learner
 * shelf (`adapter/shelf`, canon Rem. 7.3), and replaying a kept lesson puts
 * it back in this slot. Nothing here writes to the shelf by itself.
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

/**
 * The document this slot holds, and the body "Keep on this account" sends:
 * one shape, so a kept lesson replays through the same check as a held one.
 */
export function serializePastedLesson(
  meta: TopikMetadata,
  batches: Array<ConversationBatch>
): string {
  return JSON.stringify({ version: 1, meta, batches })
}

/**
 * `window.sessionStorage`, or null wherever touching it throws. Also where a
 * pasted lesson's resume point lives: a place lasts as long as its lesson.
 */
export function sessionStorageOrNull(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage
  } catch {
    return null
  }
}

export function createPastedLessonStore(
  storage:
    | (StorageLike & Partial<Pick<Storage, "removeItem">>)
    | null = sessionStorageOrNull()
): PastedLessonStore {
  const write = (value: string): void => {
    try {
      storage?.setItem(PASTED_LESSON_KEY, value)
    } catch {
      // Quota, privacy mode: the lesson plays from memory for this visit.
      // Whatever the slot held before is removed, not left standing: a
      // reload would otherwise bring back the lesson this one replaced
      // (Codex, #1555). Removing needs no room; storage that refuses
      // writes may still read, so the old value must go, not merely fail
      // to be overwritten.
      try {
        if (storage?.removeItem) storage.removeItem(PASTED_LESSON_KEY)
        else storage?.setItem(PASTED_LESSON_KEY, "")
      } catch {
        // Storage refuses even that; there is nothing further to try.
      }
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
    set: (meta, batches): void => write(serializePastedLesson(meta, batches)),
    // An empty value is "nothing held": StorageLike has no removeItem.
    clear: (): void => write(""),
  }
}

/**
 * Where lessons were once kept for good: `localStorage`, under this key, until
 * they were held for the session instead (Rem. 7.4).
 */
export const RETIRED_LESSONS_KEY = "topik:local-lessons"

/**
 * Deletes what the retired store left behind. Stopping writing to it was not
 * enough: whatever a learner saved there stayed on the device for good, which
 * is what holding lessons for the session is meant to rule out (Codex,
 * #1555). Idempotent and silent; the handheld runs it on mount.
 */
export function purgeRetiredLessons(
  storage: Pick<Storage, "removeItem"> | null = localStorageOrNull()
): void {
  try {
    storage?.removeItem(RETIRED_LESSONS_KEY)
  } catch {
    // Privacy mode: there is nothing it could have kept.
  }
}

function localStorageOrNull(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}
