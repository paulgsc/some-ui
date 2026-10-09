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
 * One slot, for a conversation lesson or a scene tree: pasting another
 * replaces it. It is validated on the way out, like everything read back
 * from storage, and every failure is silent: losing it costs a paste. A tree
 * is read back through `intakeTree`, both audits and all, so the choices a
 * learner meets are only ever a `checked` intake's (MK4). A tree's resume
 * point (canon Rem. 4.13) is kept in the tree's own document, so it lasts
 * exactly as long as its lesson and goes when the slot is replaced. A tree
 * is kept on the account as its document here (`serializePastedTree`), with
 * no resume point.
 */

import { localStorageOrNull } from "@some-ui/core-utils"
import type { ConversationBatch, TopikMetadata } from "@topik/lib/topik"
import { TopikFileSchema, TopikMetadataSchema } from "@topik/lib/topik"
import type { StorageLike } from "@topik/lib/topik/adapter/resume-point"
import type { DramaLesson } from "@topik/lib/topik/core/drama"
import type { DramaPointStore } from "@topik/lib/topik/core/drama-runtime"
import { intakeTree } from "@topik/lib/topik/generation/tree-intake"
import { z } from "zod"

export const PASTED_LESSON_KEY = "topik:pasted-lesson"

export type PastedLesson = {
  meta: TopikMetadata
  batches: Array<ConversationBatch>
}

export type PastedLessonStore = {
  /** The conversation lesson held, or null (nothing, or a tree). */
  get(): PastedLesson | null
  /** Holds this lesson for the session, replacing any other. */
  set(meta: TopikMetadata, batches: Array<ConversationBatch>): void
  /** The scene tree held, or null (nothing, or a conversation lesson). */
  getTree(): DramaLesson | null
  /** Holds this tree for the session, from its start, replacing any lesson. */
  setTree(lesson: DramaLesson): void
  /** The held tree's resume point, by its lesson id; unvalidated. */
  points: DramaPointStore
  clear(): void
}

const TreeDocumentSchema = z.object({
  version: z.literal(1),
  kind: z.literal("tree"),
  tree: z.unknown(),
  point: z.unknown().optional(),
})

/** The held tree's id, read without the audits: it only keys the point. */
const treeIdOf = (tree: unknown): unknown =>
  typeof tree === "object" && tree !== null && "id" in tree
    ? tree.id
    : undefined

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

/** A held tree's document, from its start: also the body a tree is kept as. */
export const serializePastedTree = (lesson: DramaLesson): string =>
  JSON.stringify({ version: 1, kind: "tree", tree: lesson })

/** A kept or held tree document's lesson, through both audits (MK4). */
export function treeOfDocument(document: unknown): DramaLesson | null {
  const parsed = TreeDocumentSchema.safeParse(document)
  if (!parsed.success) return null
  const intake = intakeTree(JSON.stringify(parsed.data.tree))
  return intake.status === "checked" ? intake.lesson : null
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
  // The point written last this visit; it goes with whatever slot it was in.
  let latest: { lessonId: string; point: unknown } | null = null

  const write = (value: string): void => {
    latest = null
    try {
      storage?.setItem(PASTED_LESSON_KEY, value)
    } catch {
      // Quota, privacy mode: the lesson plays from memory for this visit.
      // Whatever the slot held before is removed, not left standing: a
      // reload would otherwise bring back the lesson this one replaced.
      // Removing needs no room; storage that refuses
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

  const read = (): unknown => {
    try {
      const raw = storage?.getItem(PASTED_LESSON_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  return {
    getTree: (): DramaLesson | null => treeOfDocument(read()),
    setTree: (lesson): void => write(serializePastedTree(lesson)),
    points: {
      get: (lessonId): unknown => {
        if (latest?.lessonId === lessonId) return latest.point
        const parsed = TreeDocumentSchema.safeParse(read())
        return parsed.success && treeIdOf(parsed.data.tree) === lessonId
          ? parsed.data.point
          : undefined
      },
      set: (lessonId, point): void => {
        // Kept in memory too: storage that refuses writes would otherwise
        // lose the place while the tree plays on from memory.
        latest = { lessonId, point }
        const parsed = TreeDocumentSchema.safeParse(read())
        if (!parsed.success || treeIdOf(parsed.data.tree) !== lessonId) return
        try {
          storage?.setItem(
            PASTED_LESSON_KEY,
            JSON.stringify({ ...parsed.data, point })
          )
        } catch {
          // The point lasts this visit, in `latest`.
        }
      },
    },
    get: (): PastedLesson | null => {
      const parsed = PastedDocumentSchema.safeParse(read())
      return parsed.success
        ? { meta: parsed.data.meta, batches: parsed.data.batches }
        : null
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
 * is what holding lessons for the session is meant to rule out. Idempotent
 * and silent; the handheld runs it on mount.
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
