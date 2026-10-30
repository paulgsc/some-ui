/**
 * A revision back from Claude (STUDIO ST8): the project file a session
 * writes after a round, merged into the copy on the phone. Revisions are
 * append-only, so a merge only adds: the file's revisions past the phone's
 * latest, its new notes, and each kept note's status where the session
 * settled it (applied, or declined with its reason). Takes, the chosen
 * take per scene, the sitting log and Finish's marks are the phone's own
 * record, and the file can't change them; the session writes text only.
 *
 * **When the phone made a version after sharing** (a take kept, a Shape
 * kept; #2317), the session's revisions are rebased onto the phone's: each
 * is replayed, in order, onto the phone's latest cut list and numbered after
 * it. A replay is a three-way merge against the revision the session built
 * on, field by field, for the video and for each scene: a field only one
 * side changed takes that side's value, and a field both changed keeps the
 * phone's, since what the owner did here (a take fitted, a plan chosen) is
 * the owner's own work. Each scene that kept the phone's value is named, and
 * a note the session settled as applied on that scene stays as the phone
 * has it, so the next round picks it up again. Nothing is lost: the
 * session's file is where it was picked from, and the phone's revisions
 * stay as they were.
 *
 * Refused (`moved`) only where no field-by-field answer exists: both sides
 * changed which scenes the video has, or one side removed a scene the other
 * changed, or the file shares no first version with the phone.
 */
import { CutListSchema } from "@some-ui/video-render"

import type { CutListShape, Note, Project, Revision } from "./model"
import { isAppendOnly, latest, reaches, sameJson } from "./model"

/** Where a merge kept the phone's value over the session's: a scene, or the video's own settings. */
export type Clash = { readonly shot: string | null }

/** What a project file brings to the copy on the phone. */
export type Merged =
  | {
      readonly kind: "merged"
      readonly project: Project
      /** Where both sides changed the same thing, so the phone's stayed. */
      readonly clashes: ReadonlyArray<Clash>
    }
  /** Nothing the phone doesn't hold already. */
  | { readonly kind: "same" }
  /** Everything the file changes, the phone changed too, and the phone's stayed. */
  | { readonly kind: "kept"; readonly clashes: ReadonlyArray<Clash> }
  /**
   * The phone's copy moved on after the file was shared in a way the file's
   * versions can't be replayed onto (`mergeIn`'s header).
   */
  | { readonly kind: "moved" }

const ShapeSchema = CutListSchema.omit({ revisions: true, notes: true })

/** The same revision, wherever it is numbered: who made it, when, and why. */
const sameCommit = (a: Revision, b: Revision): boolean =>
  a.author === b.author && a.at === b.at && a.message === b.message

/** `kept` with what `file` adds; both are the same video (`id`). */
export function mergeIn(kept: Project, file: Project): Merged {
  let base = 0
  while (
    base < kept.revisions.length &&
    base < file.revisions.length &&
    sameJson(kept.revisions[base], file.revisions[base])
  )
    base += 1
  if (base === 0) return { kind: "moved" }
  const onto = rebase(kept, file, base)
  if (onto === null) return { kind: "moved" }
  const { revisions, renumber, clashes } = onto
  const clashed = new Set(clashes.map((each) => each.shot))
  const settled = kept.notes.map((note): Note => {
    const there = file.notes.find((each) => each.id === note.id)
    if (there === undefined || !reaches(note.status, there.status)) return note
    // A change that didn't come in hasn't applied the note.
    if (there.status === "applied" && clashed.has(note.shot)) return note
    // A reason may be given once; after that it stays as written.
    const reason = note.reason ?? there.reason
    return reason === undefined
      ? { ...note, status: there.status }
      : { ...note, status: there.status, reason }
  })
  const added = file.notes
    .filter((note) => !kept.notes.some((each) => each.id === note.id))
    .map((note): Note => ({ ...note, rev: renumber(note.rev) }))
  const merged: Project = {
    ...kept,
    revisions: [...kept.revisions, ...revisions],
    notes: [...settled, ...added],
  }
  if (sameJson(merged, kept))
    return clashes.length > 0 ? { kind: "kept", clashes } : { kind: "same" }
  return isAppendOnly(kept, merged)
    ? { kind: "merged", project: merged, clashes }
    : { kind: "moved" }
}

type Rebased = {
  /** The session's revisions as they follow the phone's latest. */
  readonly revisions: ReadonlyArray<Revision>
  /** A revision number in the file, as it reads on the phone. */
  readonly renumber: (rev: number) => number
  readonly clashes: ReadonlyArray<Clash>
}

