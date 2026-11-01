/**
 * The voice notes on their way home, as one store per page load (LA13): the
 * record (`./model`) kept in this device's storage, the copies' audio on a
 * shelf of their own, and the port `./home`'s exchange reads and answers
 * through. A copy is written before the record names it, and counts only
 * once that record is in storage: otherwise the copy goes and the note is
 * offered again while its own screen still has it. A copy goes once home
 * holds its note: the copy of a note home refused stays, since it may be
 * the only one. `sweep` clears a copy the record never named.
 *
 * The same record keeps the set-aside marks owed to home (`owe`, MIC2) and
 * hands the ones due to `lib/home-link/set-aside` (`marks`). A mark storage
 * would not keep is owed nowhere, and `owe` says so: Let go then sets
 * nothing aside (`lib/voice-marks`, LA13).
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import { openRecord, writeRecord } from "@some-ui/core-utils"
import { reportFailure, toIntentError } from "@some-ui/intent-kit"
import type { BlobShelf } from "@some-ui/voice-capture"
import { ShelfFullError } from "@some-ui/voice-capture"

import type { Encoded, VoiceHomePort } from "./home"
import type {
  AsidePort,
  CopyEnd,
  VoiceHomeEvent,
  VoiceHomeState,
  VoiceOut,
} from "./model"
import {
  INITIAL_VOICE_HOME,
  marksDue,
  parseVoiceHome,
  settled,
  stepVoiceHome,
} from "./model"

const STORAGE_KEY = "some-ui:voice-home"
const QUARANTINE_PREFIX = "some-ui:voice-home.unreadable."

export type VoiceHomePorts = {
  storage: KeyedStorage | null
  shelf: BlobShelf
  encode: (blob: Blob) => Promise<Encoded>
  /** When home's word is heard, noted as the take's "since" (MIC3). */
  now: () => number
}

export type VoiceHome = {
  getSnapshot: () => VoiceHomeState
  subscribe: (listener: () => void) => () => void
  /** `note` has nothing more to do here: copied, held or refused. */
  settled: (id: string) => boolean
  /**
   * Copies `note`'s audio for home, once, and says how that ended. A shelf
   * with no room leaves it `roomless`, and storage that won't keep the
   * record leaves it uncopied (`unkept`): either is tried again when the
   * note is offered again. Throws what the shelf throws but its lack of room.
   */
  copy: (note: VoiceOut, audio: Blob) => Promise<CopyEnd>
  /** What `./home`'s exchange reads and answers through. */
  keeping: VoiceHomePort
  /**
   * The owner set note `id` aside at `at` (ISO 8601): home is owed its mark,
   * once. A note already owed, answered or refused is left as it is, so the
   * first time stands. Says whether the record as storage keeps it now owes
   * the mark, has it answered, or needs none (home refused the note); a mark
   * storage would not keep is owed nowhere, not even in memory.
   */
  owe: (id: string, at: string, from: string) => boolean
  /**
   * Takes back a mark owed for a set-aside write that did not happen, or for
   * a note its store lists as current.
   */
  unowe: (id: string) => void
  /**
   * Forgets the marks owed for `ids`, notes listed nowhere they could be,
   * whose copy neither waits nor is held: they can never be taken.
   */
  forget: (ids: ReadonlyArray<string>) => void
  /** Drops the marks owed for `ids`, held or not (`ASIDE_OWED_MAX`). */
  drop: (ids: ReadonlyArray<string>) => void
  /** What `lib/home-link/set-aside`'s marks read and answer through. */
  marks: AsidePort
  /** Clears copies the record names neither waiting nor refused. Best effort. */
  sweep: () => void
}

/** `record` owes `id`'s mark, has it answered, or needs none (refused). */
function owes(record: VoiceHomeState, id: string): boolean {
  const { owed, answered } = record.aside
  return (
    answered.includes(id) ||
    owed.some((mark) => mark.id === id) ||
    record.refused.some((refusal) => refusal.id === id)
  )
}

