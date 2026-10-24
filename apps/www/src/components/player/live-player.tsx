import type { JSX } from "react"
import { useEffect, useEffectEvent, useRef, useState } from "react"
import { cn } from "@some-ui/core-utils"
import { useIsMobile } from "@some-ui/react-hooks"

import { useIntent } from "@/lib/intent"
import { AmbientIntentStatus } from "@/lib/intent/render"
import {
  useIsTerminal,
  useOrchestratorClock,
  useOrchestratorStore,
} from "@/lib/orchestrator"
import { closedPatch } from "@/lib/session-stop"
import type { SessionRecord } from "@/lib/tenant"
import { useUpdateSession } from "@/lib/tenant"
import { SessionAudioNotice } from "@/components/audio/session-audio-notice"
import { ReflectButton } from "@/components/reflection/reflect-button"

import { CompletionSummary } from "./completion-summary"
import { NowNextStrip } from "./now-next-strip"
import { SessionChrome } from "./session-chrome"
import { StopScreen } from "./session-stop"
import { SessionViewport } from "./session-viewport"
import { TransportControls } from "./transport-controls"
import { useSessionStop } from "./use-session-stop"
import { WindDownNudge } from "./wind-down-nudge"

type LivePlayerProps = {
  session: SessionRecord
  /**
   * Asked for the next lesson (Practice Home's "Next lesson"): the activity
   * opens on the lesson. An active session plays on mount anyway (`stops`).
   */
  initialNext?: boolean
}

/**
 * Drives the single, app-wide mock orchestrator with this session's scenes.
 * Render with `key={session.id}` so each session gets a fresh mount and
 * "configured yet" guard.
 */
export const LivePlayer = ({
  session,
  initialNext = false,
}: LivePlayerProps): JSX.Element => {
  const configure = useOrchestratorStore((s) => s.configure)
  const start = useOrchestratorStore((s) => s.start)
  const { state: stop, stops } = useSessionStop(session.id)
  const closedAt = stop.kind === "closed" ? stop.stop : null
  // Until this mount's configure resolves, the app-wide store still holds
  // the previous session's terminal mode.
  const [configured, setConfigured] = useState(false)
  const isTerminal = useIsTerminal() && configured
  const isMobile = useIsMobile()
  const { current_time: currentTime } = useOrchestratorClock()
  // Ambient (#940/#944): ending a session already shows the completion
  // screen, unconditionally; this intent only makes a *failed* write visible.
  const completeSessionIntent = useIntent(useUpdateSession(), {
    presentation: "ambient",
  })

  const hasConfiguredRef = useRef(false)
  const hasWrittenBackRef = useRef(false)

  useEffect(() => {
    if (hasConfiguredRef.current) return
    hasConfiguredRef.current = true

    void configure(session.scenes).then(() => {
      setConfigured(true)
      if (session.status === "active" || session.status === "paused") {
        stops.begin()
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs exactly once per mount; caller remounts this component per session id via key
  }, [])

  const writeBack = useEffectEvent((): void => {
    if (hasWrittenBackRef.current || session.status === "completed") return
    hasWrittenBackRef.current = true

    completeSessionIntent.start({
      id: session.id,
      // A stopped session ends where it stopped, even reopened from scratch.
      patch: closedAt
        ? closedPatch(closedAt)
        : {
            status: "completed",
            completedAt: new Date().toISOString(),
            finalElapsedMs: currentTime,
          },
    })
  })

  useEffect(() => {
    if (!isTerminal) {
      hasWrittenBackRef.current = false
      return
    }
    writeBack()
  }, [isTerminal])

  if (isTerminal) {
    const completedSession: SessionRecord =
      session.status === "completed"
        ? session
        : {
            ...session,
            status: "completed",
            finalElapsedMs: closedAt?.elapsedMs ?? currentTime,
          }
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
  // A stop is modal: the paused activity behind it is inert.
  return (
    <>
      <div
        inert={stop.kind === "open"}
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
        {/* Above the viewport, not over it (see `SessionChrome`). Remounted
            as a stop opens and closes, so its controls sheet starts shut. */}
        {isMobile && (
          <SessionChrome
            key={stop.kind}
            sessionId={session.id}
            scenes={session.scenes}
            onPlay={() => void start()}
            onGotToGo={stops.tap}
          />
        )}
        <SessionViewport
          session={session}
          {...(initialNext ? { opening: "next" as const } : {})}
        />
        {!isMobile && <WindDownNudge className="self-center" />}
        {!isMobile && <NowNextStrip scenes={session.scenes} />}
        {!isMobile && <TransportControls onPlay={() => void start()} />}
        {!isMobile && (
          <ReflectButton
            sessionId={session.id}
            atMs={currentTime}
            className="self-center"
          />
        )}
      </div>
      {stop.kind === "open" && (
        <StopScreen
          stop={stop.stop}
          returning={stop.returning}
          onPickUp={stops.pickUp}
          onDone={stops.done}
          className="fixed inset-0 z-50"
        />
      )}
    </>
  )
}