/**
 * The file's revisions past `base`, replayed onto `kept`'s latest; those
 * already in `kept` (a file merged before) are found there, not added
 * again. Null when one can't be replayed.
 */
function rebase(kept: Project, file: Project, base: number): Rebased | null {
  const numbers = new Map<number, number>()
  const revisions: Array<Revision> = []
  const clashes: Array<Clash> = []
  let ours = latest(kept).cutList
  let next = latest(kept).rev + 1
  let theirsBefore = file.revisions[base - 1]?.cutList
  if (theirsBefore === undefined) return null
  for (const theirs of file.revisions.slice(base)) {
    const before = theirsBefore
    theirsBefore = theirs.cutList
    const there = kept.revisions.find((each) => sameCommit(each, theirs))
    if (there !== undefined) {
      numbers.set(theirs.rev, there.rev)
      continue
    }
    const replayed = replay(before, ours, theirs.cutList)
    if (replayed === null) return null
    for (const clash of replayed.clashes) {
      if (!clashes.some((each) => each.shot === clash.shot)) clashes.push(clash)
    }
    if (!sameJson(theirs.cutList, before) && sameJson(replayed.cutList, ours)) {
      // Everything it changed, the phone had changed too.
      numbers.set(theirs.rev, next - 1)
      continue
    }
    const revision: Revision = {
      ...theirs,
      rev: next,
      cutList: replayed.cutList,
    }
    revisions.push(revision)
    numbers.set(theirs.rev, next)
    ours = replayed.cutList
    next += 1
  }
  return {
    revisions,
    renumber: (rev) => (rev <= base ? rev : (numbers.get(rev) ?? rev)),
    clashes,
  }
}

/** `theirs`' changes from `before`, applied to `ours`. Null when they can't be. */
function replay(
  before: CutListShape,
  ours: CutListShape,
  theirs: CutListShape
): { readonly cutList: CutListShape; readonly clashes: Array<Clash> } | null {
  // Built on the phone's own latest: nothing to replay, only to add.
  if (sameJson(before, ours)) return { cutList: theirs, clashes: [] }
  const clashes: Array<Clash> = []
  const video = merge3(
    { ...before, shots: null },
    { ...ours, shots: null },
    { ...theirs, shots: null }
  )
  if (video.clashed) clashes.push({ shot: null })
  const order = orderOf(before, ours, theirs)
  if (order === null) return null
  const shots: Array<unknown> = []
  for (const id of order) {
    const b = before.shots.find((each) => each.id === id)
    const o = ours.shots.find((each) => each.id === id)
    const t = theirs.shots.find((each) => each.id === id)
    if (o === undefined || t === undefined) {
      // Removed on one side: fine only where the other left it as it was.
      const kept = o ?? t
      if (b === undefined || !sameJson(b, kept)) return null
      continue
    }
    const shot = merge3(b ?? o, o, t)
    if (shot.clashed) clashes.push({ shot: id })
    shots.push(shot.value)
  }
  const parsed = ShapeSchema.safeParse({ ...video.value, shots })
  return parsed.success ? { cutList: parsed.data, clashes } : null
}

const idsOf = (shape: CutListShape): Array<string> =>
  shape.shots.map((each) => each.id)

/**
 * Which scenes the result has, in order: the side that changed them, and
 * every scene either side has, so a removal is checked scene by scene.
 * Null when both sides changed them differently.
 */
function orderOf(
  before: CutListShape,
  ours: CutListShape,
  theirs: CutListShape
): ReadonlyArray<string> | null {
  const was = idsOf(before)
  const o = idsOf(ours)
  const t = idsOf(theirs)
  if (sameJson(o, t)) return o
  if (sameJson(o, was)) return [...t, ...o.filter((id) => !t.includes(id))]
  if (sameJson(t, was)) return [...o, ...t.filter((id) => !o.includes(id))]
  return null
}

/** Each field of `ours` and `theirs` against `base`: one side's change, or ours where both changed it. */
function merge3(
  base: object,
  ours: object,
  theirs: object
): { readonly value: Record<string, unknown>; readonly clashed: boolean } {
  const b = new Map(Object.entries(base))
  const o = new Map(Object.entries(ours))
  const t = new Map(Object.entries(theirs))
  const value: Record<string, unknown> = {}
  let clashed = false
  for (const key of new Set([...b.keys(), ...o.keys(), ...t.keys()])) {
    const was = b.get(key)
    const mine = o.get(key)
    const theirsNow = t.get(key)
    let chosen = mine
    if (sameJson(mine, was)) chosen = theirsNow
    else if (!sameJson(theirsNow, was) && !sameJson(theirsNow, mine))
      clashed = true
    if (chosen !== undefined) value[key] = chosen
  }
  return { value, clashed }
}
