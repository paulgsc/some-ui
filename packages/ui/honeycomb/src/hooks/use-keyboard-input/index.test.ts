import { act, renderHook } from "@testing-library/react"
import type { Mock } from "vitest"
import { describe, expect, it, vi } from "vitest"

import { useKeyboardInput } from "."

type UseKeyboardInputProps = Parameters<typeof useKeyboardInput>[0]

type MockGameBridge = {
  processKeyPress: Mock<(key: string) => Array<unknown>>
  processBackspace?: Mock<() => Array<unknown>>
  getTimingParams: Mock<() => unknown>
}

type MockKeyboardManager = {
  addKey: Mock<(key: string, now: number) => void>
  clearBuffer: Mock<() => void>
  removeLastKey?: Mock<() => void>
}

type MockKeyboardInputProps = {
  gameBridge: MockGameBridge | null
  isInitialized: boolean
  isPaused: boolean
  keyboardManager: MockKeyboardManager
  setActiveCharacters: Mock
  setStats: Mock
  setTimingParams: Mock
  setKeyBuffer: Mock
  setShowSuccessFeedback: Mock
  setLastPoints: Mock
  setAmbiguousCharacters: Mock
  playSound: Mock
}

function createBaseProps(
  overrides: Partial<MockKeyboardInputProps> = {}
): MockKeyboardInputProps {
  return {
    gameBridge: {
      processKeyPress: vi.fn(() => []),
      processBackspace: vi.fn(() => []),
      getTimingParams: vi.fn(() => ({ speed: 1 })),
      // Adding minimal placeholders if the hook ever accesses them outside of mocks
    },
    isInitialized: true,
    isPaused: false,
    keyboardManager: {
      addKey: vi.fn(),
      clearBuffer: vi.fn(),
      removeLastKey: vi.fn(),
    },
    setActiveCharacters: vi.fn(),
    setStats: vi.fn(),
    setTimingParams: vi.fn(),
    setKeyBuffer: vi.fn(),
    setShowSuccessFeedback: vi.fn(),
    setLastPoints: vi.fn(),
    setAmbiguousCharacters: vi.fn(),
    playSound: vi.fn(),
    ...overrides,
  }
}

/**
 * `gameBridge` and `keyboardManager`'s real types (`WasmGameBridge`,
 * `KeyboardInputManager`) have private fields, so mocks that only implement
 * the handful of methods `useKeyboardInput` calls can never satisfy them
 * structurally. This is the single, documented cast that lets a
 * `MockKeyboardInputProps` stand in for the hook's real props.
 */
function asKeyboardInputProps(
  props: MockKeyboardInputProps
): UseKeyboardInputProps {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see comment above
  return props as unknown as UseKeyboardInputProps
}

describe("listener registration", () => {
  it("does not register when paused", () => {
    const addSpy = vi.spyOn(window, "addEventListener")

    renderHook(() =>
      useKeyboardInput(
        asKeyboardInputProps(createBaseProps({ isPaused: true }))
      )
    )

    expect(addSpy).not.toHaveBeenCalledWith("keydown", expect.any(Function))
  })

  it("does not register when not initialized", () => {
    const addSpy = vi.spyOn(window, "addEventListener")

    renderHook(() =>
      useKeyboardInput(
        asKeyboardInputProps(createBaseProps({ isInitialized: false }))
      )
    )

    expect(addSpy).not.toHaveBeenCalled()
  })

  it("does not register without gameBridge", () => {
    const addSpy = vi.spyOn(window, "addEventListener")

    renderHook(() =>
      useKeyboardInput(
        asKeyboardInputProps(createBaseProps({ gameBridge: null }))
      )
    )

    expect(addSpy).not.toHaveBeenCalled()
  })

  it("registers when ready", () => {
    const addSpy = vi.spyOn(window, "addEventListener")

    renderHook(() => useKeyboardInput(asKeyboardInputProps(createBaseProps())))

    expect(addSpy).toHaveBeenCalledWith("keydown", expect.any(Function))
  })
})

it("removes keydown listener on unmount", () => {
  const removeSpy = vi.spyOn(window, "removeEventListener")

  const { unmount } = renderHook(() =>
    useKeyboardInput(asKeyboardInputProps(createBaseProps()))
  )

  unmount()

  expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function))
})

