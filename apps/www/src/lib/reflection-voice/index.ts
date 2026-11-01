/**
 * Voice reflections on the phone: a session's takes on the take pattern
 * (`./runtime`) on the phone's microphone, their audio on a shelf of its own,
 * where each is kept (`reflectionNotesKept`), and letting reflections go with
 * their audio. Phone-only (`build.paths.ts`).
 */
import { reportFailure, toIntentError } from "@some-ui/intent-kit"
import { SOUNDBITE_BITS_PER_SECOND } from "@some-ui/soundbites/contract"
import type { StartRecording, TakeKept } from "@some-ui/voice-capture"
import { micRecorder, ON_PHONE, savingShelf } from "@some-ui/voice-capture"

import { reflections } from "@/lib/session-reflection"
import { setAsideOwing } from "@/lib/voice-marks"

import { REFLECTION_AUDIO_MAX_BYTES } from "./budget"
import type { ReflectionTakes } from "./runtime"
import { createVoiceNote } from "./runtime"

export type { ReflectionTakes } from "./runtime"

const shelf = savingShelf({
  dbName: "some-ui.reflection-audio",
  maxBytes: REFLECTION_AUDIO_MAX_BYTES,
})

/** Whether `id`'s audio is still being written: not ready to share. */
export const isSaving = shelf.isSaving

const settledListeners = new Set<() => void>()

/**
 * Tells `listener` each time a take's audio is written, or given up on: the
 * reflection itself is kept before its audio, so its list says nothing then.
 */
export function onAudioSettled(listener: () => void): () => void {
  settledListeners.add(listener)
  return (): void => {
    settledListeners.delete(listener)
  }
}

function saving(id: string, writing: boolean): void {
  shelf.saving(id, writing)
  if (!writing) for (const listener of settledListeners) listener()
}

export const reflectionAudio = shelf.shelf

// On this phone until the voice lane says otherwise.
let where: (id: string) => TakeKept = () => ON_PHONE
const keptListeners = new Set<() => void>()

/**
 * Where each spoken reflection is kept, from the voice lane
 * (`lib/home-link/voice-copy`, MIC3): what each row says.
 */
export function reflectionNotesKept(next: (id: string) => TakeKept): void {
  where = next
  for (const listener of keptListeners) listener()
}

/**
 * One screen's takes of session `sessionId`: made once per mount, on the
 * phone's microphone unless a test gives its own.
 */
export function phoneVoiceNote(
  sessionId: string,
  startRecording: StartRecording = micRecorder({
    bitsPerSecond: SOUNDBITE_BITS_PER_SECOND,
  })
): ReflectionTakes {
  return createVoiceNote(
    {
      startRecording,
      audio: reflectionAudio(),
      read: () => reflections.getSnapshot().kept,
      subscribe: (listener) => {
        keptListeners.add(listener)
        const stop = reflections.subscribe(listener)
        return (): void => {
          keptListeners.delete(listener)
          stop()
        }
      },
      keep: (reflection) => reflections.keep(reflection),
      supersede: (id) => reflections.standAside(id, "earlier"),
      // LA13: set aside only once its mark is owed (`lib/voice-marks`).
      setAside: (id) => {
        const at = new Date().toISOString()
        return setAsideOwing(id, at, () =>
          reflections.standAside(id, "set-aside", at)
        )
      },
      letGo: (ids) => reflections.letGo(ids),
      saving,
      now: () => Date.now(),
      newId: () => crypto.randomUUID(),
      kept: (id) => where(id),
    },
    sessionId
  )
}

/**
 * Lets these go, and their audio with them; false, keeping both, if the list
 * would not store the removal. Audio that fails to go is left for
 * `sweepOrphans`: once its reflection is gone, nothing names it.
 */
export function letGoReflections(ids: ReadonlyArray<string>): boolean {
  if (!reflections.letGo(ids)) return false
  reflectionAudio()
    .remove(ids)
    // Ignored: audio that fails to go is left for `sweepOrphans` (above).
    .catch(() => undefined)
  return true
}

/**
 * Each half without the other, cleared so the shelf and the list agree:
 * audio no reflection names (the app closed between the two removals), and a
 * voice reflection whose audio never landed (its save failed, and so did
 * taking it back out). Best effort, and nothing waits on it.
 */
export function sweepOrphans(): void {
  const audio = reflectionAudio()
  audio
    .ids()
    .then(async (ids) => {
      // Read after the ids: a reflection kept meanwhile names its audio.
      const { kept } = reflections.getSnapshot()
      const named = new Set(kept.map((r) => r.id))
      const stored = new Set(ids)
      await audio.remove(ids.filter((id) => !named.has(id)))
      // Saving now, or saved since the ids were read: not silent. A save
      // starts with its reflection kept, so one in `kept` is past that.
      const silent: Array<string> = []
      for (const r of kept) {
        if (r.body.kind !== "voice" || stored.has(r.id) || isSaving(r.id))
          continue
        if ((await audio.get(r.id)) === null) silent.push(r.id)
      }
      if (silent.length > 0) reflections.letGo(silent)
    })
    .catch((error: unknown) => {
      reportFailure({
        port: "reflection voice sweep",
        error: toIntentError(error),
      })
    })
}
