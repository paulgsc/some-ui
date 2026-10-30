/**
 * A Studio video as a project, like a repository: its cut list's revisions,
 * the notes pinned to moments in them, every take recorded for it, and a log
 * entry per sitting. `step(state, event)` returns the next state and the
 * effects to run, and does nothing else (docs/monorepo-boundaries.md, "Inside
 * a React package"); a runtime runs `save` and `finishTake` against the
 * store and the microphone.
 *
 * Rules that hold by structure:
 *
 * - **A revision is never overwritten.** `revised` appends the next number,
 *   and `isAppendOnly` refuses any save that changes or drops one already
 *   kept, so a store can check it in the transaction that writes.
 * - **Every take is kept.** A new take is chosen for its shot; the take it
 *   replaces stays, unchosen, and can be chosen again.
 * - **Nothing leaves the phone unconfirmed.** A take's audio is let go only
 *   once home or Drive has said it holds a copy (`letGoRefusal`), and its
 *   record stays either way.
 * - **Closing a sitting mid-take keeps the take.** The take is finished
 *   first, and the sitting closes once it is kept or has failed.
 * - **A note follows its shot.** It is pinned to (revision, shot, offset),
 *   and `anchorAt` finds that shot in any later revision by id, or says the
 *   shot is gone.
 */
import { assertNever } from "@some-ui/core-utils"
import type { CutList } from "@some-ui/video-render"

export const PROJECT_SCHEMA = "some-ui.studio-project/1"

type Author = CutList["revisions"][number]["author"]

/** What a revision holds: the cut list, less the history the project keeps. */
export type CutListShape = Omit<CutList, "revisions" | "notes">

export type Revision = {
  /** From 1, one more than the revision before. */
  readonly rev: number
  readonly author: Author
  readonly message: string
  /** ISO 8601, UTC. */
  readonly at: string
  readonly cutList: CutListShape
}

type NoteStatus = CutList["notes"][number]["status"]

export type Note = {
  readonly id: string
  /** The revision, shot and offset it was written against. */
  readonly rev: number
  readonly shot: string
  readonly offsetMs: number
  readonly author: Author
  readonly text: string
  readonly status: NoteStatus
  /** Why it was declined. */
  readonly reason?: string
}

/** Who has said it holds a copy of a take's audio. */
type Keeper = "home" | "drive"

export type ProjectTake = {
  readonly id: string
  readonly shot: string
  /** ISO 8601, UTC. */
  readonly recordedAt: string
  readonly durationMs: number
  readonly mimeType: string
  readonly keptBy: ReadonlyArray<Keeper>
  /** Whether its audio is still on the phone. */
  readonly onPhone: boolean
}

export type Sitting = {
  readonly id: string
  /** ISO 8601, UTC. */
  readonly openedAt: string
  readonly closedAt: string | null
  /** What was done, and what is next: one line each, for the next sitting. */
  readonly done: string
  readonly next: string
}

export type Project = {
  readonly schema: typeof PROJECT_SCHEMA
  readonly id: string
  readonly revisions: ReadonlyArray<Revision>
  readonly notes: ReadonlyArray<Note>
  readonly takes: ReadonlyArray<ProjectTake>
  /** The chosen take for each shot that has one, by shot id. */
  readonly chosen: Readonly<Record<string, string>>
  readonly sittings: ReadonlyArray<Sitting>
}

/** A take under way, and the sitting waiting on it to close. */
export type ProjectState = {
  readonly project: Project
  readonly taking: { readonly shot: string } | null
  readonly closing:
    | (Pick<Sitting, "done" | "next"> & {
        readonly at: string
      })
    | null
}

export type ProjectEvent =
  | {
      readonly type: "revised"
      readonly author: Author
      readonly message: string
      readonly at: string
      readonly cutList: CutListShape
    }
  | { readonly type: "noted"; readonly note: Omit<Note, "status" | "reason"> }
  | {
      readonly type: "noteSettled"
      readonly id: string
      readonly status: Exclude<NoteStatus, "open">
      readonly reason?: string
    }
  | { readonly type: "takeStarted"; readonly shot: string }
  | {
      readonly type: "taken"
      readonly take: Omit<ProjectTake, "keptBy" | "onPhone">
    }
  | { readonly type: "takeFailed" }
  | { readonly type: "chosen"; readonly shot: string; readonly take: string }
  | { readonly type: "keptBy"; readonly take: string; readonly keeper: Keeper }
  | { readonly type: "letGo"; readonly take: string }
  | { readonly type: "sittingOpened"; readonly id: string; readonly at: string }
  | ({ readonly type: "sittingClosed"; readonly at: string } & Pick<
      Sitting,
      "done" | "next"
    >)

export type ProjectEffect =
  | { readonly type: "save"; readonly project: Project }
  | { readonly type: "finishTake" }

/** Why an event changed nothing. Said to the person by `REFUSALS`. */
export type Refusal =
  | "noRevision"
  | "noShot"
  | "noNote"
  | "noTake"
  | "duplicate"
  | "settled"
  | "noReason"
  | "taking"
  | "notTaking"
  | "sittingOpen"
  | "noSitting"
  | "unconfirmed"

