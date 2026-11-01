/**
 * Topik's `SceneVoice` port on the take pattern (`@some-ui/voice-capture`'s
 * `takePattern`): each kept take a note of the draft, its audio on a shelf
 * and its entry in a list, with when it was kept (`at`), which home is told
 * it by (LA13), whether an ask home holds carried it (`prompted`, LA18), and
 * where it stands in the draft (`standing`).
 *
 * - **Up to `SCENE_NOTES_MAX` notes in the draft**, beside each other, each
 *   played on its own. Redo makes the new note the draft's and keeps the one
 *   it supersedes, out of the draft (D2); Let go sets a note aside, kept
 *   (D3), and the scene's Let go sets every note in the draft aside at once.
 *   An ask names only the draft's notes.
 * - **Nothing the person does removes a note** (#2265, MIC5). A note leaves
 *   this phone only on home's word (LG1, `letGo`): once home holds it and
 *   holds the ask that carried it, or once home holds it and it is out of the
 *   draft. Until then it counts toward the phone's `SCENE_NOTES_KEPT`; past
 *   them a new note makes room by letting go the oldest of those home holds
 *   that `letGo` would let go, and is refused while there is none (`full`).
 * - **Where each note is kept**, and since when, is read from the voice
 *   lane (`kept`, MIC3).
 */
import {
  SOUNDBITE_MAX_MS,
  SOUNDBITE_MIN_MS,
} from "@some-ui/soundbites/contract"
import type { SceneNote, SceneVoice, SceneVoiceSnapshot } from "@some-ui/topik"
import type {
  BlobShelf,
  MicOwner,
  PatternTake,
  Player,
  StartRecording,
  TakeDeadlines,
  TakeKept,
  TakePatternOptions,
} from "@some-ui/voice-capture"
import { ONE_TAKE, shelveTake, takePattern } from "@some-ui/voice-capture"

import { homeHolds, makesRoom } from "@/lib/takes-desk/runtime"

import { SCENE_NOTES_KEPT, SCENE_NOTES_MAX } from "./budget"

/**
 * A note as the phone keeps it: topik's, when it was kept (ISO 8601; a note
 * kept before the phone noted that has none), whether an ask home holds
 * carried it, and, once out of the draft, why: a Redo superseded it (D2) or
 * it was set aside (D3).
 */
export type KeptSceneNote = SceneNote & {
  readonly at?: string
  readonly prompted?: boolean
  readonly standing?: "earlier" | "set-aside"
}

/** Topik's port, and what the voice lane and the drain tell it. */
export type PhoneSceneVoice = SceneVoice & {
  /** An ask home holds carried these notes (`lib/home-link/going`, LA18). */
  prompted: (ids: ReadonlyArray<string>) => void
  /** Where notes are kept has changed: each row says it again. */
  recount: () => void
  /**
   * Lets these notes go, with their audio: the sweep's, for a note whose
   * audio never landed.
   */
  remove: (ids: ReadonlyArray<string>) => boolean
}

/** What every note of the draft answers: the ref home is told it by. */
export const NEXT_SCENE = "next-scene"

/** The scene's choice of the pattern's options. */
const SCENE_OPTIONS: TakePatternOptions = {
  ...ONE_TAKE,
  takes: { per: "many", max: SCENE_NOTES_MAX },
  limits: { minMs: SOUNDBITE_MIN_MS, maxMs: SOUNDBITE_MAX_MS },
}

export type SceneVoicePorts = {
  startRecording: StartRecording
  audio: BlobShelf
  /** The draft's notes, oldest first. */
  notes: {
    read: () => Array<KeptSceneNote>
    /**
     * Lists `note`, and marks the note it supersedes out of the draft, in
     * one write. Says whether the device stored it.
     */
    add: (note: KeptSceneNote, supersedes: string | null) => boolean
    remove: (ids: ReadonlyArray<string>) => boolean
    /** Marks these notes carried by an ask home holds; says whether it stored. */
    prompted: (ids: ReadonlyArray<string>) => boolean
    /** Marks these notes set aside, keeping them; says whether it stored. */
    setAside: (ids: ReadonlyArray<string>) => boolean
  }
  /** A note whose audio is being written, and when done. */
  saving: (id: string, inFlight: boolean) => void
  now: () => number
  newId: () => string
  /** Where this note is kept, from what home told this phone (`lib/home-link`). */
  kept: (id: string) => TakeKept
  /** The kit's `audioPlayer` unless a test gives its own. */
  player?: Player | undefined
  /** The phone's one microphone unless a test gives its own. */
  owner?: MicOwner | undefined
  /** The microphone's deadlines unless a test gives its own. */
  deadlines?: TakeDeadlines | undefined
}

const inDraft = (note: KeptSceneNote): boolean => note.standing === undefined

