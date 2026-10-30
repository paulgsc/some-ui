/**
 * What each Studio screen shows, read off the project: pure, so a component
 * renders it and a test checks it without a store or a microphone.
 */
import type { Shot } from "@some-ui/video-render"
import type { Cut } from "@soundbites/lib/journal/primer"
import type { Note, Project, ProjectTake } from "@soundbites/lib/project/model"
import { latest } from "@soundbites/lib/project/model"
import { capFor, chosenTake, scriptOf } from "@soundbites/lib/project/script"

import type { SittingKind } from "./words"
import { STUDIO_WORDS } from "./words"

type SittingRow = {
  readonly kind: SittingKind
  readonly status: string
  /** Whether choosing it starts a sitting on the phone. */
  readonly open: boolean
  readonly startHere: boolean
}

export type StartView = {
  readonly title: string
  readonly standing: string
  readonly sittings: ReadonlyArray<SittingRow>
}

/** The last closed sitting's log lines, if a sitting has closed. */
function lastLog(project: Project): { done: string; next: string } | null {
  const closed = project.sittings.filter((each) => each.closedAt !== null)
  const last = closed.at(-1)
  return last === undefined ? null : { done: last.done, next: last.next }
}

/** How many of the latest revision's scenes have a chosen take. */
function takenCount(project: Project): number {
  return latest(project).cutList.shots.filter(
    (shot) => project.chosen[shot.id] !== undefined
  ).length
}

export function startView(project: Project): StartView {
  const scenes = latest(project).cutList.shots.length
  const later = (kind: SittingKind): SittingRow => ({
    kind,
    status: STUDIO_WORDS.start.notYet,
    open: false,
    startHere: false,
  })
  return {
    title: latest(project).cutList.title,
    standing: STUDIO_WORDS.standing(lastLog(project)),
    sittings: [
      {
        kind: "record",
        status: STUDIO_WORDS.recordStatus(takenCount(project), scenes),
        open: true,
        // The one sitting the phone runs today, so the most useful one.
        startHere: true,
      },
      later("watch"),
      {
        kind: "shape",
        status: STUDIO_WORDS.shape.status(
          latest(project).cutList.look,
          latest(project).cutList.voice
        ),
        open: true,
        startHere: false,
      },
      later("finish"),
    ],
  }
}

export type RecordView = {
  readonly shot: Shot
  readonly cut: Cut | null
  /** From 1. */
  readonly n: number
  readonly of: number
  readonly take: ProjectTake | null
  /** Claude's open note on this scene, when it asked for a redo. */
  readonly note: Note | null
  readonly capMs: number
  readonly last: boolean
}

export function recordView(
  project: Project,
  shotId: string
): RecordView | null {
  const { scenes } = scriptOf(project)
  const index = scenes.findIndex((scene) => scene.shot.id === shotId)
  const scene = scenes[index]
  if (scene === undefined) return null
  const notes = project.notes.filter(
    (note) =>
      note.shot === shotId && note.author === "claude" && note.status === "open"
  )
  return {
    shot: scene.shot,
    cut: scene.cut,
    n: index + 1,
    of: scenes.length,
    take: chosenTake(project, shotId),
    note: notes.at(-1) ?? null,
    capMs: capFor(project, shotId),
    last: index === scenes.length - 1,
  }
}

/** The scene `step` places away from `shotId` in the latest revision, if any. */
export function sceneBeside(
  project: Project,
  shotId: string,
  step: 1 | -1
): string | null {
  const { shots } = latest(project).cutList
  const index = shots.findIndex((shot) => shot.id === shotId)
  return index < 0 ? null : (shots[index + step]?.id ?? null)
}

/** Where the next sitting opens, as the Done screen says it. */
export function opensOn(project: Project, shotId: string): string | null {
  const view = recordView(project, shotId)
  if (view === null) return null
  return STUDIO_WORDS.done.opensOn(view.n, view.cut?.artifact ?? view.shot.id)
}

/** How many of a project's takes still have their audio on the phone. */
export function takesOnPhone(project: Project): number {
  return project.takes.filter((take) => take.onPhone).length
}

type OtherVideo = {
  readonly id: string
  readonly title: string
  readonly onPhone: number
}

/**
 * The videos besides the one on screen whose takes still take room on the
 * phone, most takes first: Start lists them, so each can be opened and its
 * takes shared and let go.
 */
export function othersOnPhone(
  projects: ReadonlyArray<Project>,
  current: string | null
): ReadonlyArray<OtherVideo> {
  return projects
    .filter((each) => each.id !== current && takesOnPhone(each) > 0)
    .map((each) => ({
      id: each.id,
      title: latest(each).cutList.title,
      onPhone: takesOnPhone(each),
    }))
    .sort((a, b) => b.onPhone - a.onPhone || a.title.localeCompare(b.title))
}