export type ProjectStep = {
  readonly state: ProjectState
  readonly effects: ReadonlyArray<ProjectEffect>
  readonly refused: Refusal | null
}

export function newProject(
  id: string,
  first: Omit<Revision, "rev">
): ProjectState {
  return {
    project: {
      schema: PROJECT_SCHEMA,
      id,
      revisions: [{ ...first, rev: 1 }],
      notes: [],
      takes: [],
      chosen: {},
      sittings: [],
    },
    taking: null,
    closing: null,
  }
}

export function latest(project: Project): Revision {
  const last = project.revisions.at(-1)
  if (last === undefined) throw new Error("a project has a first revision")
  return last
}

function revisionOf(project: Project, rev: number): Revision | null {
  return project.revisions.find((each) => each.rev === rev) ?? null
}

/** The sitting under way, if one is. */
function openSitting(project: Project): Sitting | null {
  const last = project.sittings.at(-1)
  return last?.closedAt === null ? last : null
}

type Placed = { readonly startMs: number; readonly durationMs: number }

function placed(cutList: CutListShape, shot: string): Placed | null {
  let startMs = 0
  for (const each of cutList.shots) {
    if (each.id === shot) return { startMs, durationMs: each.durationMs }
    startMs += each.durationMs
  }
  return null
}

/** Where a note's moment is in revision `rev`. */
export type Anchor =
  | {
      readonly kind: "here"
      readonly shot: string
      readonly offsetMs: number
      /** Its time in the video at `rev`. */
      readonly atMs: number
      /** Whether that time differs from the one the note was written at. */
      readonly moved: boolean
      /** Whether the shot got shorter than the offset, so it sits at its end. */
      readonly clipped: boolean
    }
  | { readonly kind: "gone"; readonly shot: string }

export function anchorAt(project: Project, note: Note, rev: number): Anchor {
  const target = revisionOf(project, rev)
  const there = target === null ? null : placed(target.cutList, note.shot)
  if (there === null) return { kind: "gone", shot: note.shot }
  const source = revisionOf(project, note.rev)
  const was = source === null ? null : placed(source.cutList, note.shot)
  const clipped = note.offsetMs > there.durationMs
  const offsetMs = clipped ? there.durationMs : note.offsetMs
  const atMs = there.startMs + offsetMs
  return {
    kind: "here",
    shot: note.shot,
    offsetMs,
    atMs,
    moved: was === null || was.startMs + note.offsetMs !== atMs,
    clipped,
  }
}

/** The cut list as revision `rev` reads, with the history up to it. */
export function cutListAt(project: Project, rev: number): CutList | null {
  const revision = revisionOf(project, rev)
  if (revision === null) return null
  return {
    ...revision.cutList,
    revisions: project.revisions
      .filter((each) => each.rev <= rev)
      .map(({ rev: number, author, message, at }) => ({
        rev: number,
        author,
        message,
        at,
      })),
    notes: project.notes.filter((note) => note.rev <= rev),
  }
}

