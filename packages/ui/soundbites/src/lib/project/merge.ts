/**
 * A revision back from Claude (STUDIO ST8): the project file a session
 * writes after a round, merged into the copy on the phone. Revisions are
 * append-only, so a merge only adds: the file's revisions past the phone's
 * latest, its new notes, and each kept note's status where the session
 * settled it (applied, or declined with its reason). Takes, the chosen
 * take per scene, the sitting log and Finish's marks are the phone's own
 * record, and the file can't change them; the session writes text only.
 */
import { canonicalJson } from "@some-ui/core-utils"

import type { Note, Project } from "./model"
import { isAppendOnly, reaches } from "./model"

/** What a project file brings to the copy on the phone. */
export type Merged =
  | { readonly kind: "merged"; readonly project: Project }
  /** Nothing the phone doesn't hold already. */
  | { readonly kind: "same" }
  /**
   * The phone's copy moved on after the file was shared (a version made
   * here meanwhile), so the file's versions build on one it no longer is.
   */
  | { readonly kind: "moved" }

const same = (a: unknown, b: unknown): boolean =>
  canonicalJson(a) === canonicalJson(b)

/** `kept` with what `file` adds; both are the same video (`id`). */
export function mergeIn(kept: Project, file: Project): Merged {
  const base = file.revisions.slice(0, kept.revisions.length)
  if (
    base.length < kept.revisions.length ||
    !base.every((revision, index) => same(revision, kept.revisions[index]))
  )
    return { kind: "moved" }
  const settled = kept.notes.map((note): Note => {
    const there = file.notes.find((each) => each.id === note.id)
    if (there === undefined || !reaches(note.status, there.status)) return note
    // A reason may be given once; after that it stays as written.
    const reason = note.reason ?? there.reason
    return reason === undefined
      ? { ...note, status: there.status }
      : { ...note, status: there.status, reason }
  })
  const merged: Project = {
    ...kept,
    revisions: [
      ...kept.revisions,
      ...file.revisions.slice(kept.revisions.length),
    ],
    notes: [
      ...settled,
      ...file.notes.filter(
        (note) => !kept.notes.some((each) => each.id === note.id)
      ),
    ],
  }
  if (same(merged, kept)) return { kind: "same" }
  return isAppendOnly(kept, merged)
    ? { kind: "merged", project: merged }
    : { kind: "moved" }
}
