/**
 * From what the operator pasted to what the server stores.
 *
 * A served conversation lesson goes through `intakeLesson`
 * (`@some-ui/topik`): the schema, ids that repeat, counts recounted. The
 * server checks none of that - it stores the body verbatim - so this is the
 * only place a served lesson is held to it.
 *
 * What is stored is the lesson as the schema reads it, serialised one fixed
 * way: saving an unchanged lesson again produces identical bytes, which the
 * server reports as `unchanged` rather than as new material.
 *
 * A scene tree goes through `intakeTree` instead, both audits, and is stored
 * the same way: the tree as it plays, every choice an error names pruned to
 * a leaf, under `TREE_ACTIVITY`. The server lists that activity only to the
 * phone's handheld lesson (`?activity=`), never to the desktop session.
 */

import { plainShelfKey } from "@some-ui/shared"
import type {
  ConversationBatch,
  Intake,
  TopikMetadata,
  TreeIntake,
} from "@some-ui/topik"
import {
  intakeLesson,
  intakeTree,
  TREE_ACTIVITY,
  treeEntry,
} from "@some-ui/topik"

import type { LessonWrite, OperatorLesson } from "./client"

/** A served conversation lesson's activity; the server announces it under this. */
const LESSON_ACTIVITY = "topik"

/** What the operator edits beside the lesson text. */
export type LessonForm = {
  key: string
  displayName: string
  description: string
  tags: Array<string>
  difficulty?: TopikMetadata["difficulty"]
}

export const EMPTY_FORM: LessonForm = {
  key: "",
  displayName: "",
  description: "",
  tags: [],
}

/**
 * Keys the server refuses (`curriculum_repo::is_plain_key` and the manifest
 * routes' shadowed keys), checked here so the operator hears it before a
 * save rather than as a 422.
 */
export function keyProblem(key: string): string | null {
  if (key.trim() === "") return "A lesson needs a key."
  if (key !== key.trim()) return "A key has no surrounding spaces."
  if (/[/\\]/.test(key) || key.startsWith("http") || key.startsWith(".")) {
    return "A key is a name, not a path or URL."
  }
  // Learners fetch `/curriculum/<key>.json`: a key is a URL path segment, so
  // only characters one carries unencoded (the server's rule too).
  if (!/^[A-Za-z0-9._~-]+$/.test(key)) {
    return "A key uses only letters, digits, and - . _ ~"
  }
  // `<key>.json` and `<key>` are the same lesson to a learner, so a key
  // that ends in `.json` would collide with its stem.
  if (key.toLowerCase().endsWith(".json")) {
    return "A key doesn't end in .json; the route adds it."
  }
  if (key === "manifest") return "That key is taken by the manifest route."
  return null
}

/** Comma- or space-separated tags, as typed. */
export const parseTags = (typed: string): Array<string> => [
  ...new Set(
    typed
      .split(/[,\s]+/)
      .map((tag) => tag.trim())
      .filter((tag) => tag !== "")
  ),
]

/** The form a stored lesson opens with. */
export function formFromLesson(lesson: OperatorLesson): LessonForm {
  return {
    key: lesson.key,
    displayName: lesson.displayName,
    description: lesson.description,
    tags: lesson.tags ?? [],
    ...(lesson.difficulty ? { difficulty: lesson.difficulty } : {}),
  }
}

/**
 * Fields a pasted reply's own manifest entry can fill in, for a new lesson:
 * only the ones the operator has left empty, so pasting a revised reply
 * never overwrites what they typed.
 */
export function fillForm(form: LessonForm, text: string): LessonForm {
  const tree = intakeTree(text)
  if (tree.status === "checked") {
    return {
      ...form,
      // The model's id, held to the key rule as a shelf key is.
      key: form.key || plainShelfKey(tree.lesson.id, "lesson"),
      displayName: form.displayName || tree.lesson.root.place,
    }
  }
  const intake = intakeLesson(text)
  if (!intake.ok) return form
  const suggested = intake.meta.key.replace(/^local:/, "")
  return {
    key: form.key || suggested,
    displayName: form.displayName || intake.meta.displayName,
    description: form.description || intake.meta.description,
    tags: form.tags.length > 0 ? form.tags : (intake.meta.tags ?? []),
    ...((form.difficulty ?? intake.meta.difficulty)
      ? { difficulty: form.difficulty ?? intake.meta.difficulty }
      : {}),
  }
}

/** The one serialisation of a stored lesson; see this module's header. */
export const servedBody = (batches: Array<ConversationBatch>): string =>
  `${JSON.stringify(batches, null, 2)}\n`

/** A scene tree the text held, with both audits' verdict on it. */
export type TreeCheck = Exclude<TreeIntake, { status: "absent" }>

/** A scene tree both audits let play. */
export type CheckedTree = Extract<TreeIntake, { status: "checked" }>

export type Draft =
  | {
      ok: false
      error: string
      intake: Intake | null
      /** Present when the text is a scene tree. */
      tree?: TreeCheck
    }
  | {
      ok: true
      intake: Extract<Intake, { ok: true }>
      tree?: undefined
      write: LessonWrite
    }
  | { ok: true; intake: null; tree: CheckedTree; write: LessonWrite }

/** Why a rejected tree has nothing to save. */
export const TREE_REJECTED =
  "Nothing to save: the tree doesn't play. Send the fixes to the model."

/** Where a checked tree goes on save. */
export const TREE_SAVES_TO_FEED =
  "Saves to the phone's dramas: the handheld lesson lists it, and the desktop session never does."

/** The one serialisation of a stored tree: the lesson as it plays. */
export const servedTreeBody = (tree: CheckedTree["lesson"]): string =>
  `${JSON.stringify(tree, null, 2)}\n`

/**
 * The lesson text and the form, checked and turned into the write a save
 * sends - or the reason there is nothing to save. A scene tree goes through
 * `intakeTree` instead, and saves under `TREE_ACTIVITY`.
 */
export function draftLesson(text: string, form: LessonForm): Draft {
  const tree = intakeTree(text)
  if (tree.status === "rejected") {
    return { ok: false, error: TREE_REJECTED, intake: null, tree }
  }
  if (tree.status === "checked") {
    const problem = keyProblem(form.key)
    if (problem) return { ok: false, error: problem, intake: null, tree }
    return {
      ok: true,
      intake: null,
      tree,
      write: {
        activityId: TREE_ACTIVITY,
        metadata: treeEntry(tree.lesson, form),
        body: servedTreeBody(tree.lesson),
      },
    }
  }
  const intake = intakeLesson(text, {
    displayName: form.displayName,
    description: form.description,
    tags: form.tags,
    ...(form.difficulty ? { difficulty: form.difficulty } : {}),
  })
  if (!intake.ok) return { ok: false, error: intake.error, intake }
  const problem = keyProblem(form.key)
  if (problem) return { ok: false, error: problem, intake: null }
  return {
    ok: true,
    intake,
    write: {
      activityId: LESSON_ACTIVITY,
      metadata: { ...intake.meta, key: form.key },
      body: servedBody(intake.batches),
    },
  }
}
