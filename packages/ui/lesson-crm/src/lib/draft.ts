/**
 * From what the operator pasted to what the server stores.
 *
 * A served lesson goes through the same intake as a pasted one
 * (`intakeLesson`, `@some-ui/topik`): the schema, the probe audit, errors
 * withheld, counts recounted and `relation:` tags derived from the probes
 * (canon Rem. 3.5). The server checks none of that - it stores the body
 * verbatim - so this is the only place a served lesson is held to it.
 *
 * What is stored is the lesson **as it plays**: the batches with every
 * erroring probe withheld, serialised one fixed way. A learner is never
 * served a probe the audit rejected, and saving an unchanged lesson again
 * produces identical bytes, which the server reports as `unchanged` rather
 * than as new material.
 */

import type {
  ConversationBatch,
  Intake,
  TopikMetadata,
  TreeIntake,
} from "@some-ui/topik"
import { intakeLesson, intakeTree, RELATION_TAG_PREFIX } from "@some-ui/topik"

import type { LessonWrite, OperatorLesson } from "./client"

/** Every served lesson is a topik lesson; the server announces it under this. */
const LESSON_ACTIVITY = "topik"

/** What the operator edits beside the lesson text. */
export type LessonForm = {
  key: string
  displayName: string
  description: string
  /** Authored tags only (`topik-3`, `makjang`); `relation:` ones are derived. */
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

const authoredTags = (tags: Array<string> = []): Array<string> =>
  tags.filter((tag) => !tag.startsWith(RELATION_TAG_PREFIX))

/** Comma- or space-separated tags, as typed. */
export const parseTags = (typed: string): Array<string> => [
  ...new Set(
    typed
      .split(/[,\s]+/)
      .map((tag) => tag.trim())
      .filter((tag) => tag !== "" && !tag.startsWith(RELATION_TAG_PREFIX))
  ),
]

/** The form a stored lesson opens with. */
export function formFromLesson(lesson: OperatorLesson): LessonForm {
  return {
    key: lesson.key,
    displayName: lesson.displayName,
    description: lesson.description,
    tags: authoredTags(lesson.tags),
    ...(lesson.difficulty ? { difficulty: lesson.difficulty } : {}),
  }
}

/**
 * Fields a pasted reply's own manifest entry can fill in, for a new lesson:
 * only the ones the operator has left empty, so pasting a revised reply
 * never overwrites what they typed.
 */
export function fillForm(form: LessonForm, text: string): LessonForm {
  const intake = intakeLesson(text)
  if (!intake.ok) return form
  const suggested = intake.meta.key.replace(/^local:/, "")
  return {
    key: form.key || suggested,
    displayName: form.displayName || intake.meta.displayName,
    description: form.description || intake.meta.description,
    tags: form.tags.length > 0 ? form.tags : authoredTags(intake.meta.tags),
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

export type Draft =
  | {
      ok: false
      error: string
      intake: Intake | null
      /** Present when the text is a scene tree: checked, never saved. */
      tree?: TreeCheck
    }
  | { ok: true; intake: Extract<Intake, { ok: true }>; write: LessonWrite }

/**
 * Why a tree has nothing to save: trees are checked here, and saved and
 * served with the phone feed (MKJ-S4, #1712).
 */
export const TREE_NOT_SAVED =
  "A scene tree is checked here, not saved yet: saving trees comes with the phone feed."

/**
 * The lesson text and the form, checked and turned into the write a save
 * sends - or the reason there is nothing to save. A scene tree
 * (docs/makjang/README.md) goes through its own intake, the story audit and
 * the teaching audit, and is reported rather than saved.
 */
export function draftLesson(text: string, form: LessonForm): Draft {
  const tree = intakeTree(text)
  if (tree.status !== "absent") {
    return { ok: false, error: TREE_NOT_SAVED, intake: null, tree }
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
