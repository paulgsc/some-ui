/**
 * A voice reflection: tap to talk, tap to keep. Device build only, like this
 * module (`build.paths.ts`): render it behind an inline
 * `import.meta.env.VITE_DEVICE_BACKEND === "true"`. The take is
 * `lib/reflection-voice`'s; this only renders its state and forwards taps.
 */
import type { JSX } from "react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { Button } from "@some-ui/shared"
import type { RecordingFailure } from "@some-ui/voice-capture"
import { Mic, Square } from "lucide-react"

import { formatTimecode } from "@/lib/format"
import type { Outcome, VoiceState } from "@/lib/reflection-voice"
import { phoneVoiceNote } from "@/lib/reflection-voice"

const BLOCKED: Record<RecordingFailure, string> = {
  denied:
    "The microphone is off for Some UI. Turn it on under Android Settings → Apps → Some UI → Permissions → Microphone.",
  busy: "Another app is using the microphone.",
  unsupported: "This phone's web view can't record audio.",
  failed: "The microphone didn't start.",
}

const SAID: Record<Outcome, string> = {
  kept: "Kept.",
  short: "Too short to keep. Tap, talk, then tap again.",
  full: "No room for it: share or let some go first.",
  failed: "Couldn't keep that one. Try again.",
}

function note(state: VoiceState): string | null {
  if (state.kind === "blocked") return BLOCKED[state.reason]
  if (state.kind === "idle" && state.last !== null) return SAID[state.last]
  return null
}

export const DeviceReflectionVoice = ({
  sessionId,
  atMs,
}: {
  sessionId: string
  /** How far into the session now, or null after it ended. */
  atMs: number | null
}): JSX.Element => {
  // One take runtime per mount; the parent keys this by session.
  // eslint-disable-next-line owner-guard/no-mount-snapshot -- a runtime made once per mount, keyed by `sessionId` where it is rendered
  const [voice] = useState(() => phoneVoiceNote(sessionId))
  const state = useSyncExternalStore(voice.subscribe, voice.getSnapshot)
  // Closing the sheet or leaving the session keeps what was said.
  useEffect(() => (): void => voice.leave(), [voice])

  const said = note(state)
  const busy =
    state.kind === "opening" ||
    state.kind === "finishing" ||
    state.kind === "saving"

  return (
    <div className="flex flex-col gap-1.5">
      {state.kind === "recording" ? (
        <Button
          type="button"
          variant="destructive"
          className="h-12 w-full gap-2 text-base"
          onClick={voice.stop}
        >
          <Square className="size-4" aria-hidden />
          Keep it ({formatTimecode(state.elapsedMs)})
        </Button>
      ) : (
        <Button
          type="button"
          className="h-12 w-full gap-2 text-base"
          disabled={busy}
          onClick={() => voice.start(atMs)}
        >
          <Mic className="size-4" aria-hidden />
          {state.kind === "opening"
            ? "Opening the microphone..."
            : busy
              ? "Keeping it..."
              : "Talk"}
        </Button>
      )}
      {said !== null && (
        <p role="status" className="text-muted-foreground text-sm">
          {said}
        </p>
      )}
    </div>
  )
}
