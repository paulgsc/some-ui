/**
 * The scene, said aloud, on the take pattern's parts: tap to talk, tap to
 * keep, then each note's row with where it is kept, Play, Redo and Let it go.
 * The draft holds up to five notes beside each other (the phone's options).
 * Its one divergence is "Start a different scene", which sets every note in
 * the draft aside at once, as Let go sets one aside (D3): kept, so it asks
 * nothing first. While the phone keeps as many notes as it can, nothing
 * records, the line says what makes room, and the notes still play.
 */

import type { JSX } from "react"
import { useEffect } from "react"
import { TakeList, useTakePattern } from "@some-ui/shared"
import type {
  SceneVoice,
  SceneVoiceSnapshot,
} from "@topik/lib/topik/adapter/scene-voice"

export const SceneVoiceNotes = ({
  voice,
  snapshot,
}: {
  voice: SceneVoice
  /** `voice`'s snapshot, read by the caller, which also shares the notes. */
  snapshot: SceneVoiceSnapshot
}): JSX.Element => {
  const { pattern, answers } = voice
  useEffect(() => (): void => pattern.leave(), [pattern])
  const taken = useTakePattern(pattern)
  const settled = taken.take.kind === "idle"
  const full = snapshot.full && settled
  return (
    <div data-slot="topik-scene-voice" className="flex flex-col gap-2">
      <TakeList
        pattern={pattern}
        answers={answers}
        takes={snapshot.takes}
        label="Voice notes"
        full={
          full
            ? "This phone has kept as many voice notes as it can. One you let go makes room once a home it's paired with has it."
            : undefined
        }
      />
      {snapshot.notes.length > 0 && (
        <button
          type="button"
          disabled={!settled}
          onClick={voice.letGoScene}
          className="text-muted-foreground min-h-11 self-start text-sm underline disabled:opacity-50"
        >
          Start a different scene
        </button>
      )}
    </div>
  )
}
