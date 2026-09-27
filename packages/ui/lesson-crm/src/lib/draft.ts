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

import type { ConversationBatch, Intake, TopikMetadata } from "@some-ui/topik"
import { intakeLesson, RELATION_TAG_PREFIX } from "@some-ui/topik"

import type { LessonWrite, OperatorLesson } from "./client"

/** Every served lesson is a topik lesson; the server announces it under this. */
export const LESSON_ACTIVITY = "topik"

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
  if (key === "manifest" || key === "manifest.json") {
    return "That key is taken by the manifest route."
  }
  return null
}

export const authoredTags = (tags: Array<string> = []): Array<string> =>
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

export type Draft =
  | { ok: false; error: string; intake: Intake | null }
  | { ok: true; intake: Extract<Intake, { ok: true }>; write: LessonWrite }

/**
 * The lesson text and the form, checked and turned into the write a save
 * sends - or the reason there is nothing to save.
 */
export function draftLesson(text: string, form: LessonForm): Draft {
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
