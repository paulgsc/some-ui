/**
 * Whose idea each scene presents, as the owner said in Watch (STUDIO ST5,
 * ST16). The origin is the one judgement in a scene's authorship: Claude
 * proposes it in the scenes it writes, and the owner confirms it or puts
 * it right, one scene at a time. Pure, so the project's `step` refuses a
 * word it doesn't allow by the same rule a screen asks by.
 *
 * - **The owner's word is a mark, kept for good.** Each answer appends an
 *   `OriginMark` naming the scene, the version it was said of and the idea
 *   as it stands there; none is changed or dropped (`isAppendOnly`).
 * - **A mark says what the version says.** A correction is a new version
 *   of the owner's whose scene carries the idea, written with the mark in
 *   one write, so the cut list the renderer draws holds it; a mark whose
 *   idea isn't the latest version's for that scene is refused.
 * - **Yours cites your own words.** A `you` origin the owner gives cites a
 *   note the owner wrote or a take the owner recorded, both kept in the
 *   project; any other (an idea's answer, a voice note) is one Claude's
 *   versions gave the scene, which the owner can confirm, not make up.
 * - **Asked again when it moves.** A scene stands confirmed while its last
 *   mark's idea is the latest version's; a later version that changes it
 *   (Claude's, say) asks again, and one that leaves it keeps the mark.
 * - **A bare card carries no idea.** A card picture with no take and no
 *   line of the script (the series' title or end card) is never asked
 *   (`carriesIdea`; owner, #2253).
 * - **Finish waits on it.** A version is ready for YouTube only once every
 *   scene that carries an idea is confirmed (`./finish`); one marked ready
 *   before stays so.
 */
import type { Idea, Shot } from "@some-ui/video-render"

import { latestShot, primerAt, sameJson } from "./lookup"
import type { Project } from "./model"

/** The owner's word on whose idea scene `shot` presents in version `rev`. */
export type OriginMark = {
  readonly shot: string
  readonly rev: number
  /** ISO 8601, UTC. */
  readonly at: string
  readonly idea: Idea
}

/** Why the owner's word on a scene's idea can't be kept. */
export type OriginRefusal =
  /** The latest version has no such scene. */
  | "noShot"
  /** The latest version gives the scene another idea. */
  | "otherIdea"
  /** A `you` origin citing words the project doesn't hold as the owner's. */
  | "notYours"
  /** That is already the owner's word on the scene. */
  | "duplicate"

/** The owner's last word on scene `shot`, if any. */
function lastMark(project: Project, shot: string): OriginMark | null {
  const marks = (project.origins ?? []).filter((each) => each.shot === shot)
  return marks.at(-1) ?? null
}

/** Whether the owner has said scene `shot`'s idea is as the latest version has it. */
export function originConfirmed(project: Project, shot: string): boolean {
  const scene = latestShot(project, shot)
  const mark = lastMark(project, shot)
  return scene !== null && mark !== null && sameJson(mark.idea, scene.idea)
}

/**
 * Whether scene `shot` of the latest version carries an idea to ask the
 * owner about: any but a bare card, a card picture with no take and no
 * line of the script, which presents no one's idea.
 */
export function carriesIdea(project: Project, shot: Shot): boolean {
  if (
    shot.picture.kind !== "card" ||
    shot.take !== undefined ||
    project.chosen[shot.id] !== undefined
  )
    return true
  const line = shot.cut ?? shot.id
  const primer = primerAt(project, project.revisions.at(-1)?.rev ?? 0)
  return primer?.cuts.some((cut) => cut.id === line) === true
}

/** The latest version's scenes that wait on the owner's word, in order, numbered from 1. */
export function originsWaiting(
  project: Project
): ReadonlyArray<{ readonly shot: string; readonly n: number }> {
  const shots = project.revisions.at(-1)?.cutList.shots ?? []
  return shots.flatMap((shot, index) =>
    carriesIdea(project, shot) && !originConfirmed(project, shot.id)
      ? [{ shot: shot.id, n: index + 1 }]
      : []
  )
}

/**
 * Whether a `you` origin for scene `shot` cites words the project holds as
 * the owner's: a note the owner wrote, a take the owner recorded, or a
 * citation one of Claude's versions gave the scene (an idea's answer, a
 * voice note, a prompt), which the phone can confirm but not make up.
 * The renderer refuses a cited note the same way, from the cut list's own
 * notes (video-render's `authorshipProblems`).
 */
function citesOwnWords(project: Project, shot: string, idea: Idea): boolean {
  if (idea.origin !== "you") return true
  const { kind, id } = idea.from
  if (kind === "note")
    return project.notes.some(
      (note) => note.id === id && note.author === "owner"
    )
  if (kind === "take") return project.takes.some((take) => take.id === id)
  return project.revisions.some(
    (revision) =>
      revision.author === "claude" &&
      revision.cutList.shots.some(
        (each) => each.id === shot && sameJson(each.idea, idea)
      )
  )
}

/** Why the owner's word that scene `shot` presents `idea` can't be kept, or null. */
export function originRefusal(
  project: Project,
  shot: string,
  idea: Idea
): OriginRefusal | null {
  const scene = latestShot(project, shot)
  if (scene === null) return "noShot"
  if (!sameJson(scene.idea, idea)) return "otherIdea"
  if (originConfirmed(project, shot)) return "duplicate"
  return citesOwnWords(project, shot, idea) ? null : "notYours"
}
