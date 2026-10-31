/**
 * Finish (STUDIO ST7): whether a video's latest revision is ready for
 * YouTube, or the one thing missing. Pure, so a screen renders it and the
 * project's `step` refuses a mark it doesn't allow by the same rule.
 *
 * - **Ready** is four things: no note open, a kept take on every scene,
 *   the owner's word on whose idea each scene is (`./origin`), and the
 *   owner's mark on that revision. Missing ones are named in that order,
 *   one at a time, since each has its own place to go. A revision marked
 *   before Finish waited on the owner's word stays ready (owner, #2253).
 * - **Released** is the YouTube link the owner pastes after uploading by
 *   hand (owner, 2026-10-29: nothing here uploads).
 */
import type { Note, Project } from "./model"
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
  const note = project.notes.find((each) => each.status === "open")
  if (note !== undefined) return { kind: "note", rev, note }
  const shots = project.revisions.at(-1)?.cutList.shots ?? []
  const index = shots.findIndex((shot) => project.chosen[shot.id] === undefined)
  const shot = shots[index]
  if (shot !== undefined)
    return { kind: "take", rev, shot: shot.id, n: index + 1 }
  if (isMarked(project, rev)) return { kind: "ready", rev }
  const waiting = originsWaiting(project)
  const [first] = waiting
  if (first !== undefined)
    return { kind: "idea", rev, ...first, count: waiting.length }
  return { kind: "unmarked", rev }
}

/** Whether the owner marked revision `rev` ready. */
function isMarked(project: Project, rev: number): boolean {
  return project.ready?.some((each) => each.rev === rev) === true
}

/** A revision `rev` has been released, so it takes no new note. */
export function isReleased(project: Project, rev: number): boolean {
  return project.released?.some((each) => each.rev === rev) === true
}

const YOUTUBE_ID = /^[\w-]{11}$/

/**
 * The video a pasted YouTube link names, as one link
 * (`https://youtu.be/<id>`); null for anything else.
 */
export function youtubeLink(text: string): string | null {
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    return null
  }
  if (url.protocol !== "https:") return null
  const host = url.hostname.replace(/^(www|m)\./, "")
  const path = url.pathname.split("/").filter((part) => part !== "")
  let id: string | null = null
  if (host === "youtu.be" && path.length === 1) id = path[0] ?? null
  else if (host === "youtube.com") {
    if (path[0] === "watch" && path.length === 1) id = url.searchParams.get("v")
    else if (path[0] === "shorts" && path.length === 2) id = path[1] ?? null
  }
  return id !== null && YOUTUBE_ID.test(id) ? `https://youtu.be/${id}` : null
}
