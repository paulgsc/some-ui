/**
 * @vitest-environment jsdom
 *
 * The wiring: the orchestrator as the playback port, and leaving the app
 * forwarded on the phone. What each event means is `lib/session-stop`'s.
 */

import { seedStop, stopRecord } from "@/test-support/session-stop"
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type * as Orchestrator from "@/lib/orchestrator"
import { latestStop, PICK_UP_MS } from "@/lib/session-stop"
import { useSessionStop } from "@/components/player/use-session-stop"

const commands = {
  start: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  forceScene: vi.fn(),
  extend: vi.fn(),
}
let mode = { is_running: true, is_paused: false }

vi.mock("@/lib/orchestrator", async () => {
  const actual =
    await vi.importActual<typeof Orchestrator>("@/lib/orchestrator")
  const reading = { started_at: 0, kind: { Scene: { scene_name: "reading" } } }
  return {
    ...actual,
    useOrchestratorStore: {
      getState: (): unknown => ({
        ...commands,
        mode,
        clock: { current_time: 738_000, total_duration: 1_200_000 },
        lifetimes: { scene_lifetimes: [reading] },
      }),
    },
  }
})
vi.mock("@/lib/build-profile", () => ({ hasAudience: (): boolean => true }))

let visibility: DocumentVisibilityState = "visible"
function setVisibility(next: DocumentVisibilityState): void {
  visibility = next
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"))
  })
}

beforeEach(() => {
  mode = { is_running: true, is_paused: false }
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  localStorage.clear()
  visibility = "visible"
})

describe("useSessionStop", () => {
  it("stops the orchestrator where it is, on a tap", () => {
    const { result } = renderHook(() => useSessionStop("s"))

    act(() => result.current.stops.tap())

    expect(commands.pause).toHaveBeenCalledTimes(1)
    expect(latestStop("s")).toMatchObject({
      via: "tap",
      elapsedMs: 738_000,
      scene: "reading",
    })
    expect(result.current.state.kind).toBe("open")
  })

  it("keeps a stop on leaving the app, and drops it after a glance", () => {
    const { result } = renderHook(() => useSessionStop("s"))

    setVisibility("hidden")
    expect(latestStop("s")?.via).toBe("left")
    setVisibility("visible")

    expect(latestStop("s")).toBeNull()
    expect(result.current.state.kind).toBe("none")
    expect(commands.resume).toHaveBeenCalledTimes(1)
  })

  it("restarts at the stopped scene, its +5 min restored, after reopening", () => {
    seedStop(stopRecord(5 * 60_000, { sessionId: "s", plannedMs: 1_500_000 }))
    mode = { is_running: false, is_paused: false }
    const { result } = renderHook(() => useSessionStop("s"))

    act(() => result.current.stops.begin())
    act(() => result.current.stops.pickUp())

    expect(commands.start).toHaveBeenCalledTimes(1)
    expect(commands.forceScene).toHaveBeenCalledWith("reading")
    expect(commands.extend).toHaveBeenCalledWith(300_000)
  })

  it("ends the session when reopened past the window", () => {
    seedStop(stopRecord(PICK_UP_MS + 60_000, { sessionId: "s" }))
    const { result } = renderHook(() => useSessionStop("s"))

    act(() => result.current.stops.begin())

    expect(commands.stop).toHaveBeenCalledTimes(1)
    expect(latestStop("s")?.outcome).toBe("lapsed")
  })
})
