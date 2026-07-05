import { useGameTimer } from "@honeycomb/hooks/use-game-timer"
import type { GameStatus } from "@honeycomb/lib/hangul/wasm-game-bridge"
import { act, renderHook } from "@testing-library/react"
import type { Mock } from "vitest"
import { describe, expect, it, vi } from "vitest"

type UseGameTimerProps = Parameters<typeof useGameTimer>[0]

function makeStatus(overrides: Partial<GameStatus> = {}): GameStatus {
  return {
    isComplete: false,
    isTimedOut: false,
    timeRemainingMs: 60000,
    progress: {
      totalKeys: 10,
      completedKeys: 0,
      remainingKeys: 10,
      completionPercentage: 0,
      keysCompletedList: [],
    },
    ...overrides,
  }
}

type MockGameBridge = {
  startTimer: Mock<() => void>
  subscribeToStatus: Mock<(cb: () => void) => () => void>
  getStatusSnapshot: Mock<() => GameStatus | null>
  setStatus: (newStatus: GameStatus | null) => void
}

function createFakeBridge(
  initialStatus: GameStatus | null = null
): MockGameBridge {
  let status = initialStatus
  const listeners = new Set<() => void>()
  return {
    startTimer: vi.fn(),
    subscribeToStatus: vi.fn((cb: () => void) => {
      listeners.add(cb)
      return (): void => {
        listeners.delete(cb)
      }
    }),
    getStatusSnapshot: vi.fn(() => status),
    setStatus(newStatus): void {
      status = newStatus
      listeners.forEach((l) => l())
    },
  }
}

type MockGameTimerProps = {
  gameBridge: MockGameBridge | null
  isInitialized: boolean
  onComplete?: (status: GameStatus) => void
  onTimeout?: (status: GameStatus) => void
}

/**
 * `gameBridge`'s real type (`WasmGameBridge`) has private fields, so a mock
 * that only implements the handful of methods `useGameTimer` calls can
 * never satisfy it structurally. This is the single, documented cast that
 * lets a `MockGameBridge` stand in for it.
 */
function asGameTimerProps(props: MockGameTimerProps): UseGameTimerProps {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see comment above
  return props as UseGameTimerProps
}

describe("start-once guard", () => {
  it("starts the timer once gameBridge and isInitialized are ready", () => {
    const bridge = createFakeBridge()
    renderHook(() =>
      useGameTimer(
        asGameTimerProps({ gameBridge: bridge, isInitialized: true })
      )
    )

    expect(bridge.startTimer).toHaveBeenCalledTimes(1)
  })

  it("does not start the timer again on re-render", () => {
    const bridge = createFakeBridge()
    const { rerender } = renderHook(
      (props: MockGameTimerProps) => useGameTimer(asGameTimerProps(props)),
      {
        initialProps: { gameBridge: bridge, isInitialized: true },
      }
    )

    rerender({ gameBridge: bridge, isInitialized: true })

    expect(bridge.startTimer).toHaveBeenCalledTimes(1)
  })

  it("does not start the timer without a gameBridge", () => {
    expect(() =>
      renderHook(() =>
        useGameTimer(
          asGameTimerProps({ gameBridge: null, isInitialized: true })
        )
      )
    ).not.toThrow()
  })

  it("does not start the timer when not initialized", () => {
    const bridge = createFakeBridge()
    renderHook(() =>
      useGameTimer(
        asGameTimerProps({ gameBridge: bridge, isInitialized: false })
      )
    )

    expect(bridge.startTimer).not.toHaveBeenCalled()
  })
})

describe("terminal callbacks", () => {
  it("fires onComplete exactly once when status becomes complete", () => {
    const bridge = createFakeBridge(makeStatus())
    const onComplete = vi.fn()
    renderHook(() =>
      useGameTimer(
        asGameTimerProps({
          gameBridge: bridge,
          isInitialized: true,
          onComplete,
        })
      )
    )

    act(() => bridge.setStatus(makeStatus({ isComplete: true })))
    act(() => bridge.setStatus(makeStatus({ isComplete: true })))

    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it("fires onTimeout exactly once when status becomes timed out", () => {
    const bridge = createFakeBridge(makeStatus())
    const onTimeout = vi.fn()
    renderHook(() =>
      useGameTimer(
        asGameTimerProps({ gameBridge: bridge, isInitialized: true, onTimeout })
      )
    )

    act(() => bridge.setStatus(makeStatus({ isTimedOut: true })))

    expect(onTimeout).toHaveBeenCalledTimes(1)
  })

  it("does not fire onTimeout after onComplete has already fired", () => {
    const bridge = createFakeBridge(makeStatus())
    const onComplete = vi.fn()
    const onTimeout = vi.fn()
    renderHook(() =>
      useGameTimer(
        asGameTimerProps({
          gameBridge: bridge,
          isInitialized: true,
          onComplete,
          onTimeout,
        })
      )
    )

    act(() => bridge.setStatus(makeStatus({ isComplete: true })))
    act(() =>
      bridge.setStatus(makeStatus({ isComplete: true, isTimedOut: true }))
    )

    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onTimeout).not.toHaveBeenCalled()
  })
})

describe("reset on re-initialization", () => {
  it("allows the timer to start again after isInitialized cycles false -> true", () => {
    const bridge = createFakeBridge()
    const { rerender } = renderHook(
      (props: MockGameTimerProps) => useGameTimer(asGameTimerProps(props)),
      {
        initialProps: { gameBridge: bridge, isInitialized: true },
      }
    )
    expect(bridge.startTimer).toHaveBeenCalledTimes(1)

    rerender({ gameBridge: bridge, isInitialized: false })
    rerender({ gameBridge: bridge, isInitialized: true })

    expect(bridge.startTimer).toHaveBeenCalledTimes(2)
  })

  it("allows terminal callbacks to fire again after a reset", () => {
    const bridge = createFakeBridge(makeStatus())
    const onComplete = vi.fn()
    const { rerender } = renderHook(
      (props: MockGameTimerProps) => useGameTimer(asGameTimerProps(props)),
      {
        initialProps: { gameBridge: bridge, isInitialized: true, onComplete },
      }
    )

    act(() => bridge.setStatus(makeStatus({ isComplete: true })))
    expect(onComplete).toHaveBeenCalledTimes(1)

    rerender({ gameBridge: bridge, isInitialized: false, onComplete })
    act(() => bridge.setStatus(makeStatus()))
    rerender({ gameBridge: bridge, isInitialized: true, onComplete })

    act(() => bridge.setStatus(makeStatus({ isComplete: true })))

    expect(onComplete).toHaveBeenCalledTimes(2)
  })
})

describe("derived return values", () => {
  it("isGameOver is false while running and true once complete", () => {
    const bridge = createFakeBridge(makeStatus())
    const { result } = renderHook(() =>
      useGameTimer(
        asGameTimerProps({ gameBridge: bridge, isInitialized: true })
      )
    )

    expect(result.current.isGameOver).toBe(false)

    act(() => bridge.setStatus(makeStatus({ isComplete: true })))

    expect(result.current.isGameOver).toBe(true)
  })

  it("defaults timeRemainingMs to 0 and progress to undefined without a status", () => {
    const bridge = createFakeBridge(null)
    const { result } = renderHook(() =>
      useGameTimer(
        asGameTimerProps({ gameBridge: bridge, isInitialized: true })
      )
    )

    expect(result.current.timeRemainingMs).toBe(0)
    expect(result.current.progress).toBeUndefined()
  })
})