export function createSceneVoice(ports: SceneVoicePorts): PhoneSceneVoice {
  const listeners = new Set<() => void>()

  const listed = (
    notes: ReadonlyArray<KeptSceneNote>
  ): ReadonlyArray<PatternTake> =>
    notes.map(
      (note): PatternTake => ({
        id: note.id,
        answers: NEXT_SCENE,
        durationMs: note.durationMs,
        // A note kept before the phone noted when sorts as the oldest.
        recordedAt: note.at ?? new Date(0).toISOString(),
        standing: note.standing ?? "current",
        kept: ports.kept(note.id),
      })
    )

  /** A note home holds may leave the phone once out of the draft, or asked with. */
  const leaves = (note: KeptSceneNote): boolean =>
    note.prompted === true || !inDraft(note)
  /** The note a new one makes room by letting go at the phone's cap, if any. */
  const roomFor = (): KeptSceneNote | null => {
    const notes = ports.notes.read()
    return makesRoom(
      notes,
      SCENE_NOTES_KEPT,
      (id) =>
        notes.some((note) => note.id === id && leaves(note)) &&
        homeHolds(ports.kept(id)),
      (note) => Date.parse(note.at ?? new Date(0).toISOString())
    )
  }
  const full = (): boolean =>
    ports.notes.read().length >= SCENE_NOTES_KEPT && roomFor() === null

  const pattern = takePattern(
    {
      startRecording: ports.startRecording,
      now: ports.now,
      owner: ports.owner,
      deadlines: ports.deadlines,
      player: ports.player,
      // `sweepSceneVoice` clears what a failed listing leaves.
      keep: (take, _answers, supersedes, done) => {
        if (full()) {
          done({ outcome: "full" })
          return
        }
        // RM1: a room not made keeps nothing, so the list never drops a
        // note at its cap to fit this one.
        const room = roomFor()
        if (room !== null && !remove([room.id])) {
          done({ outcome: "failed" })
          return
        }
        const id = ports.newId()
        const entry: KeptSceneNote = {
          id,
          durationMs: Math.round(take.durationMs),
          mimeType: take.mimeType,
          at: new Date(ports.now()).toISOString(),
        }
        shelveTake(
          ports,
          id,
          take,
          () => {
            const kept = ports.notes.add(entry, supersedes)
            if (kept) publish()
            return kept
          },
          (outcome) =>
            done(
              outcome === "kept"
                ? { outcome, id }
                : { outcome: outcome === "full" ? "full" : "failed" }
            )
        )
      },
      setAside: (id) => {
        if (ports.notes.setAside([id])) publish()
      },
      audio: (id) => ports.audio.get(id),
    },
    SCENE_OPTIONS
  )

  const snapshotOf = (): SceneVoiceSnapshot => {
    const notes = ports.notes.read()
    return {
      notes: notes
        .filter(inDraft)
        .map(({ id, durationMs, mimeType }) => ({ id, durationMs, mimeType })),
      takes: listed(notes),
      taking: pattern.getSnapshot().take.kind !== "idle",
      full: full(),
    }
  }
  let snapshot = snapshotOf()
  const publish = (): void => {
    snapshot = snapshotOf()
    for (const listener of listeners) listener()
  }
  pattern.subscribe(() => {
    if (snapshot.taking !== (pattern.getSnapshot().take.kind !== "idle")) {
      publish()
    }
  })

  /** Lets these notes go, with their audio; says whether the list stored it. */
  const remove = (ids: ReadonlyArray<string>): boolean => {
    if (ids.length === 0) return true
    if (!ports.notes.remove(ids)) return false
    // Ignored: audio no note names is cleared by the next sweep
    // (`sweepSceneVoice`).
    ports.audio.remove(ids).catch(() => undefined)
    publish()
    return true
  }

  return {
    pattern,
    answers: NEXT_SCENE,
    getSnapshot: () => snapshot,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    letGoScene(): void {
      for (const note of ports.notes.read().filter(inDraft)) {
        pattern.letGo(note.id, ports.kept(note.id).place)
      }
    },
    letGo(homeHolds): void {
      remove(
        ports.notes
          .read()
          .filter(
            (note) =>
              homeHolds.has(note.id) &&
              (note.prompted === true || !inDraft(note))
          )
          .map(({ id }) => id)
      )
    },
    prompted(ids): void {
      if (ids.length > 0 && ports.notes.prompted(ids)) publish()
    },
    recount: publish,
    remove,
  }
}

/**
 * **SV1: the sweep lets go only a note whose audio never landed.**
 * The list is read before the shelf's ids: a note is listed only once its
 * audio is written (`shelveTake`), so every note listed then whose id the
 * shelf lacks is silent, and one that lands while the ids are read is
 * neither listed in that read nor counted silent. Audio is removed only when
 * the list read after the ids names no note for it and it is not being
 * written.
 */
export async function sweepNotes(ports: {
  readonly notes: Pick<SceneVoicePorts["notes"], "read">
  readonly audio: BlobShelf
  readonly isSaving: (id: string) => boolean
  /** Lets these notes go, through the runtime. */
  readonly remove: (ids: ReadonlyArray<string>) => void
}): Promise<void> {
  const listed = ports.notes.read().map(({ id }) => id)
  const stored = await ports.audio.ids()
  const silent = listed.filter((id) => !stored.includes(id))
  if (silent.length > 0) ports.remove(silent)
  const named = ports.notes.read().map(({ id }) => id)
  await ports.audio.remove(
    stored.filter((id) => !named.includes(id) && !ports.isSaving(id))
  )
}
