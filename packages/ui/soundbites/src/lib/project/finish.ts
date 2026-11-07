/**
 * Finish (STUDIO ST7): whether a video's latest revision is ready for
 * YouTube, or the one thing missing. Pure, so a screen renders it and the
 * project's `step` refuses a mark it doesn't allow by the same rule.
 *
 * - **Ready** is four things: no note open (a change proposed to an
 *   episode's show is for its next episodes, SH4), a kept take on every scene,
 *   the owner's word on whose idea each scene is (`./origin`), and the
 *   owner's mark on that revision. Missing ones are named in that order,
 *   one at a time, since each has its own place to go. A revision marked
 *   before Finish waited on the owner's word stays ready (owner, #2253).
 * - **An episode's takes say their facts** (SHOW SH5). On an episode, a
 *   scene whose kept take's latest fact check (ST21, as a round brought it:
 *   `checks`) didn't pass is named after the takes, with how many of the
 *   scene's takes didn't, until it is taken again or the owner keeps it
 *   after three rounds (`accepted`, PDM15). A take with no check yet is let
 *   through (owner, 2026-11-04): nothing writes checks until ST8's loop
 *   does (#2256).
 * - **Released** is the YouTube link the owner pastes after uploading by
 *   hand (owner, 2026-10-29: nothing here uploads).
 */
import type { FactCheck, Note, Project, Queued } from "./model"
import { originsWaiting } from "./origin"

/** Where the latest revision stands, for Finish. */
export type Finish =
  /** A note still open: the first one written. */
  | { readonly kind: "note"; readonly rev: number; readonly note: Note }
  /** A scene with no kept take: the first, from 1. */
  | {
      readonly kind: "take"
      readonly rev: number
      readonly shot: string
      readonly n: number
    }
  /**
   * An episode's scene whose kept take didn't pass its fact check, and how
   * many of its takes haven't (`BEST_OF` or more: the owner may keep it).
   */
  | {
      readonly kind: "facts"
      readonly rev: number
      readonly shot: string
      readonly n: number
      readonly rounds: number
    }
  /** Scenes whose idea waits on the owner's word: the first, from 1, and how many. */
  | {
      readonly kind: "idea"
      readonly rev: number
      readonly shot: string
      readonly n: number
      readonly count: number
    }
  /** Nothing missing but the owner's word that it is ready. */
  | { readonly kind: "unmarked"; readonly rev: number }
  /** Nothing missing, and marked ready: the upload copy, then the link. */
  | { readonly kind: "ready"; readonly rev: number }
  | { readonly kind: "released"; readonly rev: number; readonly url: string }

function latestRev(project: Project): number {
  return project.revisions.at(-1)?.rev ?? 0
}

export function finishOf(project: Project): Finish {
  const rev = latestRev(project)
  const release = project.released?.find((each) => each.rev === rev)
  if (release !== undefined) return { kind: "released", rev, url: release.url }
  const note = project.notes.find(
    (each) => each.status === "open" && each.about !== "show"
  )
  if (note !== undefined) return { kind: "note", rev, note }
  const shots = project.revisions.at(-1)?.cutList.shots ?? []
  const index = shots.findIndex((shot) => project.chosen[shot.id] === undefined)
  const shot = shots[index]
  if (shot !== undefined)
    return { kind: "take", rev, shot: shot.id, n: index + 1 }
  if (project.episode !== undefined) {
    const facts = factsOf(project, rev, shots)
    if (facts !== null) return facts
  }
  if (isMarked(project, rev)) return { kind: "ready", rev }
  const waiting = originsWaiting(project)
  const [first] = waiting
  if (first !== undefined)
    return { kind: "idea", rev, ...first, count: waiting.length }
  return { kind: "unmarked", rev }
}

/** Rounds of a scene's take check after which the owner may keep the best (PDM15). */
export const BEST_OF = 3

/**
 * A take's latest fact check by when it ran, or undefined before its first.
 * Not the last in `checks`: a merge of an older file appends its checks after
 * newer ones.
 */
function checkOf(project: Project, take: string): FactCheck | undefined {
  let latest: FactCheck | undefined
  for (const each of project.checks ?? []) {
    if (
      each.take === take &&
      (latest === undefined || Date.parse(each.at) >= Date.parse(latest.at))
    )
      latest = each
  }
  return latest
}

/** The first scene whose kept take's check didn't pass and isn't kept by the owner's word, or null. */
function factsOf(
  project: Project,
  rev: number,
  shots: ReadonlyArray<{ readonly id: string }>
): Finish | null {
  for (const [index, shot] of shots.entries()) {
    const take = project.chosen[shot.id]
    if (take === undefined) continue
    const check = checkOf(project, take)
    if (check === undefined || check.passed) continue
    const kept = (project.accepted ?? []).some(
      (each) => each.shot === shot.id && each.take === take
    )
    if (kept) continue
    const rounds = project.takes.filter(
      (each) =>
        each.shot === shot.id && checkOf(project, each.id)?.passed === false
    ).length
    return { kind: "facts", rev, shot: shot.id, n: index + 1, rounds }
  }
  return null
}

/** Whether the owner marked revision `rev` ready. */
function isMarked(project: Project, rev: number): boolean {
  return project.ready?.some((each) => each.rev === rev) === true
}

/** The mark that queued revision `rev` for home to make (ST33), if it was. */
export function queuedOf(project: Project, rev: number): Queued | null {
  return project.queued?.find((each) => each.rev === rev) ?? null
}

/** Whether revision `rev` is queued for home to make (ST33). */
export const isQueued = (project: Project, rev: number): boolean =>
  queuedOf(project, rev) !== null

/** A revision `rev` has been released, so it takes no new note. */
export function isReleased(project: Project, rev: number): boolean {
  return project.released?.some((each) => each.rev === rev) === true
}
