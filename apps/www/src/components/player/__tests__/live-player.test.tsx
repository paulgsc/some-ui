/**
 * @vitest-environment jsdom
 *
 * The activity outlives a change of layout: `isMobile` can flip mid-lesson,
 * and two separate returns would remount `SessionViewport` (a Topik lesson
 * went back to its material list). The stub counts its mounts and keeps
 * state; `useIsMobile` is the real one, reading the test viewport.
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
const played = vi.hoisted((): { starts: number; opening: Array<unknown> } => ({
  starts: 0,
  opening: [],
}))
const transport = vi.hoisted(() => ({
  pauses: 0,
  resumes: 0,
  mode: { is_running: false, is_paused: false },
}))

vi.mock("@/lib/orchestrator", async () => {
  const actual =
    await vi.importActual<typeof Orchestrator>("@/lib/orchestrator")
  const store = {
    configure: (): Promise<void> => Promise.resolve(),
    start: (): void => {
      played.starts += 1
    },
    // Read as the player closes, which leaves the session on both surfaces,
    // and as the reflection drawer opens and closes.
    pause: (): void => {
      transport.pauses += 1
      transport.mode = { is_running: false, is_paused: true }
    },
    resume: (): void => {
      transport.resumes += 1
      transport.mode = { is_running: true, is_paused: false }
    },
    get mode(): { is_running: boolean; is_paused: boolean } {
      return transport.mode
    },
    clock: { current_time: 0, total_duration: 60_000 },
    lifetimes: { scene_lifetimes: [] },
  }
  return {
    ...actual,
    useIsTerminal: (): boolean => false,
    useOrchestratorClock: (): { current_time: number } => ({
      current_time: 0,
    }),
    // `getState` too: the stop hook reads the store as a session starts and
    // as the player closes.
    useOrchestratorStore: Object.assign(
      <T,>(select: (s: typeof store) => T): T => select(store),
      { getState: (): typeof store => store }
    ),
  }
})

vi.mock("@/components/player/session-viewport", () => ({
  SessionViewport: ({ opening }: { opening?: string }): JSX.Element => {
    played.opening.push(opening)
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
vi.mock("@/lib/intent", () => ({
  useIntent: (): object => ({ state: { status: "idle" }, start: vi.fn() }),
}))
vi.mock("@/lib/intent/render", () => ({
  AmbientIntentStatus: (): null => null,
}))
vi.mock("@/components/reflection/reflect-panel", () => ({
  ReflectPanel: (): null => null,
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
  played.starts = 0
  played.opening = []
  transport.pauses = 0
  transport.resumes = 0
  transport.mode = { is_running: false, is_paused: false }
})

afterEach(() => {
  cleanup()
  resetViewport()
  // A playing session left as the player closes keeps a stop.
  localStorage.clear()
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

describe("LivePlayer asked for the next lesson", () => {
  it("plays an active session on arrival, and opens the activity on the lesson", async () => {
    setViewport(true)
    render(<LivePlayer session={fixtureSession()} initialOpening="next" />)
    await vi.waitFor(() => expect(played.starts).toBe(1))
    expect(played.opening.at(-1)).toBe("next")
  })
})

// #1870: on a wide window the drawer is the player's own, beside the
// transport; on a phone it is `SessionChrome`'s (its own test).
describe("LivePlayer with the reflection drawer", () => {
  it("on a wide window, holds a playing session while the sheet is open and plays on as it closes", () => {
    setViewport(false)
    transport.mode = { is_running: true, is_paused: false }
    render(<LivePlayer session={fixtureSession()} />)

    fireEvent.click(screen.getByRole("button", { name: /^reflect$/i }))
    expect(transport).toMatchObject({ pauses: 1, resumes: 0 })

    fireEvent.click(screen.getByRole("button", { name: /^close$/i }))
    expect(transport).toMatchObject({ pauses: 1, resumes: 1 })
  })

  it("on a wide window, leaves a session the person paused paused", () => {
    setViewport(false)
    transport.mode = { is_running: false, is_paused: true }
    render(<LivePlayer session={fixtureSession()} />)

    fireEvent.click(screen.getByRole("button", { name: /^reflect$/i }))
    fireEvent.click(screen.getByRole("button", { name: /^close$/i }))

    expect(transport).toMatchObject({ pauses: 0, resumes: 0 })
  })
})
