/**
 * @vitest-environment jsdom
 *
 * The orchestrator store is app-wide, so a new session mounts while it still
 * holds the previous one's terminal mode and clock. Exported records showed
 * the new session written `completed` about 70 ms after it started, with the
 * previous session's `finalElapsedMs`. The store and the mock engine here are
 * the real ones; only the write and the screens around the player are stubbed.
 */

import type { JSX, ReactNode } from "react"
import { resetViewport, setViewport } from "@/test-support/viewport"
import type { SceneConfig } from "@some-ui/types"
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useMockOrchestrator, useOrchestratorStore } from "@/lib/orchestrator"
import type { SessionRecord } from "@/lib/tenant"
import { LivePlayer } from "@/components/player/live-player"

const writes = vi.hoisted(() => ({ start: vi.fn() }))

vi.mock("@/lib/tenant", () => ({ useUpdateSession: (): object => ({}) }))
vi.mock("@/lib/intent", () => ({
  useIntent: (): object => ({
    state: { status: "idle" },
    start: writes.start,
  }),
}))
vi.mock("@/lib/intent/render", () => ({
  AmbientIntentStatus: (): null => null,
}))
vi.mock("@/components/player/completion-summary", () => ({
  CompletionSummary: (): JSX.Element => <div data-testid="completion" />,
}))
vi.mock("@/components/player/session-viewport", () => ({
  SessionViewport: (): JSX.Element => <div data-testid="viewport" />,
}))
vi.mock("@/components/player/session-chrome", () => ({
  SessionChrome: (): null => null,
}))
vi.mock("@/components/player/now-next-strip", () => ({
  NowNextStrip: (): null => null,
}))
vi.mock("@/components/player/transport-controls", () => ({
  TransportControls: (): null => null,
}))
vi.mock("@/components/player/wind-down-nudge", () => ({
  WindDownNudge: (): null => null,
}))
vi.mock("@/components/reflection/reflect-button", () => ({
  ReflectButton: (): null => null,
}))
vi.mock("@/components/audio/session-audio-notice", () => ({
  SessionAudioNotice: (): null => null,
}))

const scenes: Array<SceneConfig> = [
  { scene_name: "rounds", duration: 60_000, start_time: 0, ui: [] },
]

function session(id: string): SessionRecord {
  return {
    id,
    name: id,
    status: "active",
    activities: [],
    scenes,
    layoutMode: "basic",
    totalDurationMs: 60_000,
    createdAt: "2026-10-18T00:00:00.000Z",
    updatedAt: "2026-10-18T00:00:00.000Z",
  }
}

/** The app's provider, mounted once for every session, as in the shell. */
const Orchestrated = ({ children }: { children: ReactNode }): JSX.Element => {
  useMockOrchestrator({ stream_id: "test" })
  return <>{children}</>
}

/** Plays a previous session 42 s in and stops it: a terminal store. */
async function endPreviousSession(): Promise<void> {
  const o = useOrchestratorStore.getState()
  await act(async () => {
    await o.configure(scenes)
    await o.start()
    await o.seek(42_000)
    await o.stop()
  })
  expect(useOrchestratorStore.getState().mode.is_terminal).toBe(true)
}

beforeEach(() => {
  setViewport(false)
})

afterEach(() => {
  cleanup()
  resetViewport()
  writes.start.mockClear()
})

describe("LivePlayer after a previous session ended", () => {
  it("does not complete the new session from the old one's state", async () => {
    const { rerender } = render(<Orchestrated>{null}</Orchestrated>)
    await endPreviousSession()

    rerender(
      <Orchestrated>
        <LivePlayer key="next" session={session("next")} />
      </Orchestrated>
    )
    await act(async () => {})

    expect(writes.start).not.toHaveBeenCalled()
    expect(screen.queryByTestId("completion")).toBeNull()
    expect(screen.getByTestId("viewport")).toBeDefined()
  })

  it("still completes the new session when its own run ends", async () => {
    const { rerender } = render(<Orchestrated>{null}</Orchestrated>)
    await endPreviousSession()
    rerender(
      <Orchestrated>
        <LivePlayer key="next" session={session("next")} />
      </Orchestrated>
    )
    await act(async () => {})

    await act(async () => {
      const o = useOrchestratorStore.getState()
      await o.start()
      await o.seek(7_000)
      await o.stop()
    })

    expect(writes.start).toHaveBeenCalledTimes(1)
    expect(writes.start).toHaveBeenCalledWith({
      id: "next",
      patch: expect.objectContaining({
        status: "completed",
        finalElapsedMs: 7_000,
      }),
    })
    expect(screen.getByTestId("completion")).toBeDefined()
  })
})
