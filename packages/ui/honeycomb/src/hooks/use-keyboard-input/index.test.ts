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
  setWordProgress: Mock
  setCelebrationWord: Mock
}

function createBaseProps(
  overrides: Partial<MockKeyboardInputProps> = {}
): MockKeyboardInputProps {
  return {
    gameBridge: {
      processKeyPress: vi.fn(() => []),
      processBackspace: vi.fn(() => []),
      getTimingParams: vi.fn(() => ({ speed: 1 })),
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
    setWordProgress: vi.fn(),
    setCelebrationWord: vi.fn(),
    ...overrides,
  }
}

/**
 * `WasmGameBridge` and `KeyboardInputManager` have private fields, so no mock
 * satisfies them structurally; this is the one cast that lets a mock stand in.
 */
function asKeyboardInputProps(
  props: MockKeyboardInputProps
): UseKeyboardInputProps {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see comment above
  return props as unknown as UseKeyboardInputProps
}

function renderInput(props: MockKeyboardInputProps): { unmount: () => void } {
  return renderHook(() => useKeyboardInput(asKeyboardInputProps(props)))
}

/** Props whose bridge answers every key press with `events`. */
function pressing(
  events: Array<unknown>,
  timing?: unknown
): MockKeyboardInputProps {
  return createBaseProps({
    gameBridge: {
      processKeyPress: vi.fn(() => events),
      getTimingParams: vi.fn(() => timing),
    },
  })
}

function press(key: string, init: KeyboardEventInit = {}): void {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, ...init }))
  })
}

function matchFound(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    type: "matchFound",
    cellId: "cell-a",
    cellIds: ["cell-a"],
    points: 50,
    isHighQuality: true,
    countsTowardCompletion: true,
    ...overrides,
  }
}

/** Applies the first `setActiveCharacters` updater to `prev`. */
function applyFirstUpdate(
  props: MockKeyboardInputProps,
  prev: Map<string, Record<string, unknown>>
): Map<string, Record<string, unknown>> {
  const updater: (
    prev: Map<string, Record<string, unknown>>
  ) => Map<string, Record<string, unknown>> =
    props.setActiveCharacters.mock.calls[0]![0]
  return updater(prev)
}

describe("listener registration", () => {
  it("does not register when paused", () => {
    const addSpy = vi.spyOn(window, "addEventListener")
    renderInput(createBaseProps({ isPaused: true }))
    expect(addSpy).not.toHaveBeenCalledWith("keydown", expect.any(Function))
  })

  it.each<[string, Partial<MockKeyboardInputProps>]>([
    ["when not initialized", { isInitialized: false }],
    ["without gameBridge", { gameBridge: null }],
  ])("does not register %s", (_, overrides) => {
    const addSpy = vi.spyOn(window, "addEventListener")
    renderInput(createBaseProps(overrides))
    expect(addSpy).not.toHaveBeenCalled()
  })

  it("registers when ready", () => {
    const addSpy = vi.spyOn(window, "addEventListener")
    renderInput(createBaseProps())
    expect(addSpy).toHaveBeenCalledWith("keydown", expect.any(Function))
  })
})

it("removes keydown listener on unmount", () => {
  const removeSpy = vi.spyOn(window, "removeEventListener")
  const { unmount } = renderInput(createBaseProps())
  unmount()
  expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function))
})

describe("key filtering", () => {
  it("ignores ctrl-modified keys", () => {
    const props = createBaseProps()
    renderInput(props)
    press("a", { ctrlKey: true })
    expect(props.keyboardManager.addKey).not.toHaveBeenCalled()
    expect(props.gameBridge!.processKeyPress).not.toHaveBeenCalled()
  })

  it.each([
    ["special keys (length > 1)", "Enter"],
    ["space", " "],
  ])("ignores %s", (_, key) => {
    const props = createBaseProps()
    renderInput(props)
    press(key)
    expect(props.keyboardManager.addKey).not.toHaveBeenCalled()
  })
})

it("adds key and forwards to wasm", () => {
  const props = createBaseProps()
  renderInput(props)
  press("a")
  expect(props.keyboardManager.addKey).toHaveBeenCalledWith(
    "a",
    expect.any(Number)
  )
  expect(props.gameBridge!.processKeyPress).toHaveBeenCalledWith("a")
})

it("handles matchFound correctly", () => {
  vi.useFakeTimers()
  const props = pressing([
    {
      type: "matchFound",
      cellId: "1",
      cellIds: ["1"],
      points: 50,
      isHighQuality: true,
    },
  ])
  renderInput(props)
  press("a")

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
  const props = pressing([matchFound()])
  renderInput(props)
  press("a")

  const next = applyFirstUpdate(
    props,
    new Map([
      ["cell-a", { cellId: "cell-a", hangul: "ㄱ", timeRemaining: 0.4 }],
    ])
  )
  expect(next.has("cell-a")).toBe(true)
  expect(next.get("cell-a")!.isSolved).toBe(true)
  expect(next.get("cell-a")!.timeRemaining).toBe(1)
})

