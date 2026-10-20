/**
 * A voice reflection: tap to talk, tap to keep. Device build only, like this
 * module (`build.paths.ts`). The take is `lib/reflection-voice`'s; this only
 * renders its state and forwards taps.
 */
import type { JSX } from "react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { formatTimecode } from "@some-ui/core-utils"
import { Button } from "@some-ui/shared"
import type { VoiceNoteOutcome, VoiceNoteState } from "@some-ui/voice-capture"
import { RECORDING_FAILURE_COPY, VOICE_NOTE_SAID } from "@some-ui/voice-capture"
import { Mic, Square } from "lucide-react"

import { phoneVoiceNote } from "@/lib/reflection-voice"
import { NO_ROOM } from "@/lib/session-reflection"

const SAID: Record<VoiceNoteOutcome, string> = {
  ...VOICE_NOTE_SAID,
  full: NO_ROOM,
}

function note(state: VoiceNoteState): string | null {
  if (state.kind === "blocked") return RECORDING_FAILURE_COPY[state.reason]
  if (state.kind === "idle" && state.last !== null) return SAID[state.last]
  return null
}

/**
 * Stays mounted while the panel switches to its full state, so a take under
 * way when the last slot goes still ends where the person can see it.
 */
export const DeviceReflectionVoice = ({
  sessionId,
  atMs,
  full,
}: {
  sessionId: string
  /** How far into the session now, or null after it ended. */
  atMs: number | null
  /** Every slot is taken: a new take cannot start. */
  full: boolean
}): JSX.Element | null => {
  // eslint-disable-next-line owner-guard/no-mount-snapshot -- a runtime made once per mount, keyed by `sessionId` where it is rendered
  const [voice] = useState(() => phoneVoiceNote(sessionId))
  const state = useSyncExternalStore(voice.subscribe, voice.getSnapshot)
  useEffect(() => (): void => voice.leave(), [voice])

  const said = note(state)
  const phase = state.kind === "taking" ? state.phase : null
  const busy =
    state.kind === "saving" || (phase !== null && phase.kind !== "recording")
  if (full && state.kind === "idle" && said === null) return null

  return (
    <div className="flex flex-col gap-1.5">
      {phase?.kind === "recording" ? (
        <Button
          type="button"
          variant="destructive"
          className="h-12 w-full gap-2 text-base"
          onClick={voice.stop}
        >
          <Square className="size-4" aria-hidden />
          Keep it ({formatTimecode(phase.elapsed)})
        </Button>
      ) : (
        !full && (
          <Button
            type="button"
            className="h-12 w-full gap-2 text-base"
            disabled={busy}
            onClick={() => voice.start(atMs)}
          >
            <Mic className="size-4" aria-hidden />
            {phase?.kind === "opening"
              ? "Opening the microphone..."
              : busy
                ? "Keeping it..."
                : "Talk"}
          </Button>
        )
      )}
      {said !== null && (
        <p role="status" className="text-muted-foreground text-sm">
          {said}
        </p>
      )}
    </div>
  )
}
