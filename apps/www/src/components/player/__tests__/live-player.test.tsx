/**
 * @vitest-environment jsdom
 *
 * The activity outlives a change of layout: `isMobile` can flip mid-lesson,
 * and two separate returns would remount `SessionViewport` (a Topik lesson
 * went back to its material list). The stub counts its mounts and keeps
 * state; `useIsMobile` is the real one, reading the test viewport.
 *
 * And the orchestrator plays only what the build can (`playableScenes`).
 */

import type { JSX } from "react"
import { useEffect, useState } from "react"
import {
  resetViewport,
  setViewport,
  turnViewport,
} from "@/test-support/viewport"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type * as Orchestrator from "@/lib/orchestrator"
import type { SessionRecord } from "@/lib/tenant"
import { LivePlayer } from "@/components/player/live-player"

const lifecycle = { mounts: 0, unmounts: 0 }
const configured = vi.hoisted((): { scenes: Array<unknown> } => ({
  scenes: [],
}))

vi.mock("@/lib/orchestrator", async () => {
  const actual =
    await vi.importActual<typeof Orchestrator>("@/lib/orchestrator")
  const store = {
    configure: (scenes: Array<unknown>): Promise<void> => {
      configured.scenes = scenes
      return Promise.resolve()
    },
    start: (): void => {},
  }
  return {
    ...actual,
    useIsTerminal: (): boolean => false,
    useOrchestratorClock: (): { current_time: number } => ({
      current_time: 0,
    }),
    // `getState` too: the stop hook reads the store when a session starts.
    useOrchestratorStore: Object.assign(
      <T,>(select: (s: typeof store) => T): T => select(store),
      { getState: (): typeof store => store }
    ),
  }
})

vi.mock("@/components/player/session-viewport", () => ({
  SessionViewport: (): JSX.Element => {
    const [step, setStep] = useState(1)
    useEffect(() => {
      lifecycle.mounts += 1
      return (): void => {
        lifecycle.unmounts += 1
      }
    }, [])
    return (
      <button type="button" onClick={() => setStep((s) => s + 1)}>
        {`activity step ${String(step)}`}
      </button>
    )
  },
}))

vi.mock("@/components/player/session-chrome", () => ({
  SessionChrome: (): JSX.Element => <div data-testid="session-chrome" />,
}))
vi.mock("@/components/player/now-next-strip", () => ({
  NowNextStrip: (): JSX.Element => <div data-testid="now-next" />,
}))
vi.mock("@/components/player/transport-controls", () => ({
  TransportControls: (): JSX.Element => <div data-testid="transport" />,
}))
vi.mock("@/components/audio/session-audio-notice", () => ({
  SessionAudioNotice: (): null => null,
}))
vi.mock("@/lib/tenant", () => ({ useUpdateSession: (): object => ({}) }))
// Stands in for a build that binds no "unbound" panel.
vi.mock("@/lib/playable", () => ({
  playableScenes: (
    scenes: Array<{ scene_name: string }>
  ): Array<{ scene_name: string }> =>
    scenes.filter((scene) => scene.scene_name !== "unbound"),
}))
vi.mock("@/lib/intent", () => ({
  useIntent: (): object => ({ state: { status: "idle" }, start: vi.fn() }),
}))
vi.mock("@/lib/intent/render", () => ({
  AmbientIntentStatus: (): null => null,
}))

function fixtureSession(): SessionRecord {
  return {
    id: "session-turn-1",
    name: "Turned over mid-lesson",
    status: "active",
    activities: [],
    scenes: [],
    layoutMode: "basic",
    totalDurationMs: 60_000,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
}

beforeEach(() => {
  lifecycle.mounts = 0
  lifecycle.unmounts = 0
})

afterEach(() => {
  cleanup()
  resetViewport()
})

describe("LivePlayer across the breakpoint", () => {
  it.each([
    ["a handheld window widened", true],
    ["a wide window narrowed", false],
  ])("keeps the activity mounted when %s", (_name, startsHandheld) => {
    setViewport(startsHandheld)
    render(<LivePlayer session={fixtureSession()} />)

    // Some progress the activity holds itself, as a lesson does.
    fireEvent.click(screen.getByRole("button", { name: "activity step 1" }))

    turnViewport(!startsHandheld)
    // The layout really did change, or this proves nothing.
    expect(screen.queryByTestId("session-chrome") === null).toBe(startsHandheld)

    turnViewport(startsHandheld)

    expect(lifecycle).toEqual({ mounts: 1, unmounts: 0 })
    expect(
      screen.getByRole("button", { name: "activity step 2" })
    ).toBeDefined()
  })

  it("paints each layout's own chrome around it", () => {
    setViewport(true)
    render(<LivePlayer session={fixtureSession()} />)
    expect(screen.queryByTestId("session-chrome")).not.toBeNull()
    expect(screen.queryByTestId("transport")).toBeNull()

    turnViewport(false)
    expect(screen.queryByTestId("session-chrome")).toBeNull()
    expect(screen.queryByTestId("now-next")).not.toBeNull()
    expect(screen.queryByTestId("transport")).not.toBeNull()
  })
})

describe("LivePlayer's scenes", () => {
  it("configures the orchestrator with only what this build plays", () => {
    const scene = (scene_name: string): SessionRecord["scenes"][number] => ({
      scene_name,
      duration: 60_000,
      start_time: 0,
      ui: [],
    })
    setViewport(false)
    render(
      <LivePlayer
        session={{
          ...fixtureSession(),
          scenes: [scene("unbound"), scene("bound")],
        }}
      />
    )

    expect(configured.scenes).toEqual([scene("bound")])
  })
})
