import type { JSX } from "react"
import { useEffect, useRef } from "react"
import {
  cn,
  useIsMobile,
  useIsTerminal,
  useOrchestratorClock,
  useOrchestratorStore,
} from "some-ui-utils"

import { useIntent } from "@/lib/intent"
import { AmbientIntentStatus } from "@/lib/intent/render"
import type { SessionRecord } from "@/lib/tenant"
import { useUpdateSession } from "@/lib/tenant"
import { SessionAudioNotice } from "@/components/audio/session-audio-notice"

import { CompletionSummary } from "./completion-summary"
import { NowNextStrip } from "./now-next-strip"
import { SessionChrome } from "./session-chrome"
import { SessionViewport } from "./session-viewport"
import { TransportControls } from "./transport-controls"
import { WindDownNudge } from "./wind-down-nudge"

type LivePlayerProps = {
  session: SessionRecord
}

/**
 * Drives the single, app-wide mock orchestrator with this session's scenes.
 * Render with `key={session.id}` so each session gets a fresh mount and
 * "configured yet" guard.
 */
export const LivePlayer = ({ session }: LivePlayerProps): JSX.Element => {
  const configure = useOrchestratorStore((s) => s.configure)
  const start = useOrchestratorStore((s) => s.start)
  const isTerminal = useIsTerminal()
  const isMobile = useIsMobile()
  const { current_time: currentTime } = useOrchestratorClock()
  // Ambient (#940/#944): ending a session already shows the completion
  // screen, unconditionally; this intent only makes a *failed* write visible.
  const completeSessionIntent = useIntent(useUpdateSession(), {
    presentation: "ambient",
  })

  const hasConfiguredRef = useRef(false)
  const hasWrittenBackRef = useRef(false)
  const latestTimeRef = useRef(currentTime)

  useEffect(() => {
    latestTimeRef.current = currentTime
  }, [currentTime])

  useEffect(() => {
    if (hasConfiguredRef.current) return
    hasConfiguredRef.current = true

    void configure(session.scenes).then(() => {
      if (session.status === "active" || session.status === "paused") {
        void start()
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs exactly once per mount; caller remounts this component per session id via key
  }, [])

  useEffect(() => {
    if (!isTerminal) {
      hasWrittenBackRef.current = false
      return
    }
    if (hasWrittenBackRef.current || session.status === "completed") return
    hasWrittenBackRef.current = true

    completeSessionIntent.start({
      id: session.id,
      patch: {
        status: "completed",
        completedAt: new Date().toISOString(),
        finalElapsedMs: latestTimeRef.current,
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `completeSessionIntent.start` is stable per useIntent's own useCallback; `completeSessionIntent` itself is a fresh object every render and would defeat `hasWrittenBackRef`'s guard for no benefit if included here.
  }, [isTerminal, session.id, session.status, completeSessionIntent.start])

  if (isTerminal) {
    const completedSession: SessionRecord =
      session.status === "completed"
        ? session
        : { ...session, status: "completed", finalElapsedMs: currentTime }
    return (
      <div className="flex flex-col gap-3">
        <CompletionSummary session={completedSession} />
        <AmbientIntentStatus state={completeSessionIntent.state} />
      </div>
    )
  }

  /**
   * On a phone the activity gets the screen and the chrome gets an icon:
   * `SessionChrome` folds the header and the two bottom bands into one
   * control (see its doc comment). The audio notice stays resident on both,
   * as a first-use disclosure must not hide behind a tap.
   *
   * One tree, not one per layout: `isMobile` can flip mid-lesson, and React
   * keys a child by type and slot, so two returns would remount
   * `SessionViewport` and reset the activity. Each child owns one slot in both
   * layouts (`__tests__/live-player.test.tsx` flips it mid-render).
   */
  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full flex-col",
        !isMobile && "gap-4"
      )}
    >
      {/* Layer 2 of audio disclosure: shown the first time a person enters
          an activity that uses audio, then never again for that activity. */}
      <SessionAudioNotice
        session={session}
        className={isMobile ? "shrink-0" : undefined}
      />
      {/* Above the viewport, not over it (see `SessionChrome`). */}
      {isMobile && (
        <SessionChrome scenes={session.scenes} onPlay={() => void start()} />
      )}
      <SessionViewport session={session} />
      {!isMobile && <WindDownNudge className="self-center" />}
      {!isMobile && <NowNextStrip scenes={session.scenes} />}
      {!isMobile && <TransportControls onPlay={() => void start()} />}
    </div>
  )
}
