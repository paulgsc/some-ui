/**
 * The learner shelf, as this applet sees it: a scene tree the learner
 * pasted, kept on their account because they asked (paulgsc/server#387;
 * canon Rem. 7.3). The port, the keep and the screens are shared with
 * LeetType's rounds (`@some-ui/shared`, `lib/shelf`, which says what every
 * call is held to); what is TOPIK's is the key an item is kept under and how
 * a kept body is read back. The body kept is the pasted slot's own document
 * (`serializePastedTree`): the tree, never a resume point or an outcome. It
 * is read back through both audits a paste goes through (`treeOfDocument`)
 * before it is played.
 *
 * The phone plays scene trees only (docs/makjang/README.md). A conversation
 * lesson an earlier build kept reads as nothing here, so the shelf shows it
 * as unreadable, for the learner to remove.
 */

import type { ShelfWords } from "@some-ui/shared"
import { plainShelfKey } from "@some-ui/shared"
import { treeOfDocument } from "@topik/lib/topik/adapter/pasted-lesson"
import type { DramaLesson } from "@topik/lib/topik/core/drama"

export const LESSON_SHELF_WORDS: ShelfWords = {
  noun: "lesson",
  source: "a lesson you pasted",
  unreadable: "it no longer reads as a lesson",
  replayFrom: "Write your own drama",
}

/** The shelf key for a pasted tree: its lesson id, held to the key rule. */
export const treeShelfKeyOf = (tree: DramaLesson): string =>
  plainShelfKey(tree.id, "lesson")

/** A kept body as a tree to play, or null when it is not one (MK4). */
export const keptLessonOf = (body: unknown): DramaLesson | null =>
  treeOfDocument(body)
