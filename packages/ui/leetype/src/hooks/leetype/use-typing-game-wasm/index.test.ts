import { resetWasm } from "@leetype/lib/leetype/leetype-wasm-loader"
import type { GameState } from "@leetype/types/leetype"
import type { default as wasmInit } from "@some-ui/leetype-wasm"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { Mock } from "vitest"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useTypingGame } from "."

/**
 * What `__wbg_init` resolves to — the wasm exports table.
 *
 * Derived from the bindings rather than written as `void` so these mocks
 * keep tracking the real signature: the stub now takes its types from the
 * published `.d.ts`, so init's return type is the crate's to change. The
 * loader awaits init purely for sequencing and never reads the table, so a
 * stand-in value is enough.
 */
type InitOutput = Awaited<ReturnType<typeof wasmInit>>

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- a stand-in for the wasm exports table, which the loader awaits but never reads
const INIT_OUTPUT = {} as InitOutput

// ═══════════════════════════════════════════════════════════════════════════
// Two things are pinned here.
//
// 1. The workspace's canonical `const aliveRef = { current: true }`
//    mount-guard (#554): an async `loadWasm()` that resolves *after*
//    unmount must not construct a `TypedTypingGame` instance or touch a
//    freed one, and `free()` must run exactly once on cleanup.
//
// 2. The keystroke contract that replaced the old whole-buffer
//    `handle_input(string)`: the hook forwards one `press`/`backspace`
//    command per keystroke, only while playing, and republishes the
//    engine's own snapshot rather than deriving a cursor of its own.
//
// The leetype-wasm crate itself is mocked so `loadWasm()`'s real
// caching/guard logic in leetype-wasm-loader.ts runs unmodified against a
// controllable fake. `resetWasm()` (exported "useful for testing") clears
// the loader's module-level singleton between tests.
// ═══════════════════════════════════════════════════════════════════════════

const SNAPSHOT = {
  cursorSlot: 0,
  cursorDisplay: 0,
  cursorSection: null,
  slotCount: 3,
  filled: 0,
  correct: 0,
  firstGapSlot: 0,
  progress: 0,
  accuracy: 100,
  wpm: 0,
  instantWpm: 0,
  weightedWpm: 0,
  gateThreshold: 20,
  attempt: 0,
  revealK: 0,
  runCount: 1,
  assisted: 0,
  elapsedTime: 0,
  sessionElapsedTime: 0,
  totalErrors: 0,
  consecutiveErrors: 0,
  showErrorAlert: false,
  isComplete: false,
  started: false,
}

type FakeCall = { method: string; args: Array<unknown> }

type FakeTypingGameInstance = {
  targetCode: string
  maxConsecutiveErrors: number | undefined
  baselineWpm: number | undefined
  dispersionWpm: number | undefined
  calls: Array<FakeCall>
  freed: boolean
  free: Mock
}

let instances: Array<FakeTypingGameInstance>

vi.mock("@some-ui/leetype-wasm", () => {
  class TypingGame {
    targetCode: string
    maxConsecutiveErrors: number | undefined
    baselineWpm: number | undefined
    dispersionWpm: number | undefined
    calls: Array<FakeCall> = []
    freed = false
    free: Mock

    constructor(
      targetCode: string,
      maxConsecutiveErrors?: number,
      baselineWpm?: number,
      dispersionWpm?: number
    ) {
      this.targetCode = targetCode
      this.maxConsecutiveErrors = maxConsecutiveErrors
      this.baselineWpm = baselineWpm
      this.dispersionWpm = dispersionWpm
      this.free = vi.fn(() => {
        this.freed = true
      })
      registerInstance(this)
    }

    private record(method: string, ...args: Array<unknown>): unknown {
      this.calls.push({ method, args })
      return { accepted: true, rejection: undefined, snapshot: SNAPSHOT }
    }

    layout(): unknown {
      return { displayLen: 3, slotCount: 3, sections: [] }
    }
    roles(): Uint8Array {
      return new Uint8Array([1, 1, 1])
    }
    slot_of_display(): Int32Array {
      return new Int32Array([0, 1, 2])
    }
    slot_status(): Uint8Array {
      return new Uint8Array([0, 0, 0])
    }
    visibility(): Uint8Array {
      return new Uint8Array([0, 0, 0])
    }
    progression(now: number): unknown {
      this.calls.push({ method: "progression", args: [now] })
      return "advance"
    }
    snapshot(): unknown {
      return SNAPSHOT
    }
    section_progress(): unknown {
      return []
    }
    cumulative_stats(): unknown {
      return { charsTyped: 0, errors: 0 }
    }
    start(now: number): unknown {
      return this.record("start", now)
    }
    press(key: string, now: number): unknown {
      return this.record("press", key, now)
    }
    backspace(now: number): unknown {
      return this.record("backspace", now)
    }
    jump_to_slot(slot: number, now: number): unknown {
      return this.record("jump_to_slot", slot, now)
    }
    jump_to_section(section: number, now: number): unknown {
      return this.record("jump_to_section", section, now)
    }
    resume(now: number): unknown {
      return this.record("resume", now)
    }
    dismiss_alert(now: number): unknown {
      return this.record("dismiss_alert", now)
    }
    reset(now: number): unknown {
      return this.record("reset", now)
    }
    reset_game(now: number): unknown {
      return this.record("reset_game", now)
    }
    complete_chunk(now: number): unknown {
      return this.record("complete_chunk", now)
    }
    start_next_chunk(source: string, now: number): unknown {
      return this.record("start_next_chunk", source, now)
    }
    retry_chunk(now: number): unknown {
      return this.record("retry_chunk", now)
    }
    tick(now: number): unknown {
      return this.record("tick", now)
    }
    calibrate(
      baselineWpm: number,
      dispersionWpm: number,
      now: number
    ): unknown {
      return this.record("calibrate", baselineWpm, dispersionWpm, now)
    }
  }

  function registerInstance(instance: FakeTypingGameInstance): void {
    instances.push(instance)
  }

  return {
    default: vi.fn(() => Promise.resolve()),
    TypingGame,
    classify_source: vi.fn(() => new Uint8Array()),
    slot_map_from_source: vi.fn(() => new Int32Array()),
  }
})

