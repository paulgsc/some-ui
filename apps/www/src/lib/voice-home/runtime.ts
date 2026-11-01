/**
 * The voice notes on their way home, as one store per page load (LA13): the
 * record (`./model`) kept in this device's storage, the copies' audio on a
 * shelf of their own, and the port `./home`'s exchange reads and answers
 * through. A copy is written before the record names it, and counts only
 * once that record is in storage: otherwise the copy goes and the note is
 * offered again while its own screen still has it. A copy goes once home
 * holds its note: the copy of a note home refused stays, since it may be
 * the only one. `sweep` clears a copy the record never named.
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import { openRecord, writeRecord } from "@some-ui/core-utils"
import { reportFailure, toIntentError } from "@some-ui/intent-kit"
import type { BlobShelf } from "@some-ui/voice-capture"
import { ShelfFullError } from "@some-ui/voice-capture"

import type { Encoded, VoiceHomePort } from "./home"
import type { CopyEnd, VoiceHomeEvent, VoiceHomeState, VoiceOut } from "./model"
import {
  INITIAL_VOICE_HOME,
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
  /** Clears copies the record names neither waiting nor refused. Best effort. */
  sweep: () => void
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
  const listeners = new Set<() => void>()

  /** Steps the record; false when the step could not be kept in storage. */
  const apply = (event: VoiceHomeEvent): boolean => {
    const next = stepVoiceHome(state, event)
    if (next === state) return true
    const kept =
      writable &&
      writeRecord(storage, STORAGE_KEY, JSON.stringify(next), parseVoiceHome)
    // A copy the record cannot name for good is no copy: a later launch
    // would sweep it while the person may have let the note go.
    if (!kept && event.kind === "copied") return false
    state = next
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