/** Why the audio of take `id` can't leave the phone, or null if it can. */
export function letGoRefusal(project: Project, id: string): Refusal | null {
  const take = project.takes.find((each) => each.id === id)
  if (take === undefined) return "noTake"
  if (take.keptBy.length === 0) return "unconfirmed"
  return null
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Whether `after` only adds to `before`: every revision kept as it was, every
 * note, take and sitting still there (a note's status and a take's keepers
 * may move on, a sitting may close, audio may leave once confirmed).
 */
export function isAppendOnly(before: Project, after: Project): boolean {
  if (before.id !== after.id) return false
  const revisions = before.revisions.every((each, index) =>
    sameJson(each, after.revisions[index])
  )
  const notes = before.notes.every((note) => {
    const now = after.notes.find((each) => each.id === note.id)
    return (
      now?.rev === note.rev &&
      now.shot === note.shot &&
      now.offsetMs === note.offsetMs &&
      now.text === note.text
    )
  })
  const takes = before.takes.every((take) => {
    const now = after.takes.find((each) => each.id === take.id)
    return (
      now?.recordedAt === take.recordedAt &&
      take.keptBy.every((keeper) => now.keptBy.includes(keeper)) &&
      // Audio leaves the phone only once someone else holds it.
      (now.onPhone || !take.onPhone || now.keptBy.length > 0)
    )
  })
  const sittings = before.sittings.every((sitting, index) => {
    const now = after.sittings[index]
    return (
      now?.id === sitting.id &&
      (sitting.closedAt === null || sameJson(now, sitting))
    )
  })
  return revisions && notes && takes && sittings
}

const SETTLES: Readonly<Record<NoteStatus, ReadonlyArray<NoteStatus>>> = {
  open: ["applied", "declined"],
  applied: ["confirmed"],
  declined: ["confirmed"],
  confirmed: [],
}

function changed(state: ProjectState, project: Project): ProjectStep {
  return {
    state: { ...state, project },
    effects: [{ type: "save", project }],
    refused: null,
  }
}

function refuse(state: ProjectState, refused: Refusal): ProjectStep {
  return { state, effects: [], refused }
}

function closeSitting(
  state: ProjectState,
  closing: NonNullable<ProjectState["closing"]>
): ProjectStep {
  const { project } = state
  const sitting = openSitting(project)
  if (sitting === null) return refuse({ ...state, closing: null }, "noSitting")
  const closed: Sitting = {
    ...sitting,
    closedAt: closing.at,
    done: closing.done,
    next: closing.next,
  }
  return changed(
    { ...state, closing: null },
    { ...project, sittings: [...project.sittings.slice(0, -1), closed] }
  )
}

export function step(state: ProjectState, event: ProjectEvent): ProjectStep {
  const { project } = state
  switch (event.type) {
    case "revised": {
      const { type: _, ...revision } = event
      return changed(state, {
        ...project,
        revisions: [
          ...project.revisions,
          { ...revision, rev: latest(project).rev + 1 },
        ],
      })
    }

    case "noted": {
      const { note } = event
      const revision = revisionOf(project, note.rev)
      if (revision === null) return refuse(state, "noRevision")
      if (placed(revision.cutList, note.shot) === null)
        return refuse(state, "noShot")
      if (project.notes.some((each) => each.id === note.id))
        return refuse(state, "duplicate")
      return changed(state, {
        ...project,
        notes: [...project.notes, { ...note, status: "open" }],
      })
    }

    case "noteSettled": {
      const note = project.notes.find((each) => each.id === event.id)
      if (note === undefined) return refuse(state, "noNote")
      if (!SETTLES[note.status].includes(event.status))
        return refuse(state, "settled")
      const reason = event.reason?.trim() ?? ""
      if (event.status === "declined" && reason === "")
        return refuse(state, "noReason")
      const { reason: _, ...rest } = note
      const settled: Note =
        event.status === "declined"
          ? { ...rest, status: event.status, reason }
          : { ...rest, status: event.status }
      return changed(state, {
        ...project,
        notes: project.notes.map((each) =>
          each.id === note.id ? settled : each
        ),
      })
    }

    case "takeStarted": {
      if (state.taking !== null || state.closing !== null)
        return refuse(state, "taking")
      if (placed(latest(project).cutList, event.shot) === null)
        return refuse(state, "noShot")
      return {
        state: { ...state, taking: { shot: event.shot } },
        effects: [],
        refused: null,
      }
    }

    case "taken": {
      const { take } = event
      if (state.taking === null) return refuse(state, "notTaking")
      if (project.takes.some((each) => each.id === take.id))
        return refuse(state, "duplicate")
      const kept = changed(
        { ...state, taking: null },
        {
          ...project,
          takes: [...project.takes, { ...take, keptBy: [], onPhone: true }],
          chosen: { ...project.chosen, [take.shot]: take.id },
        }
      )
      return state.closing === null
        ? kept
        : afterClose(kept, closeSitting(kept.state, state.closing))
    }

    case "takeFailed": {
      if (state.taking === null) return refuse(state, "notTaking")
      const stopped = { ...state, taking: null }
      return state.closing === null
        ? { state: stopped, effects: [], refused: null }
        : closeSitting(stopped, state.closing)
    }

    case "chosen": {
      const take = project.takes.find((each) => each.id === event.take)
      if (take?.shot !== event.shot) return refuse(state, "noTake")
      return changed(state, {
        ...project,
        chosen: { ...project.chosen, [event.shot]: take.id },
      })
    }

    case "keptBy": {
      const take = project.takes.find((each) => each.id === event.take)
      if (take === undefined) return refuse(state, "noTake")
      if (take.keptBy.includes(event.keeper)) return refuse(state, "duplicate")
      return changed(state, {
        ...project,
        takes: project.takes.map((each) =>
          each.id === take.id
            ? { ...each, keptBy: [...each.keptBy, event.keeper] }
            : each
        ),
      })
    }

    case "letGo": {
      const refused = letGoRefusal(project, event.take)
      if (refused !== null) return refuse(state, refused)
      return changed(state, {
        ...project,
        takes: project.takes.map((each) =>
          each.id === event.take ? { ...each, onPhone: false } : each
        ),
      })
    }

    case "sittingOpened": {
      if (openSitting(project) !== null) return refuse(state, "sittingOpen")
      return changed(state, {
        ...project,
        sittings: [
          ...project.sittings,
          {
            id: event.id,
            openedAt: event.at,
            closedAt: null,
            done: "",
            next: "",
          },
        ],
      })
    }

    case "sittingClosed": {
      if (openSitting(project) === null) return refuse(state, "noSitting")
      const closing = { at: event.at, done: event.done, next: event.next }
      if (state.taking === null) return closeSitting(state, closing)
      // The take is finished and kept first; `taken` or `takeFailed` closes.
      return {
        state: { ...state, closing },
        effects: [{ type: "finishTake" }],
        refused: null,
      }
    }

    default: {
      return assertNever(event)
    }
  }
}

/** One save for both writes: the last project carries the take too. */
function afterClose(kept: ProjectStep, closed: ProjectStep): ProjectStep {
  return closed.refused === null ? closed : kept
}
