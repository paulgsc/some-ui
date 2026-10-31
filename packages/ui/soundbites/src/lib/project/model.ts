/**
 * A Studio video as a project, like a repository: its cut list's revisions,
 * the notes pinned to moments in them, every take recorded for it, and a log
 * entry per sitting. `step(state, event)` returns the next state and the
 * effects to run, and does nothing else (docs/monorepo-boundaries.md, "Inside
 * a React package"); a runtime runs `save`, `keepTake` and `finishTake`
 * against the store and the microphone, and reads the store again when a
 * write is refused, since a refused write kept nothing.
 *
 * Rules that hold by structure:
 *
 * - **A revision is never overwritten.** `revised` appends the next number,
 *   and `isAppendOnly` refuses any save that changes or drops one already
 *   kept, so a store can check it in the transaction that writes.
 * - **Every take is kept.** A new take is chosen for its shot; the take it
 *   replaces stays, unchosen, and can be chosen again.
 * - **Nothing leaves the phone unconfirmed.** A take's audio is let go only
 *   once home has said it holds a copy (`letGoRefusal`), and its record
 *   stays either way. The save that marks it off the phone is the one
 *   that lets its audio go, checked again in the store (`isAppendOnly`).
 * - **Closing a sitting mid-take keeps the take.** The take is finished
 *   first, and the sitting closes once it is kept or has failed.
 * - **A released revision is never edited** (ST7, `./finish`). Its mark
 *   and its link stay as written, it takes no new note, and a change makes
 *   the next revision.
 * - **The owner's word on whose idea a scene is stays** (ST5, `./origin`).
 *   Each answer is a mark appended to `origins`; a correction is a new
 *   revision of the owner's carrying it, and a `you` origin cites the
 *   owner's own words.
 * - **A note follows its shot.** It is pinned to (revision, shot, offset),
 *   and `anchorAt` finds that shot in any later revision by id, or says the
 *   shot is gone; its time is read from the renderer's shot times.
 */
import { assertNever, canonicalJson } from "@some-ui/core-utils"
import type { CutList, Shot, ShotTime } from "@some-ui/video-render"
import type { Primer } from "@soundbites/lib/journal/primer"

import { finishOf, isReleased, youtubeLink } from "./finish"
import type { OriginMark } from "./origin"
import { originRefusal } from "./origin"

export const PROJECT_SCHEMA = "some-ui.studio-project/1"

type Author = Revision["author"]

/** What a revision holds: the cut list, less the history the project keeps. */
export type CutListShape = Omit<CutList, "revisions" | "notes">

export type Revision = Readonly<CutList["revisions"][number]> & {
  /** From 1, one more than the revision before. */
  readonly rev: number
  readonly cutList: CutListShape
  /**
   * The primer this revision brought, when it brought one: what each scene
   * says. `primerAt` finds the one in force at any revision.
   */
  readonly primer?: Primer
}

/** Pinned to the revision, shot and offset it was written against. */
export type Note = Readonly<CutList["notes"][number]>

type NoteStatus = Note["status"]

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
  /** The scene the next sitting opens on, once this one closes. */
  readonly shot: string | null
}

/** The owner's word that revision `rev` is ready for YouTube (ST7). */
type Mark = {
  readonly rev: number
  /** ISO 8601, UTC. */
  readonly at: string
}

/** Where revision `rev` went up, as the owner pasted it once uploaded. */
type Release = Mark & {
  /** `https://youtu.be/<id>` (`youtubeLink`). */
  readonly url: string
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
  /** Each revision marked ready, in order; absent on a project from before Finish. */
  readonly ready?: ReadonlyArray<Mark>
  /** Each revision released, in order; absent as `ready` is. */
  readonly released?: ReadonlyArray<Release>
  /**
   * The owner's word on each scene's idea (ST5), in order; absent on a
   * project from before Watch asked it.
   */
  readonly origins?: ReadonlyArray<OriginMark>
}

