/**
 * Watch (STUDIO ST5), read off a review render: which scene plays at a
 * moment, so a note made there is pinned to (revision, scene, offset), and
 * which of Claude's changes the playhead has reached, asked one at a time.
 * Pure, so the machine decides with it and a test checks it alone.
 *
 * - **Times come from the render** (`review.json`), never a sum of
 *   durations: transitions overlap scenes, so where two play at once the
 *   later one is the one on screen.
 * - **A change is a note Claude applied** on an earlier revision, found at
 *   its moment in this one (`anchorAt`). Good confirms it; Not yet leaves it
 *   as it is and writes a new open note at that moment, wherever the
 *   playhead has gone since, as a note's status only moves forward.
 */
import type { Review } from "@some-ui/video-render"
import type { Note, Project } from "@soundbites/lib/project/model"
import { anchorAt } from "@soundbites/lib/project/model"

/** The scene on screen `ms` into `review`, and how far into it. */
export function shotAt(
  review: Review,
  ms: number
): { readonly shot: string; readonly offsetMs: number } | null {
  const playing = review.shotTimes.filter(
    (each) => each.startMs <= ms && ms < each.startMs + each.durationMs
  )
  const on = playing.at(-1)
  return on === undefined
    ? null
    : { shot: on.id, offsetMs: Math.round(ms - on.startMs) }
}

/** A change Claude made, and its moment in the review: scene, offset, time. */
type Change = {
  readonly note: Note
  readonly shot: string
  readonly offsetMs: number
  readonly atMs: number
}

/** Claude's changes that show in `review`, in the order they play. */
export function changesIn(
  project: Project,
  review: Review
): ReadonlyArray<Change> {
  const timesOf = (rev: number): Review["shotTimes"] | null =>
    rev === review.rev ? review.shotTimes : null
  return project.notes
    .filter((note) => note.status === "applied" && note.rev < review.rev)
    .flatMap((note) => {
      const anchor = anchorAt(project, note, review.rev, timesOf)
      return anchor.kind === "here" && anchor.atMs !== null
        ? [
            {
              note,
              shot: anchor.shot,
              offsetMs: anchor.offsetMs,
              atMs: anchor.atMs,
            },
          ]
        : []
    })
    .sort((a, b) => a.atMs - b.atMs)
}

/** The first change the playhead has reached and nobody has answered. */
export function askedAt(
  changes: ReadonlyArray<Change>,
  ms: number,
  answered: ReadonlyArray<string>
): Change | null {
  return (
    changes.find(
      (change) => change.atMs <= ms && !answered.includes(change.note.id)
    ) ?? null
  )
}

/** Whether `review` is a render of revision `rev` of `project` as kept. */
export function isReviewOf(project: Project, review: Review): boolean {
  const revision = project.revisions.find((each) => each.rev === review.rev)
  if (revision === undefined) return false
  const { title, shots } = revision.cutList
  return (
    title === review.title &&
    shots.length === review.shotTimes.length &&
    shots.every((shot, index) => shot.id === review.shotTimes[index]?.id)
  )
}