describe("key filtering", () => {
  it("ignores ctrl-modified keys", () => {
    const props = createBaseProps()

    renderHook(() => useKeyboardInput(asKeyboardInputProps(props)))

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "a",
          ctrlKey: true,
        })
      )
    })

    expect(props.keyboardManager.addKey).not.toHaveBeenCalled()
    expect(props.gameBridge!.processKeyPress).not.toHaveBeenCalled()
  })

  it("ignores special keys (length > 1)", () => {
    const props = createBaseProps()

    renderHook(() => useKeyboardInput(asKeyboardInputProps(props)))

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }))
    })

    expect(props.keyboardManager.addKey).not.toHaveBeenCalled()
  })

  it("ignores space", () => {
    const props = createBaseProps()

    renderHook(() => useKeyboardInput(asKeyboardInputProps(props)))

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }))
    })

    expect(props.keyboardManager.addKey).not.toHaveBeenCalled()
  })
})

it("adds key and forwards to wasm", () => {
  const props = createBaseProps()

  renderHook(() => useKeyboardInput(asKeyboardInputProps(props)))

  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }))
  })

  expect(props.keyboardManager.addKey).toHaveBeenCalledWith(
    "a",
    expect.any(Number)
  )

  expect(props.gameBridge!.processKeyPress).toHaveBeenCalledWith("a")
})

it("handles matchFound correctly", () => {
  vi.useFakeTimers()

  const props = createBaseProps({
    gameBridge: {
      processKeyPress: vi.fn(() => [
        {
          type: "matchFound",
          cellId: "1",
          cellIds: ["1"],
          points: 50,
          isHighQuality: true,
        },
      ]),
      getTimingParams: vi.fn(),
    },
  })

  renderHook(() => useKeyboardInput(asKeyboardInputProps(props)))

  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }))
  })

  expect(props.setLastPoints).toHaveBeenCalledWith(50)
  expect(props.setShowSuccessFeedback).toHaveBeenCalledWith(true)
  expect(props.keyboardManager.clearBuffer).toHaveBeenCalled()
  expect(props.setKeyBuffer).toHaveBeenCalledWith("")
  expect(props.setAmbiguousCharacters).toHaveBeenCalledWith([])
  expect(props.playSound).toHaveBeenCalledWith("match_perfect")

  act(() => {
    vi.advanceTimersByTime(500)
  })

  expect(props.setShowSuccessFeedback).toHaveBeenCalledWith(false)
})

it("persists a completed character in its cell instead of removing it", () => {
  const props = createBaseProps({
    gameBridge: {
      processKeyPress: vi.fn(() => [
        {
          type: "matchFound",
          cellId: "cell-a",
          cellIds: ["cell-a"],
          points: 50,
          isHighQuality: true,
          countsTowardCompletion: true,
        },
      ]),
      getTimingParams: vi.fn(),
    },
  })

  renderHook(() => useKeyboardInput(asKeyboardInputProps(props)))

  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }))
  })

  // Exercise the state updater the handler passed to setActiveCharacters.
  const updater = props.setActiveCharacters.mock.calls[0]![0]
  const prev = new Map([
    ["cell-a", { cellId: "cell-a", hangul: "ㄱ", timeRemaining: 0.4 }],
  ])
  const next = updater(prev)

  expect(next.has("cell-a")).toBe(true)
  expect(next.get("cell-a").isSolved).toBe(true)
  expect(next.get("cell-a").timeRemaining).toBe(1)
})

it("removes a correct-but-not-completed character from its cell", () => {
  const props = createBaseProps({
    gameBridge: {
      processKeyPress: vi.fn(() => [
        {
          type: "matchFound",
          cellId: "cell-b",
          cellIds: ["cell-b"],
          points: 10,
          isHighQuality: false,
          countsTowardCompletion: false,
        },
      ]),
      getTimingParams: vi.fn(),
    },
  })

  renderHook(() => useKeyboardInput(asKeyboardInputProps(props)))

  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }))
  })

  const updater = props.setActiveCharacters.mock.calls[0]![0]
  const prev = new Map([
    ["cell-b", { cellId: "cell-b", hangul: "ㄱ", timeRemaining: 0.4 }],
  ])
  const next = updater(prev)

  expect(next.has("cell-b")).toBe(false)
})

it("calculates accuracy and sets stats", () => {
  const stats = { totalCorrect: 8, totalMissed: 2 }

  const props = createBaseProps({
    gameBridge: {
      processKeyPress: vi.fn(() => [
        {
          type: "statsUpdated",
          stats,
        },
      ]),
      getTimingParams: vi.fn(),
    },
  })

  renderHook(() => useKeyboardInput(asKeyboardInputProps(props)))

  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }))
  })

  expect(props.setStats).toHaveBeenCalledWith({
    ...stats,
    accuracy: 80,
  })
})