it("removes a correct-but-not-completed character from its cell", () => {
  const props = pressing([
    matchFound({
      cellId: "cell-b",
      cellIds: ["cell-b"],
      points: 10,
      isHighQuality: false,
      countsTowardCompletion: false,
    }),
  ])
  renderInput(props)
  press("a")

  const next = applyFirstUpdate(
    props,
    new Map([
      ["cell-b", { cellId: "cell-b", hangul: "ㄱ", timeRemaining: 0.4 }],
    ])
  )
  expect(next.has("cell-b")).toBe(false)
})

it("calculates accuracy and sets stats", () => {
  const stats = { totalCorrect: 8, totalMissed: 2 }
  const props = pressing([{ type: "statsUpdated", stats }])
  renderInput(props)
  press("a")
  expect(props.setStats).toHaveBeenCalledWith({ ...stats, accuracy: 80 })
})

it("handles difficultyChanged", () => {
  const timing = { speed: 2 }
  const props = pressing(
    [{ type: "difficultyChanged", reason: "perfectMatch" }],
    timing
  )
  renderInput(props)
  press("a")
  expect(props.setTimingParams).toHaveBeenCalledWith(timing)
  expect(props.playSound).toHaveBeenCalledWith("difficulty_increase")
})

it("handles inputMissed", () => {
  const props = pressing([{ type: "inputMissed" }])
  renderInput(props)
  press("a")
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
    renderInput(props)
    press("Backspace")

    expect(props.gameBridge!.processBackspace).toHaveBeenCalled()
    expect(props.gameBridge!.processKeyPress).not.toHaveBeenCalled()
    expect(props.keyboardManager.removeLastKey).toHaveBeenCalled()
    expect(props.setKeyBuffer).toHaveBeenCalledWith("t")
  })
})

describe("answerProgress (mid-word cursor advance)", () => {
  it("advances cursor on every cell of the challenge and clears the buffer", () => {
    const props = pressing([
      {
        type: "answerProgress",
        cellIds: ["cell-a", "cell-b"],
        composedSoFar: ["ㅅ"],
        remaining: ["ㅏ"],
        cursor: 1,
        total: 2,
      },
    ])
    renderInput(props)
    press("t")

    const next = applyFirstUpdate(
      props,
      new Map([
        ["cell-a", { cellId: "cell-a", tokenIndex: 0, cursor: 0 }],
        ["cell-b", { cellId: "cell-b", tokenIndex: 1, cursor: 0 }],
      ])
    )
    expect(next.get("cell-a")!.cursor).toBe(1)
    expect(next.get("cell-b")!.cursor).toBe(1)
    expect(props.setWordProgress).toHaveBeenCalledWith({
      cellIds: ["cell-a", "cell-b"],
      answerGlyphs: ["ㅅ", "ㅏ"],
      cursor: 1,
    })
    expect(props.keyboardManager.clearBuffer).toHaveBeenCalled()
    expect(props.setKeyBuffer).toHaveBeenCalledWith("")
    expect(props.playSound).toHaveBeenCalledWith("match_correct")
  })
})

it("locks every reserved cell of a multi-cell challenge on matchFound", () => {
  const props = pressing([matchFound({ cellIds: ["cell-a", "cell-b"] })])
  renderInput(props)
  press("k")

  const next = applyFirstUpdate(
    props,
    new Map([
      ["cell-a", { cellId: "cell-a", timeRemaining: 0.4 }],
      ["cell-b", { cellId: "cell-b", timeRemaining: 0.4 }],
    ])
  )
  expect(next.get("cell-a")!.isSolved).toBe(true)
  expect(next.get("cell-b")!.isSolved).toBe(true)
})

describe("Celebrate ceremony", () => {
  it("sets the celebration word on a multi-cell matchFound", () => {
    const props = pressing([
      matchFound({ cellIds: ["cell-a", "cell-b"], hangul: "ㅅㅏ" }),
    ])
    renderInput(props)
    press("k")
    expect(props.setCelebrationWord).toHaveBeenCalledWith("ㅅㅏ")
    expect(props.setWordProgress).toHaveBeenCalledWith(null)
  })

  it("clears the celebration word on a single-jamo matchFound", () => {
    const props = pressing([matchFound({ hangul: "ㄱ", points: 10 })])
    renderInput(props)
    press("r")
    expect(props.setCelebrationWord).toHaveBeenCalledWith(undefined)
  })
})
