/**
 * @vitest-environment jsdom
 *
 * The orchestrator store is app-wide, so a new session mounts while it still
 * holds the previous one's terminal mode and clock. The store, the mock
 * engine and its provider are the real ones; only the write and the screens
 * around the player are stubbed.
 */

import type { JSX } from "react"
import { OrchestratorWrapper } from "@/providers/orchestrator"
import { sessionRecord } from "@/test-support/session-record"
import { resetViewport, setViewport } from "@/test-support/viewport"
import type { SceneConfig } from "@some-ui/types"
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useOrchestratorStore } from "@/lib/orchestrator"
import { LivePlayer } from "@/components/player/live-player"

const writeSession = vi.hoisted(() => vi.fn())

vi.mock("@/lib/tenant", () => ({ useUpdateSession: (): object => ({}) }))
vi.mock("@/lib/intent", () => ({
  useIntent: (): object => ({
    state: { status: "idle" },
    start: writeSession,
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

/** Stops a previous session 42 s in, then mounts the next one. */
async function mountAfterAStoppedSession(): Promise<void> {
  const { rerender } = render(<OrchestratorWrapper>{null}</OrchestratorWrapper>)
  const o = useOrchestratorStore.getState()
  await act(async () => {
    await o.configure(scenes)
    await o.start()
    await o.seek(42_000)
    await o.stop()
  })
  expect(useOrchestratorStore.getState().mode.is_terminal).toBe(true)

  const next = sessionRecord({
    id: "next",
    status: "active",
    scenes,
    totalDurationMs: 60_000,
  })
  rerender(
    <OrchestratorWrapper>
      <LivePlayer key={next.id} session={next} />
    </OrchestratorWrapper>
  )
  await act(async () => {})
}

beforeEach(() => {
  setViewport(false)
})

afterEach(() => {
  cleanup()
  resetViewport()
  writeSession.mockClear()
})

describe("LivePlayer after a previous session ended", () => {
  it("does not complete the new session from the old one's state", async () => {
    await mountAfterAStoppedSession()

    expect(writeSession).not.toHaveBeenCalled()
    expect(screen.getByTestId("viewport")).toBeDefined()
  })

  it("still completes the new session when its own run ends", async () => {
    await mountAfterAStoppedSession()

    await act(async () => {
      const o = useOrchestratorStore.getState()
      await o.start()
      await o.seek(7_000)
      await o.stop()
    })

    expect(writeSession).toHaveBeenCalledTimes(1)
    expect(writeSession).toHaveBeenCalledWith({
      id: "next",
      patch: expect.objectContaining({
        status: "completed",
        finalElapsedMs: 7_000,
      }),
    })
    expect(screen.getByTestId("completion")).toBeDefined()
  })
})