it("handles difficultyChanged", () => {
  const timing = { speed: 2 }

  const props = createBaseProps({
    gameBridge: {
      processKeyPress: vi.fn(() => [
        {
          type: "difficultyChanged",
          reason: "perfectMatch",
        },
      ]),
      getTimingParams: vi.fn(() => timing),
    },
  })

  renderHook(() => useKeyboardInput(asKeyboardInputProps(props)))

  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }))
  })

  expect(props.setTimingParams).toHaveBeenCalledWith(timing)
  expect(props.playSound).toHaveBeenCalledWith("difficulty_increase")
})

it("handles inputMissed", () => {
  const props = createBaseProps({
    gameBridge: {
      processKeyPress: vi.fn(() => [
        {
          type: "inputMissed",
        },
      ]),
      getTimingParams: vi.fn(),
    },
  })

  renderHook(() => useKeyboardInput(asKeyboardInputProps(props)))

  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }))
  })

  expect(props.keyboardManager.clearBuffer).toHaveBeenCalled()
  expect(props.playSound).toHaveBeenCalledWith("match_miss")
})

describe("backspace (ADR 0003 §2(b))", () => {
  it("calls processBackspace instead of processKeyPress and routes its events", () => {
    const props = createBaseProps({
      gameBridge: {
        processKeyPress: vi.fn(() => []),
        processBackspace: vi.fn(() => [
          { type: "bufferUpdated", currentBuffer: "t" },
        ]),
        getTimingParams: vi.fn(),
      },
    })

    renderHook(() => useKeyboardInput(asKeyboardInputProps(props)))

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace" }))
    })

    expect(props.gameBridge!.processBackspace).toHaveBeenCalled()
    expect(props.gameBridge!.processKeyPress).not.toHaveBeenCalled()
    expect(props.keyboardManager.removeLastKey).toHaveBeenCalled()
    expect(props.setKeyBuffer).toHaveBeenCalledWith("t")
  })
})

describe("answerProgress (mid-word cursor advance)", () => {
  it("advances cursor on every cell of the challenge and clears the buffer", () => {
    const props = createBaseProps({
      gameBridge: {
        processKeyPress: vi.fn(() => [
          {
            type: "answerProgress",
            cellIds: ["cell-a", "cell-b"],
            composedSoFar: ["ㅅ"],
            remaining: ["ㅏ"],
            cursor: 1,
            total: 2,
          },
        ]),
        getTimingParams: vi.fn(),
      },
    })

    renderHook(() => useKeyboardInput(asKeyboardInputProps(props)))

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "t" }))
    })

    const updater = props.setActiveCharacters.mock.calls[0]![0]
    const prev = new Map([
      ["cell-a", { cellId: "cell-a", tokenIndex: 0, cursor: 0 }],
      ["cell-b", { cellId: "cell-b", tokenIndex: 1, cursor: 0 }],
    ])
    const next = updater(prev)

    expect(next.get("cell-a").cursor).toBe(1)
    expect(next.get("cell-b").cursor).toBe(1)
    expect(props.keyboardManager.clearBuffer).toHaveBeenCalled()
    expect(props.setKeyBuffer).toHaveBeenCalledWith("")
    expect(props.playSound).toHaveBeenCalledWith("match_correct")
  })
})

it("locks every reserved cell of a multi-cell challenge on matchFound", () => {
  const props = createBaseProps({
    gameBridge: {
      processKeyPress: vi.fn(() => [
        {
          type: "matchFound",
          cellId: "cell-a",
          cellIds: ["cell-a", "cell-b"],
          points: 50,
          isHighQuality: true,
          countsTowardCompletion: true,
        },
      ]),
      getTimingParams: vi.fn(),
    },
  })

  renderHook(() => useKeyboardInput(asKeyboardInputProps(props)))

  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k" }))
  })

  const updater = props.setActiveCharacters.mock.calls[0]![0]
  const prev = new Map([
    ["cell-a", { cellId: "cell-a", timeRemaining: 0.4 }],
    ["cell-b", { cellId: "cell-b", timeRemaining: 0.4 }],
  ])
  const next = updater(prev)

  expect(next.get("cell-a").isSolved).toBe(true)
  expect(next.get("cell-b").isSolved).toBe(true)
})
