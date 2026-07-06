import type { JSX } from "react"
import { useEffect, useRef } from "react"
import {
  useIsTerminal,
  useOrchestratorClock,
  useOrchestratorStore,
} from "some-ui-utils"

import type { SessionRecord } from "@/lib/tenant"
import { useUpdateSession } from "@/lib/tenant"

import { CompletionSummary } from "./completion-summary"
import { NowNextStrip } from "./now-next-strip"
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
  const { current_time: currentTime } = useOrchestratorClock()
  const updateSession = useUpdateSession()

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

    updateSession.mutate({
      id: session.id,
      patch: {
        status: "completed",
        completedAt: new Date().toISOString(),
        finalElapsedMs: latestTimeRef.current,
      },
    })
  }, [isTerminal, session.id, session.status, updateSession])

  if (isTerminal) {
    const completedSession: SessionRecord =
      session.status === "completed"
        ? session
        : { ...session, status: "completed", finalElapsedMs: currentTime }
    return <CompletionSummary session={completedSession} />
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4">
      <SessionViewport />
      <NowNextStrip scenes={session.scenes} />
      <TransportControls onPlay={() => void start()} />
    </div>
  )
}
