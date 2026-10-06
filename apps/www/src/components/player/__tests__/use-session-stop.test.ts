/**
 * @vitest-environment jsdom
 *
 * A stop in the player: kept the moment it happens (a tap or leaving the
 * app), forgotten when it was a mis-tap or a glance, and picked up or closed
 * as it stood when the person comes back.
 */

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type * as Orchestrator from "@/lib/orchestrator"
import type { Stop } from "@/lib/session-stop"
import { GLANCE_MS, latestStop, PICK_UP_MS, saveStop } from "@/lib/session-stop"
import { useSessionStop } from "@/components/player/use-session-stop"

const commands = {
  start: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  forceScene: vi.fn(),
}
let mode = { is_running: true, is_paused: false }

vi.mock("@/lib/orchestrator", async () => {
  const actual =
    await vi.importActual<typeof Orchestrator>("@/lib/orchestrator")
  const reading = {
    started_at: 0,
    kind: { Scene: { scene_name: "reading" } },
  }
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

const open = (agoMs: number): Stop => ({
  sessionId: "s",
  stoppedAt: new Date(Date.now() - agoMs).toISOString(),
  elapsedMs: 738_000,
  plannedMs: 1_200_000,
  scene: "reading",
  via: "left",
  reason: null,
  reasonFrom: null,
  outcome: "open",
  settledAt: null,
})

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
  vi.useRealTimers()
  localStorage.clear()
  visibility = "visible"
})

describe("useSessionStop", () => {
  it("keeps a tapped stop where it stopped, and forgets it on keep going", () => {
    const { result } = renderHook(() => useSessionStop("s"))

    act(() => result.current.gotToGo())
    expect(commands.pause).toHaveBeenCalledTimes(1)
    expect(latestStop("s")).toMatchObject({
      via: "tap",
      elapsedMs: 738_000,
      scene: "reading",
      outcome: "open",
    })

    mode = { is_running: false, is_paused: true }
    act(() => result.current.pickUp())
    expect(commands.resume).toHaveBeenCalledTimes(1)
    expect(latestStop("s")).toBeNull()
  })

  it("keeps a stop on leaving the app, and drops it after a glance", () => {
    const { result } = renderHook(() => useSessionStop("s"))

    setVisibility("hidden")
    expect(latestStop("s")?.via).toBe("left")

    setVisibility("visible")
    expect(latestStop("s")).toBeNull()
    expect(result.current.stop).toBeNull()
    expect(commands.resume).toHaveBeenCalledTimes(1)
  })

  it("offers the pick-up on coming back after more than a glance", () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    const { result } = renderHook(() => useSessionStop("s"))

    setVisibility("hidden")
    vi.setSystemTime(Date.now() + GLANCE_MS + 1)
    setVisibility("visible")

    expect(result.current.stop?.outcome).toBe("open")
    expect(result.current.returning).toBe(true)
    expect(commands.resume).not.toHaveBeenCalled()
  })

  it("reopened inside the window, picks up at the stopped scene", () => {
    saveStop(open(5 * 60_000))
    mode = { is_running: false, is_paused: false }
    const { result } = renderHook(() => useSessionStop("s"))

    act(() => result.current.begin())
    expect(commands.start).not.toHaveBeenCalled()
    expect(result.current.returning).toBe(true)

    act(() => result.current.pickUp())
    expect(commands.start).toHaveBeenCalledTimes(1)
    expect(commands.forceScene).toHaveBeenCalledWith("reading")
    expect(latestStop("s")?.outcome).toBe("resumed")
  })

  it("reopened past the window, closes the session as it stood", () => {
    saveStop(open(PICK_UP_MS + 60_000))
    const { result } = renderHook(() => useSessionStop("s"))

    act(() => result.current.begin())

    expect(commands.stop).toHaveBeenCalledTimes(1)
    expect(result.current.stop?.outcome).toBe("lapsed")
    expect(latestStop("s")?.outcome).toBe("lapsed")
  })

  it("calls it done at the stop's own time", () => {
    saveStop(open(5 * 60_000))
    const { result } = renderHook(() => useSessionStop("s"))
    act(() => result.current.begin())

    act(() => result.current.callItDone())

    expect(commands.stop).toHaveBeenCalledTimes(1)
    expect(result.current.stop).toMatchObject({
      outcome: "done",
      elapsedMs: 738_000,
    })
  })
})
