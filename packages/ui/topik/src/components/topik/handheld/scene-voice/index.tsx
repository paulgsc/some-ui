/**
 * The scene, said aloud: tap to talk, tap to keep, as a reflection is. Each
 * take is a voice note in the open draft, let go one by one or all at once.
 */

import type { JSX } from "react"
import { useEffect, useState } from "react"
import { formatTimecode } from "@some-ui/core-utils"
import { Button } from "@some-ui/shared"
import type {
  SceneVoice,
  SceneVoiceSnapshot,
} from "@topik/lib/topik/adapter/scene-voice"
import { Mic, Square, X } from "lucide-react"

export const SceneVoiceNotes = ({
  voice,
  snapshot,
}: {
  voice: SceneVoice
  /** `voice`'s snapshot, read by the caller, which also shares the notes. */
  snapshot: SceneVoiceSnapshot
}): JSX.Element => {
  const [discarding, setDiscarding] = useState(false)
  useEffect(() => (): void => voice.leave(), [voice])
  const { notes, take, said, full } = snapshot
  const busy = take.kind === "opening" || take.kind === "keeping"
  // A take under way joins the notes once kept: none goes until it has.
  const settled = take.kind === "idle"
  return (
    <div data-slot="topik-scene-voice" className="flex flex-col gap-2">
      {take.kind === "recording" ? (
        <Button
          type="button"
          variant="destructive"
          className="h-12 w-full gap-2 rounded-2xl text-base"
          onClick={voice.stop}
        >
          <Square className="size-4" aria-hidden />
          Keep it ({formatTimecode(take.elapsedMs)})
        </Button>
      ) : (
        !full && (
          <Button
            type="button"
            className="h-12 w-full gap-2 rounded-2xl text-base"
            disabled={busy}
            onClick={voice.start}
          >
            <Mic className="size-4" aria-hidden />
            {take.kind === "opening"
              ? "Opening the microphone..."
              : take.kind === "keeping"
                ? "Keeping it..."
                : notes.length > 0
                  ? "Say more"
                  : "Describe it aloud"}
          </Button>
        )
      )}
      {said !== null && (
        <p role="status" className="text-muted-foreground text-sm">
          {said}
        </p>
      )}
      {notes.length > 0 && (
        <ul aria-label="Voice notes" className="flex flex-col gap-1">
          {notes.map((note, index) => (
            <li
              key={note.id}
              className="bg-card border-border flex items-center gap-2 rounded-xl border pl-3"
            >
              <Mic className="text-muted-foreground size-4" aria-hidden />
              <span className="min-w-0 flex-1 text-sm">
                Voice note {index + 1} · {formatTimecode(note.durationMs)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11"
                aria-label={`Let voice note ${index + 1} go`}
                disabled={!settled}
                onClick={() => voice.remove([note.id])}
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {notes.length > 0 &&
        (discarding ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="destructive"
              className="h-11 min-w-0 flex-1 rounded-xl"
              onClick={() => {
                voice.remove(notes.map(({ id }) => id))
                setDiscarding(false)
              }}
            >
              Let this scene go
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-11 min-w-0 flex-1 rounded-xl"
              onClick={() => setDiscarding(false)}
            >
              Keep it
            </Button>
          </div>
        ) : (
          <button
            type="button"
            disabled={!settled}
            onClick={() => setDiscarding(true)}
            className="text-muted-foreground min-h-11 self-start text-sm underline disabled:opacity-50"
          >
            Start a different scene
          </button>
        ))}
    </div>
  )
}
