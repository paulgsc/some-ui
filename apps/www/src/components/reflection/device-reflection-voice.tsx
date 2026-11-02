/**
 * Spoken reflections on the take pattern's parts: tap to talk, tap to keep,
 * then each one's row with where it is kept, Play, Redo and Let it go. Up to
 * twenty a session, beside each other (`REFLECTION_TAKE_OPTIONS`). Device
 * build only, like this module (`build.paths.ts`). The takes are
 * `lib/reflection-voice`'s; this only renders them and forwards taps.
 */
import type { JSX } from "react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { TakeItem, useTakePattern } from "@some-ui/shared"
import { takeItemView } from "@some-ui/voice-capture"

import type { ReflectionTakes } from "@/lib/reflection-voice"
import { phoneVoiceNote } from "@/lib/reflection-voice"
import { REFLECTION_TAKE_WORDS } from "@/lib/reflection-voice/words"

type VoiceProps = {
  sessionId: string
  /** How far into the session now, or null after it ended. */
  atMs: number | null
}

/** One session's spoken reflections, over `voice`. */
export const ReflectionTakeList = ({
  voice,
  sessionId,
  atMs,
}: VoiceProps & { voice: ReflectionTakes }): JSX.Element => {
  const { pattern } = voice
  const taken = useTakePattern(pattern)
  const takes = useSyncExternalStore(voice.subscribe, voice.getSnapshot)
  const refused = useSyncExternalStore(voice.subscribe, voice.refused)
  useEffect(() => (): void => pattern.leave(), [pattern])
  const view = takeItemView(taken, takes, sessionId, pattern.options)
  return (
    <div className="flex flex-col gap-1.5">
      <TakeItem
        // A Redo the phone half-stored replaces the pattern's line, which
        // would say it was kept; a refused Let go the pattern unsays itself.
        view={refused === null ? view : { ...view, said: null }}
        words={REFLECTION_TAKE_WORDS}
        label="Spoken reflections"
        onTap={() => voice.tap(atMs, view.supersedes)}
        onPlay={pattern.play}
        onRedo={(id) => voice.tap(atMs, id)}
        onLetGo={pattern.letGo}
      />
      {refused !== null && (
        <p role="alert" className="text-destructive text-sm">
          {refused}
        </p>
      )}
    </div>
  )
}

export const DeviceReflectionVoice = ({
  sessionId,
  atMs,
}: VoiceProps): JSX.Element => {
  // eslint-disable-next-line owner-guard/no-mount-snapshot -- a runtime made once per mount, keyed by `sessionId` where it is rendered
  const [voice] = useState(() => phoneVoiceNote(sessionId))
  return <ReflectionTakeList voice={voice} sessionId={sessionId} atMs={atMs} />
}