/** A take under way, and the sitting waiting on it to close. */
export type ProjectState = {
  readonly project: Project
  readonly taking: { readonly shot: string } | null
  readonly closing:
    | (Pick<Sitting, "done" | "next" | "shot"> & {
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
      readonly primer?: Primer
    }
  | { readonly type: "noted"; readonly note: Omit<Note, "status" | "reason"> }
  /**
   * The owner's own words for the record, such as where a scene's idea came
   * from (ST5): kept as the owner's note, confirmed as written, since it
   * asks Claude for nothing.
   */
  | {
      readonly type: "worded"
      readonly note: Omit<Note, "status" | "reason" | "author">
    }
  /** The owner's word on whose idea a scene of the latest revision is. */
  | ({ readonly type: "originSaid" } & Omit<OriginMark, "rev">)
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
      "done" | "next" | "shot"
    >)
  | ({ readonly type: "markedReady" } & Mark)
  | ({ readonly type: "released" } & Release)

export type ProjectEffect =
  | { readonly type: "save"; readonly project: Project }
  /** Save `project` with take `take`'s audio, in one write (`keepTake`). */
  | {
      readonly type: "keepTake"
      readonly project: Project
      readonly take: string
    }
  | { readonly type: "finishTake" }

/** Why an event changed nothing. */
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
  | "notLatest"
  | "notReady"
  | "released"
  | "noLink"
  | "otherIdea"
  | "notYours"

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

/** The primer in force at revision `rev`: the last one brought at or before it. */
export function primerAt(project: Project, rev: number): Primer | null {
  let found: Primer | null = null
  for (const each of project.revisions) {
    if (each.rev <= rev && each.primer !== undefined) found = each.primer
  }
  return found
}

/** The sitting under way, if one is. */
function openSitting(project: Project): Sitting | null {
  const last = project.sittings.at(-1)
  return last?.closedAt === null ? last : null
}

function shotIn(cutList: CutListShape, shot: string): Shot | null {
  return cutList.shots.find((each) => each.id === shot) ?? null
}

/**
 * Where the renderer put each shot of a revision (its `shot-times.json`),
 * or null when that revision has not been rendered. Times come only from
 * there: transitions overlap scenes and frames round them, so a sum of
 * durations is not where a scene plays.
 */
export type ShotTimesOf = (rev: number) => ReadonlyArray<ShotTime> | null

/** Where a note's moment is in revision `rev`. */
export type Anchor =
  | {
      readonly kind: "here"
      readonly shot: string
      readonly offsetMs: number
      /** Whether the shot got shorter than the offset, so it sits at its end. */
      readonly clipped: boolean
      /** Its time in the video at `rev`, once `rev` is rendered. */
      readonly atMs: number | null
      /**
       * Whether that time differs from the one the note was written at, once
       * both revisions are rendered.
       */
      readonly moved: boolean | null
    }
  | { readonly kind: "gone"; readonly shot: string }

function startOf(
  times: ReadonlyArray<ShotTime> | null,
  shot: string
): number | null {
  return times?.find((each) => each.id === shot)?.startMs ?? null
}

export function anchorAt(
  project: Project,
  note: Note,
  rev: number,
  timesOf: ShotTimesOf
): Anchor {
  const target = revisionOf(project, rev)
  const there = target === null ? null : shotIn(target.cutList, note.shot)
  if (there === null) return { kind: "gone", shot: note.shot }
  const clipped = note.offsetMs > there.durationMs
  const offsetMs = clipped ? there.durationMs : note.offsetMs
  const start = startOf(timesOf(rev), note.shot)
  const was = startOf(timesOf(note.rev), note.shot)
  const atMs = start === null ? null : start + offsetMs
  return {
    kind: "here",
    shot: note.shot,
    offsetMs,
    clipped,
    atMs,
    moved: atMs === null || was === null ? null : was + note.offsetMs !== atMs,
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

/** Whether home has said it holds a copy of `take`'s audio. */
export function homeHolds(take: ProjectTake): boolean {
  return take.keptBy.includes("home")
}

/** Why the audio of take `id` can't leave the phone, or null if it can (LG1). */
function letGoRefusal(project: Project, id: string): Refusal | null {
  const take = project.takes.find((each) => each.id === id)
  if (take === undefined) return "noTake"
  if (!homeHolds(take)) return "unconfirmed"
  return null
}

export function sameJson(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b)
}

const SETTLES: Readonly<Record<NoteStatus, ReadonlyArray<NoteStatus>>> = {
  open: ["applied", "declined"],
  applied: ["confirmed"],
  declined: ["confirmed"],
  confirmed: [],
}

/** Whether a note at `from` may be at `to` later: the same, or settled on from it. */
export function reaches(from: NoteStatus, to: NoteStatus): boolean {
  return from === to || SETTLES[from].some((next) => reaches(next, to))
}

/**
 * Whether `after` only adds to `before`: every revision kept as it was, every
 * note, take and sitting still there as written. Only a note's status moves
 * on (keeping a reason once given), a take gains keepers, an open sitting
 * closes, and audio leaves the phone once home holds it (LG1).
 */
export function isAppendOnly(before: Project, after: Project): boolean {
  if (before.id !== after.id) return false
  const revisions = before.revisions.every((each, index) =>
    sameJson(each, after.revisions[index])
  )
  const notes = before.notes.every((note) => {
    const now = after.notes.find((each) => each.id === note.id)
    // A reason may be given once; after that it stays as written.
    const fixed = (each: Note): unknown => ({
      ...each,
      status: null,
      reason: note.reason === undefined ? null : each.reason,
    })
    return (
      now !== undefined &&
      reaches(note.status, now.status) &&
      sameJson(fixed(now), fixed(note))
    )
  })
  const takes = before.takes.every((take) => {
    const now = after.takes.find((each) => each.id === take.id)
    return (
      now !== undefined &&
      sameJson(
        { ...now, keptBy: null, onPhone: null },
        { ...take, keptBy: null, onPhone: null }
      ) &&
      take.keptBy.every((keeper) => now.keptBy.includes(keeper)) &&
      (take.onPhone || !now.onPhone) &&
      (now.onPhone || !take.onPhone || homeHolds(now))
    )
  })
  const sittings = before.sittings.every((sitting, index) => {
    const now = after.sittings[index]
    return (
      now !== undefined &&
      (sitting.closedAt === null
        ? now.id === sitting.id && now.openedAt === sitting.openedAt
        : sameJson(now, sitting))
    )
  })
  const marks = (["ready", "released", "origins"] as const).every((key) =>
    (before[key] ?? []).every((mark, index) =>
      sameJson(mark, after[key]?.[index])
    )
  )
  return revisions && notes && takes && sittings && marks
}

/** What a store does with a save: refuse it, or put it and let some audio go. */
export type Admission =
  | { readonly ok: false }
  | { readonly ok: true; readonly letGo: ReadonlyArray<string> }

/**
 * Whether a store may put `after` in place of `kept` (null for a project not
 * kept yet): it only adds (`isAppendOnly`), and the only take it adds is
 * `adding`, the one whose audio comes in the same write. `letGo` names each
 * take it marks off the phone, whose audio leaves with it. The phone's store
 * and every fake of it decide by this one function.
 */
export function admitted(
  kept: Project | null,
  after: Project,
  adding: string | null = null
): Admission {
  if (kept !== null && !isAppendOnly(kept, after)) return { ok: false }
  const before = kept?.takes ?? []
  const added = after.takes.filter(
    (take) => !before.some((each) => each.id === take.id)
  )
  if (added.some((take) => take.id !== adding)) return { ok: false }
  return {
    ok: true,
    letGo: before
      .filter(
        (take) =>
          take.onPhone &&
          after.takes.find((each) => each.id === take.id)?.onPhone === false
      )
      .map((take) => take.id),
  }
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

/** `project` with its open sitting closed as `closing` says. */
function withClosed(
  project: Project,
  closing: NonNullable<ProjectState["closing"]>
): Project {
  const sitting = openSitting(project)
  if (sitting === null) return project
  const closed: Sitting = {
    ...sitting,
    closedAt: closing.at,
    done: closing.done,
    next: closing.next,
    shot: closing.shot,
  }
  return { ...project, sittings: [...project.sittings.slice(0, -1), closed] }
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

    case "noted":
    case "worded": {
      const note: Note =
        event.type === "noted"
          ? { ...event.note, status: "open" }
          : { ...event.note, author: "owner", status: "confirmed" }
      const revision = revisionOf(project, note.rev)
      if (revision === null) return refuse(state, "noRevision")
      if (shotIn(revision.cutList, note.shot) === null)
        return refuse(state, "noShot")
      if (project.notes.some((each) => each.id === note.id))
        return refuse(state, "duplicate")
      if (isReleased(project, note.rev)) return refuse(state, "released")
      return changed(state, { ...project, notes: [...project.notes, note] })
    }

    case "originSaid": {
      const { type: _, ...said } = event
      const refused = originRefusal(project, said.shot, said.idea)
      if (refused !== null) return refuse(state, refused)
      const mark: OriginMark = { ...said, rev: latest(project).rev }
      return changed(state, {
        ...project,
        origins: [...(project.origins ?? []), mark],
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
      const settled: Note =
        event.status === "declined"
          ? { ...note, status: event.status, reason }
          : { ...note, status: event.status }
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
      if (shotIn(latest(project).cutList, event.shot) === null)
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
      const withTake: Project = {
        ...project,
        takes: [...project.takes, { ...take, keptBy: [], onPhone: true }],
        chosen: { ...project.chosen, [take.shot]: take.id },
      }
      const next =
        state.closing === null ? withTake : withClosed(withTake, state.closing)
      return {
        state: { project: next, taking: null, closing: null },
        effects: [{ type: "keepTake", project: next, take: take.id }],
        refused: null,
      }
    }

    case "takeFailed": {
      if (state.taking === null) return refuse(state, "notTaking")
      const stopped = { ...state, taking: null, closing: null }
      return state.closing === null
        ? { state: stopped, effects: [], refused: null }
        : changed(stopped, withClosed(project, state.closing))
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
      // The store lets the audio go with this save, checking again there.
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
            shot: null,
          },
        ],
      })
    }

    case "sittingClosed": {
      if (openSitting(project) === null) return refuse(state, "noSitting")
      const closing = {
        at: event.at,
        done: event.done,
        next: event.next,
        shot: event.shot,
      }
      if (state.taking === null)
        return changed(state, withClosed(project, closing))
      // The take is finished and kept first; `taken` or `takeFailed` closes.
      return {
        state: { ...state, closing },
        effects: [{ type: "finishTake" }],
        refused: null,
      }
    }

    case "markedReady": {
      if (event.rev !== latest(project).rev) return refuse(state, "notLatest")
      const finish = finishOf(project)
      if (finish.kind === "ready" || finish.kind === "released")
        return refuse(state, "duplicate")
      if (finish.kind !== "unmarked") return refuse(state, "notReady")
      return changed(state, {
        ...project,
        ready: [...(project.ready ?? []), { rev: event.rev, at: event.at }],
      })
    }

    case "released": {
      const url = youtubeLink(event.url)
      if (url === null) return refuse(state, "noLink")
      if (isReleased(project, event.rev)) return refuse(state, "duplicate")
      // Ready as it is now, not only once marked: a note opened since counts.
      const finish = finishOf(project)
      if (finish.kind !== "ready" || finish.rev !== event.rev)
        return refuse(state, "notReady")
      return changed(state, {
        ...project,
        released: [
          ...(project.released ?? []),
          { rev: event.rev, at: event.at, url },
        ],
      })
    }

    default: {
      return assertNever(event)
    }
  }
}