function baseProps(overrides: { gameState?: GameState } = {}): {
  targetCode: string
  gameState: GameState
  stepKey: string
  onComplete: Mock
} {
  return {
    targetCode: "const x = 1",
    gameState: "playing",
    stepKey: "step-0",
    onComplete: vi.fn(),
    ...overrides,
  }
}

function methodsOf(
  instance: FakeTypingGameInstance | undefined
): Array<string> {
  return (instance?.calls ?? []).map((call) => call.method)
}

/** Deferred promise controller — lets a test decide exactly when `init()` settles. */
function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(async () => {
  instances = []
  resetWasm()
  const wasmStub = await import("@some-ui/leetype-wasm")
  vi.mocked(wasmStub.default)
    .mockReset()
    .mockImplementation(() => Promise.resolve(INIT_OUTPUT))
})

describe("lazy init", () => {
  it("loads wasm and constructs exactly one game instance once loadWasm resolves", async () => {
    const { result } = renderHook(() => useTypingGame(baseProps()))

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(instances).toHaveLength(1)
    expect(instances[0]?.targetCode).toBe("const x = 1")
  })

  it("publishes the engine's layout and maps once loaded", async () => {
    const { result } = renderHook(() => useTypingGame(baseProps()))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.layout.slotCount).toBe(3)
    expect(Array.from(result.current.roles)).toEqual([1, 1, 1])
    expect(Array.from(result.current.slotOfDisplay)).toEqual([0, 1, 2])
    expect(result.current.snapshot.cursorDisplay).toBe(0)
  })

  it("keeps the same game instance across re-renders when maxConsecutiveErrors is unchanged", async () => {
    const props = baseProps()
    const { result, rerender } = renderHook(
      (p: ReturnType<typeof baseProps>) => useTypingGame(p),
      { initialProps: props }
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(instances).toHaveLength(1)

    rerender({ ...props, onComplete: vi.fn() })
    rerender({ ...props, onComplete: vi.fn() })

    expect(instances).toHaveLength(1)
  })
})

describe("keystroke commands", () => {
  it("forwards one press per keystroke instead of a whole buffer", async () => {
    const { result } = renderHook(() => useTypingGame(baseProps()))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => {
      result.current.press("c")
      result.current.press("o")
    })

    const pressed = (instances[0]?.calls ?? [])
      .filter((call) => call.method === "press")
      .map((call) => call.args[0])
    expect(pressed).toEqual(["c", "o"])
  })

  it("ignores typing while the game is not playing", async () => {
    const { result } = renderHook(() =>
      useTypingGame(baseProps({ gameState: "idle" }))
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => {
      result.current.press("c")
      result.current.backspace()
    })

    expect(methodsOf(instances[0])).not.toContain("press")
    expect(methodsOf(instances[0])).not.toContain("backspace")
  })

  it("dismisses the error alert even when not playing", async () => {
    const { result } = renderHook(() =>
      useTypingGame(baseProps({ gameState: "idle" }))
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => {
      result.current.onDismiss()
    })

    expect(methodsOf(instances[0])).toContain("dismiss_alert")
  })
})

