/**
 * @vitest-environment jsdom
 *
 * StrictMode mounts each effect, cleans it up and mounts it again. The
 * player's cleanup keeps a stop when the orchestrator has a position, so
 * this drives the real orchestrator: a session left playing before, then a
 * player whose `configure` must set it idle before that first cleanup.
 */

import type { JSX, ReactNode } from "react"
import { StrictMode, useEffect } from "react"
import { act, cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useMockOrchestrator, useOrchestratorStore } from "@/lib/orchestrator"
import { latestStop } from "@/lib/session-stop"
import { useSessionStop } from "@/components/player/use-session-stop"

vi.mock("@/lib/build-profile", () => ({ hasAudience: (): boolean => true }))

const scenes = [
  {
    scene_name: "reading",
    start_time: 0,
    duration: 600_000,
    ui: [],
  },
]

const Orchestrator = ({ children }: { children: ReactNode }): JSX.Element => {
  useMockOrchestrator({ stream_id: "test" })
  return <>{children}</>
}

/** `LivePlayer`'s order: the stop hook, then `configure` in an effect. */
const Player = ({ sessionId }: { sessionId: string }): null => {
  useSessionStop(sessionId)
  useEffect(() => {
    void useOrchestratorStore.getState().configure(scenes)
  }, [])
  return null
}

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe("useSessionStop under StrictMode", () => {
  it("keeps no stop for a player that has not started", async () => {
    const { rerender } = render(
      <StrictMode>
        <Orchestrator>{null}</Orchestrator>
      </StrictMode>
    )
    await act(async () => {
      const o = useOrchestratorStore.getState()
      await o.configure(scenes)
      await o.start()
    })
    expect(useOrchestratorStore.getState().mode.is_running).toBe(true)

    rerender(
      <StrictMode>
        <Orchestrator>
          <Player sessionId="next" />
        </Orchestrator>
      </StrictMode>
    )

    expect(latestStop("next")).toBeNull()
  })
})