export function createVoiceHome(ports: VoiceHomePorts): VoiceHome {
  const { storage, shelf } = ports
  const opened =
    storage === null
      ? null
      : openRecord(storage, STORAGE_KEY, parseVoiceHome, QUARANTINE_PREFIX)
  let state = opened?.kind === "kept" ? opened.value : INITIAL_VOICE_HOME
  // Storage that threw is written to by no one: the record stays in memory.
  const writable = storage !== null && opened?.kind !== "unreadable"
  // The record as storage last kept it; with none writable, nothing is.
  let stored = writable ? state : INITIAL_VOICE_HOME
  const listeners = new Set<() => void>()

  /**
   * Steps the record; false when the step could not be kept in storage. A
   * step that adds what must outlast the launch (a copy, a mark owed) is
   * taken only once storage kept it: refused, it is neither held in memory
   * nor told to anyone, so nothing listening can act on it or step again
   * in answer. A step that only takes away, or that records home's word,
   * is held in memory even when storage refused it: the next kept write
   * carries it, and until then the record only sends less.
   */
  const apply = (event: VoiceHomeEvent): boolean => {
    const next = stepVoiceHome(state, event)
    if (next === state) return true
    const kept =
      writable &&
      writeRecord(storage, STORAGE_KEY, JSON.stringify(next), parseVoiceHome)
    // A copy the record cannot name for good is no copy: a later launch
    // would sweep it while the person may have let the note go. A mark the
    // record cannot keep is owed nowhere, and Let go sets nothing aside.
    if (!kept && (event.kind === "copied" || event.kind === "aside")) {
      return false
    }
    state = next
    if (kept) stored = next
    for (const listener of listeners) listener()
    return kept
  }

  const copying = new Set<string>()

  return {
    getSnapshot: () => state,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    settled: (id) => settled(state, id),
    async copy(note, audio): Promise<CopyEnd> {
      // A copy under way is another caller's to say how it ended.
      if (settled(state, note.id) || copying.has(note.id)) return "copied"
      copying.add(note.id)
      try {
        await shelf.put(note.id, audio)
        if (apply({ kind: "copied", note })) return "copied"
        await shelf.remove([note.id])
        return "unkept"
      } catch (error) {
        if (!(error instanceof ShelfFullError)) throw error
        apply({ kind: "roomless", id: note.id })
        return "roomless"
      } finally {
        copying.delete(note.id)
      }
    },
    keeping: {
      state: () => state,
      audio: (id) => shelf.get(id),
      encode: ports.encode,
      answered(answer): void {
        apply(
          answer.kind === "held"
            ? { ...answer, at: new Date(ports.now()).toISOString() }
            : answer
        )
        if (answer.kind === "held") {
          // Ignored: a copy home holds is named by no record once this step
          // is kept, so the next `sweep` clears one that fails to go.
          shelf.remove([answer.id]).catch(() => undefined)
        }
      },
    },
    owe(id, at, from): boolean {
      // Refused, the step is taken nowhere: nothing to take back.
      apply({ kind: "aside", id, at, from })
      return owes(stored, id)
    },
    unowe(id): void {
      apply({ kind: "unowed", id })
    },
    forget(ids): void {
      if (ids.length > 0) apply({ kind: "gone", ids })
    },
    drop(ids): void {
      if (ids.length > 0) apply({ kind: "overflow", ids })
    },
    marks: {
      due: () => marksDue(state),
      answered(kind, id): void {
        apply({ kind, id })
      },
    },
    sweep(): void {
      shelf
        .ids()
        .then((ids) => {
          const named = new Set(
            [...state.waiting, ...state.refused].map(({ id }) => id)
          )
          return shelf.remove(
            ids.filter((id) => !named.has(id) && !copying.has(id))
          )
        })
        .catch((error: unknown) => {
          reportFailure({
            port: "voice copy sweep",
            error: toIntentError(error),
          })
        })
    },
  }
}