describe("the reveal loop's clock", () => {
  it("ticks the engine while a step is in flight", async () => {
    // Not optional plumbing: the loop's most important input is a player who
    // has *stopped* typing, and a state machine driven only by keystrokes
    // cannot see one.
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useTypingGame(baseProps()))
      await vi.waitFor(() => expect(result.current.isLoading).toBe(false))

      expect(methodsOf(instances[0])).not.toContain("tick")
      act(() => {
        vi.advanceTimersByTime(1_000)
      })
      expect(methodsOf(instances[0])).toContain("tick")
    } finally {
      vi.useRealTimers()
    }
  })

  it("does not tick a step nobody is playing", async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() =>
        useTypingGame(baseProps({ gameState: "idle" }))
      )
      await vi.waitFor(() => expect(result.current.isLoading).toBe(false))

      act(() => {
        vi.advanceTimersByTime(2_000)
      })
      expect(methodsOf(instances[0])).not.toContain("tick")
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("calibration", () => {
  it("hands the engine the player's own baseline at construction", async () => {
    const { result } = renderHook(() =>
      useTypingGame({
        ...baseProps(),
        initialBaseline: { wpm: 88, dispersion: 7, samples: 3, updatedAt: 0 },
      })
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(instances[0]?.baselineWpm).toBe(88)
    expect(instances[0]?.dispersionWpm).toBe(7)
  })

  it("applies a fresh sample as a command rather than a remount", async () => {
    // Tearing the engine down to apply a baseline would reset the session
    // clock and the totals with it.
    const { result } = renderHook(() => useTypingGame(baseProps()))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(instances).toHaveLength(1)

    act(() => {
      result.current.calibrate({
        wpm: 62,
        dispersion: 9,
        samples: 2,
        updatedAt: 1,
      })
    })

    expect(instances).toHaveLength(1)
    expect(methodsOf(instances[0])).toContain("calibrate")
  })
})

describe("teardown", () => {
  it("frees the game instance exactly once on unmount", async () => {
    const { result, unmount } = renderHook(() => useTypingGame(baseProps()))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const instance = instances[0]
    expect(instance).toBeDefined()

    unmount()

    expect(instance?.free).toHaveBeenCalledTimes(1)
  })

  it("reinitializes independently on remount after a prior unmount", async () => {
    const first = renderHook(() => useTypingGame(baseProps()))
    await waitFor(() => expect(first.result.current.isLoading).toBe(false))
    first.unmount()

    const firstInstance = instances[0]
    expect(firstInstance?.free).toHaveBeenCalledTimes(1)

    const second = renderHook(() => useTypingGame(baseProps()))
    await waitFor(() => expect(second.result.current.isLoading).toBe(false))

    expect(instances).toHaveLength(2)
    expect(instances[1]).not.toBe(firstInstance)
    // Unmounting the first hook must not have reached into the second's
    // instance — the guard is per-mount, not global.
    expect(instances[1]?.freed).toBe(false)

    second.unmount()
  })
})

describe("resolve-after-unmount safety (aliveRef guard)", () => {
  it("does not construct a game instance if loadWasm resolves after unmount", async () => {
    const wasmStub = await import("@some-ui/leetype-wasm")
    const gate = deferred<InitOutput>()
    vi.mocked(wasmStub.default).mockImplementation(() => gate.promise)

    const { unmount } = renderHook(() => useTypingGame(baseProps()))

    // Unmount while `loadWasm()` is still in flight — cleanup runs
    // synchronously and flips `aliveRef.current = false` before the promise
    // ever settles.
    unmount()
    expect(instances).toHaveLength(0)

    await act(async () => {
      gate.resolve(INIT_OUTPUT)
      await gate.promise
    })

    // The `if (!aliveRef.current) return` guard must have short-circuited
    // before `new TypedTypingGame(...)` — no instance, nothing to free.
    expect(instances).toHaveLength(0)
  })

  it("does not surface an error state if loadWasm rejects after unmount", async () => {
    const wasmStub = await import("@some-ui/leetype-wasm")
    const gate = deferred<InitOutput>()
    vi.mocked(wasmStub.default).mockImplementation(() => gate.promise)

    const { result, unmount } = renderHook(() => useTypingGame(baseProps()))
    unmount()

    await act(async () => {
      gate.reject(new Error("wasm boom"))
      await gate.promise.catch(() => {})
    })

    // `result.current` is frozen at its last pre-unmount render; the
    // point of this assertion is that the rejection handler's
    // `if (!aliveRef.current) return` fired instead of calling
    // `setError`/`setIsLoading` on the unmounted fiber.
    expect(result.current.error).toBeNull()
    expect(instances).toHaveLength(0)
  })
})
