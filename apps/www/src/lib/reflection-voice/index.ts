/**
 * Voice reflections on the phone: a take (`./runtime`) on the phone's
 * microphone, its audio on a shelf of its own, and letting reflections go
 * with their audio. Phone-only (`build.paths.ts`).
 */
import { SOUNDBITE_BITS_PER_SECOND } from "@some-ui/soundbites/contract"
import type { BlobShelf } from "@some-ui/voice-capture"
import { blobShelf, micRecorder } from "@some-ui/voice-capture"

import { reflections } from "@/lib/session-reflection"

import { REFLECTION_AUDIO_MAX_BYTES } from "./budget"
import type { VoiceRuntime } from "./runtime"
import { createVoiceNote } from "./runtime"

export type { Outcome, VoiceState } from "./machine"
export type { VoiceRuntime } from "./runtime"

let shelf: BlobShelf | null = null
/** Kept voice reflections whose audio is still being written. */
const saving = new Set<string>()

/** Whether `id`'s audio is still being written: not ready to share. */
export function isSaving(id: string): boolean {
  return saving.has(id)
}

/** One shelf per page load, so its database opens once. */
export function reflectionAudio(): BlobShelf {
  shelf ??= blobShelf({
    dbName: "some-ui.reflection-audio",
    maxBytes: REFLECTION_AUDIO_MAX_BYTES,
  })
  return shelf
}

export function phoneVoiceNote(sessionId: string): VoiceRuntime {
  return createVoiceNote(
    {
      startRecording: micRecorder({ bitsPerSecond: SOUNDBITE_BITS_PER_SECOND }),
      audio: reflectionAudio(),
      keep: (reflection) => reflections.keep(reflection),
      letGo: (ids) => reflections.letGo(ids),
      saving: (id, inFlight) => {
        if (inFlight) saving.add(id)
        else saving.delete(id)
      },
      now: () => Date.now(),
      newId: () => crypto.randomUUID(),
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
    .catch(() => undefined)
}
