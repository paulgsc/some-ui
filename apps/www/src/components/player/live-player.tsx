import type { JSX } from "react"
import { useEffect, useRef } from "react"
import {
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

type LivePlayerProps = {
  session: SessionRecord
}

/**
 * Drives the single, app-wide mock orchestrator with this session's scenes.
 * Render with a `key={session.id}` from the caller so switching sessions
 * gets a fresh mount (and a fresh "have I configured this yet" guard)
 * rather than reusing a stale instance across different sessions.
 */
export const LivePlayer = ({ session }: LivePlayerProps): JSX.Element => {
  const configure = useOrchestratorStore((s) => s.configure)
  const start = useOrchestratorStore((s) => s.start)
  const isTerminal = useIsTerminal()
  const isMobile = useIsMobile()
  const { current_time: currentTime } = useOrchestratorClock()
  // Ambient per #940/#944's classification: the gesture that ends a session
  // (finishing it, or Stop) already has its own on-screen confirmation - the
  // completion screen itself, rendered unconditionally below regardless of
  // whether this write has settled. This intent only has to make a *failed*
  // write visible; a silent success stays silent, matching the pre-existing
  // (and correct) optimistic render.
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
   * On a phone the activity gets the screen and the chrome gets an icon.
   *
   * The desktop composition below is three bands stacked under the viewport
   * (notice, now/next, transport) plus the dashboard header above it. That
   * is a reasonable use of space a wide screen has spare and an unreasonable
   * one at 390px, where between them they take more room than the activity —
   * on the route whose whole purpose is the activity. `SessionChrome` folds
   * the two bottom bands and the header into one overlay-plane control (see
   * its own doc comment for why they fold together rather than shrink).
   *
   * The audio notice stays resident on both. It is a first-use disclosure
   * about something the app is about to do to a person's ears, shown once
   * per activity ever; putting it behind a tap would be hiding a disclosure
   * behind an affordance nobody has a reason to open yet.
   */
  if (isMobile) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col">
        <SessionAudioNotice session={session} className="shrink-0" />
        {/* Above the viewport, not over it — see `SessionChrome`'s own note
            on why the trigger is layout and only the sheet is overlay. */}
        <SessionChrome scenes={session.scenes} onPlay={() => void start()} />
        <SessionViewport session={session} />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4">
      {/* Layer 2 of audio disclosure: shown the first time a person enters
          an activity that uses audio, then never again for that activity. */}
      <SessionAudioNotice session={session} />
      <SessionViewport session={session} />
      <NowNextStrip scenes={session.scenes} />
      <TransportControls onPlay={() => void start()} />
    </div>
  )
}
