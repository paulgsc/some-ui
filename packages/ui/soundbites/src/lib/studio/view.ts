/**
 * What each Studio screen shows, read off the project: pure, so a component
 * renders it and a test checks it without a store or a microphone.
 */
import { assertNever } from "@some-ui/core-utils"
import type { Idea, Shot } from "@some-ui/video-render"
import type { TakeButtonView, TakeRowView } from "@some-ui/voice-capture"
import { NEARLY_UP_MS } from "@some-ui/voice-capture"
import type { Cut } from "@soundbites/lib/journal/primer"
import type { Finish } from "@soundbites/lib/project/finish"
import { finishOf } from "@soundbites/lib/project/finish"
import { waitingTakes } from "@soundbites/lib/project/let-go"
import type { Note, Project, ProjectTake } from "@soundbites/lib/project/model"
import { homeHolds, latest } from "@soundbites/lib/project/model"
import { originConfirmed, originsWaiting } from "@soundbites/lib/project/origin"
import { capFor, chosenTake, scriptOf } from "@soundbites/lib/project/script"

import type { StudioState } from "./machine"
import type { SittingKind, Whose } from "./words"
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

/** Claude's changes not yet confirmed: notes applied, waiting to be watched. */
function changesWaiting(project: Project): number {
  return project.notes.filter((note) => note.status === "applied").length
}

/** How many of the latest revision's scenes have a chosen take. */
function takenCount(project: Project): number {
  return latest(project).cutList.shots.filter(
    (shot) => project.chosen[shot.id] !== undefined
  ).length
}

export function startView(project: Project): StartView {
  const scenes = latest(project).cutList.shots.length
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
      {
        kind: "watch",
        status: STUDIO_WORDS.watch.status(
          changesWaiting(project),
          originsWaiting(project).length
        ),
        open: true,
        startHere: false,
      },
      {
        kind: "shape",
        status: STUDIO_WORDS.shape.status(
          latest(project).cutList.look,
          latest(project).cutList.voice
        ),
        open: true,
        startHere: false,
      },
      {
        kind: "finish",
        status: finishStatus(finishOf(project)),
        open: true,
        startHere: false,
      },
    ],
  }
}

/** Finish's row on Start, a few words. */
function finishStatus(finish: Finish): string {
  const words = STUDIO_WORDS.finish.status
  switch (finish.kind) {
    case "note": {
      return words.note
    }
    case "take": {
      return words.take(finish.n)
    }
    case "idea": {
      return words.idea(finish.count)
    }
    case "unmarked":
    case "ready":
    case "released": {
      return words[finish.kind]
    }
    default: {
      return assertNever(finish)
    }
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

/** A take home holds that is still on the phone, as Start lists it (HF11). */
export type WaitingTake = {
  readonly id: string
  /** Its scene's number in the latest version; null for a scene since dropped. */
  readonly scene: number | null
  readonly durationMs: number
  /** Whether the owner said it reached Drive when they shared it. */
  readonly shared: boolean
}

/** The takes of `project` home holds that wait on the phone, oldest first. */
export function waitingView(project: Project): ReadonlyArray<WaitingTake> {
  const { shots } = latest(project).cutList
  return [...waitingTakes(project)]
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
    .map((take) => {
      const n = shots.findIndex((shot) => shot.id === take.shot) + 1
      return {
        id: take.id,
        scene: n === 0 ? null : n,
        durationMs: take.durationMs,
        shared: take.keptBy.includes("drive"),
      }
    })
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

/** One version of the video, for History: newest first. */
type HistoryRow = {
  readonly rev: number
  readonly who: string
  readonly message: string
  readonly at: string
}

export function historyView(project: Project): ReadonlyArray<HistoryRow> {
  return [...project.revisions].reverse().map((revision) => ({
    rev: revision.rev,
    who: STUDIO_WORDS.history.by[revision.author],
    message: revision.message,
    at: revision.at,
  }))
}

/** A scene's idea in the person's terms (ST16): a note it cites, by its words. */
export function whoseOf(project: Project, idea: Idea): Whose {
  switch (idea.origin) {
    case "agent": {
      return { who: "agent" }
    }
    case "source": {
      return { who: "source", title: idea.from.title }
    }
    case "you": {
      const { kind, id } = idea.from
      if (kind !== "note") return { who: "you", from: kind }
      const note = project.notes.find((each) => each.id === id)
      return { who: "you", from: "note", words: note?.text ?? null }
    }
    default: {
      return assertNever(idea)
    }
  }
}

/** Whose idea a scene of the latest version is, for Watch (ST5). */
export type OriginView = {
  readonly shot: string
  /** From 1. */
  readonly n: number
  readonly idea: Idea
  readonly whose: Whose
  /** Whether the owner has said so of it as it stands. */
  readonly confirmed: boolean
  /** The take chosen for it, which a `you` origin may cite. */
  readonly take: string | null
}

export function originView(
  project: Project,
  shotId: string
): OriginView | null {
  const { shots } = latest(project).cutList
  const index = shots.findIndex((shot) => shot.id === shotId)
  const shot = shots[index]
  if (shot === undefined) return null
  return {
    shot: shot.id,
    n: index + 1,
    idea: shot.idea,
    whose: whoseOf(project, shot.idea),
    confirmed: originConfirmed(project, shot.id),
    take: chosenTake(project, shot.id)?.id ?? null,
  }
}

/**
 * The scene's take as the take pattern's parts draw it (`TakeButton`,
 * `TakeRow` in `@some-ui/shared`): the button, which records the scene's
 * first take or, once it has one, records it again ("Again" adds a take,
 * and the new one is the scene's chosen take); and the chosen take as a
 * row, with Play it back while its audio is on this phone. The project
 * model stays the record of every take (`project/model.ts`): this only
 * projects the machine's activity and the chosen take onto the parts.
 */
export function recordTake(
  state: Pick<StudioState, "activity">,
  view: Pick<RecordView, "take">
): { readonly button: TakeButtonView; readonly row: TakeRowView | null } {
  const { activity } = state
  const settled = activity.kind === "idle" || activity.kind === "playing"
  const button = ((): TakeButtonView => {
    switch (activity.kind) {
      case "opening": {
        return { kind: "opening" }
      }
      case "recording": {
        return {
          kind: "recording",
          elapsedMs: activity.elapsed,
          capMs: activity.capMs,
          level: activity.level,
          nearlyUp: activity.capMs - activity.elapsed <= NEARLY_UP_MS,
          clock: "elapsed",
        }
      }
      case "saving": {
        return { kind: "keeping" }
      }
      case "idle":
      case "playing": {
        return { kind: "ready", again: view.take !== null }
      }
      default: {
        return assertNever(activity)
      }
    }
  })()
  const { take } = view
  if (take === null) return { button, row: null }
  return {
    button,
    row: {
      take: {
        id: take.id,
        answers: take.shot,
        durationMs: take.durationMs,
        recordedAt: take.recordedAt,
        standing: "current",
        // On home once home holds it; on this phone, going home, until
        // then; on neither, no place (a take carried in without its audio).
        kept: homeHolds(take)
          ? { place: "home", since: null }
          : take.onPhone
            ? { place: "going" }
            : null,
      },
      playing: activity.kind === "playing" && activity.take === take.id,
      canPlay: settled && take.onPhone,
      // Recording it again is the button's ("Tap to record again").
      canRedo: false,
      canLetGo: false,
      unsent: false,
    },
  }
}
