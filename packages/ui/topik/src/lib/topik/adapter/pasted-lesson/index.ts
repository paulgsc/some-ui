/**
 * The scene tree the learner pasted this session, and only that one.
 *
 * On the learner's opt-in path their own model writes a lesson, and they
 * paste it in (adaptive-learning canon Cor. 8.2). The app holds it for the
 * session, in `sessionStorage`: it survives a reload of the tab and is gone
 * when the tab closes (Rem. 7.4). The device keeps it no longer: the
 * learner's conversation with their model already holds the lesson, and
 * doing it again means pasting it again.
 *
 * It is kept longer only when the learner asks, for that tree, and then on
 * their account rather than on the device: "Keep on this account" puts its
 * document (`serializePastedTree`, with no resume point) on the host's
 * learner shelf (`adapter/shelf`, canon Rem. 7.3), and replaying a kept tree
 * puts it back in this slot. Nothing here writes to the shelf by itself.
 *
 * One slot: pasting another tree replaces it. It is read back through
 * `intakeTree`, both audits and all, so the choices a learner meets are only
 * ever a `checked` intake's (MK4), and every failure is silent: losing it
 * costs a paste. Its resume point (canon Rem. 4.13) is kept in the tree's own
 * document, so it lasts exactly as long as its lesson and goes when the slot
 * is replaced. The phone plays scene trees only (docs/makjang/README.md), so
 * a conversation lesson a build before that left here reads as nothing.
 */

import { localStorageOrNull } from "@some-ui/core-utils"
import type { StorageLike } from "@topik/lib/topik/adapter/storage"
import type { DramaLesson } from "@topik/lib/topik/core/drama"
import type { DramaPointStore } from "@topik/lib/topik/core/drama-runtime"
import { intakeTree } from "@topik/lib/topik/generation/tree-intake"
import { z } from "zod"

export const PASTED_LESSON_KEY = "topik:pasted-lesson"

export type PastedLessonStore = {
  /** The scene tree held, or null. */
  getTree(): DramaLesson | null
  /** Holds this tree for the session, from its start, replacing any other. */
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

/**
 * A held tree's document, from its start: also the body "Keep on this
 * account" sends, so a kept tree replays through the same check as a held
 * one.
 */
export const serializePastedTree = (lesson: DramaLesson): string =>
  JSON.stringify({ version: 1, kind: "tree", tree: lesson })

/** A kept or held tree document's lesson, through both audits (MK4). */
export function treeOfDocument(document: unknown): DramaLesson | null {
  const parsed = TreeDocumentSchema.safeParse(document)
  if (!parsed.success) return null
  const intake = intakeTree(JSON.stringify(parsed.data.tree))
  return intake.status === "checked" ? intake.lesson : null
}

/** `window.sessionStorage`, or null wherever touching it throws. */
function sessionStorageOrNull(): Storage | null {
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
    // An empty value is "nothing held": StorageLike has no removeItem.
    clear: (): void => write(""),
  }
}

/**
 * What retired stores left in `localStorage`, under these keys: lessons once
 * kept for good, until they were held for the session instead (Rem. 7.4),
 * and the places left in conversation lessons, with the misses and flags
 * their survey would have offered, until the phone played scene trees only.
 */
export const RETIRED_KEYS = ["topik:local-lessons", "topik:handheld-resume"]

/**
 * Deletes what the retired stores left behind. Stopping writing to them was
 * not enough: whatever they held stayed on the device for good, which is
 * what holding lessons for the session is meant to rule out. Idempotent and
 * silent; the handheld runs it on mount.
 */
export function purgeRetiredLessons(
  storage: Pick<Storage, "removeItem"> | null = localStorageOrNull()
): void {
  for (const key of RETIRED_KEYS) {
    try {
      storage?.removeItem(key)
    } catch {
      // Privacy mode: there is nothing it could have kept.
    }
  }
}
