/**
 * The learner shelf, as this applet sees it: a lesson or a scene tree the
 * learner pasted, kept on their account because they asked
 * (paulgsc/server#387; canon Rem. 7.3). The port, the keep and the screens
 * are shared with LeetType's rounds (`@some-ui/shared`, `lib/shelf`, which
 * says what every call is held to); what is TOPIK's is the key an item is
 * kept under and how a kept body is read back. The body kept is the pasted
 * slot's own document (`serializePastedLesson`, `serializePastedTree`): the
 * lesson and its manifest entry, or the tree, never a survey, a resume
 * point, a flag or an outcome. It is read back through the same intake a
 * paste goes through (`intakeLesson`, `intakeTree`) before it is played.
 */

import type { ShelfWords } from "@some-ui/shared"
import { plainShelfKey } from "@some-ui/shared"
import type { PastedLesson } from "@topik/lib/topik/adapter/pasted-lesson"
import {
  serializePastedLesson,
  treeOfDocument,
} from "@topik/lib/topik/adapter/pasted-lesson"
import type { DramaLesson } from "@topik/lib/topik/core/drama"
import {
  intakeLesson,
  LOCAL_LESSON_PREFIX,
} from "@topik/lib/topik/generation/intake"
import { z } from "zod"

export const LESSON_SHELF_WORDS: ShelfWords = {
  noun: "lesson",
  source: "a lesson you pasted",
  unreadable: "it no longer reads as a lesson",
  replayFrom: "Write your own lesson",
}

/** What a kept body plays as. */
export type KeptLesson =
  | { kind: "conversation"; lesson: PastedLesson }
  | { kind: "tree"; tree: DramaLesson }

/**
 * A lesson's document as kept under `shelfKey`: the pasted slot's document
 * with `meta.key` the `local:` form of that key. `keptLessonOf` plays a
 * kept lesson under the same key, so a replayed copy serializes back to
 * exactly these bytes and is found again rather than kept twice.
 */
export function keptBodyOf(lesson: PastedLesson, shelfKey: string): string {
  return serializePastedLesson(
    { ...lesson.meta, key: `${LOCAL_LESSON_PREFIX}${shelfKey}` },
    lesson.batches
  )
}

/**
 * The shelf key for a pasted lesson's key: the `local:` prefix stripped
 * (`:` is not a plain key character), then held to the shelf's key rule
 * (`plainShelfKey`). Intake's slug already satisfies most of that;
 * `http-basics` is the case it does not.
 */
export function shelfKeyOf(lessonKey: string): string {
  const bare = lessonKey.startsWith(LOCAL_LESSON_PREFIX)
    ? lessonKey.slice(LOCAL_LESSON_PREFIX.length)
    : lessonKey
  return plainShelfKey(bare, "lesson")
}

/** The shelf key for a pasted tree: its lesson id, held to the key rule. */
export const treeShelfKeyOf = (tree: DramaLesson): string =>
  plainShelfKey(tree.id, "lesson")

const KeptDocumentSchema = z.object({
  version: z.literal(1),
  meta: z.record(z.string(), z.unknown()),
  batches: z.array(z.unknown()),
})

/**
 * A kept body as a lesson or a tree to play, or null when it is neither. A
 * tree is checked as a held one is (`treeOfDocument`, both audits). A lesson
 * is checked as a paste is: `intakeLesson` holds the conversations to the schema, withholds
 * every probe the audit finds in error and derives the counts and relation
 * tags, with the kept manifest entry standing in for the one a reply
 * carries. The lesson plays under `local:<key>`, the key it was kept
 * under, so keeping it again from the pasted slot serializes to the kept
 * bytes and is found rather than kept twice (`keepWithoutReplacing`).
 */
export function keptLessonOf(body: unknown, key: string): KeptLesson | null {
  const tree = treeOfDocument(body)
  if (tree) return { kind: "tree", tree }
  const kept = KeptDocumentSchema.safeParse(body)
  if (!kept.success) return null
  const intake = intakeLesson(JSON.stringify(kept.data.batches), kept.data.meta)
  if (!intake.ok) return null
  return {
    kind: "conversation",
    lesson: {
      meta: { ...intake.meta, key: `${LOCAL_LESSON_PREFIX}${key}` },
      batches: intake.batches,
    },
  }
}
