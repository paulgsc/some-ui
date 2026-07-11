import { resetWasm } from "@input/lib/leetype/leetype-wasm-loader"
import type { GameState } from "@input/types/leetype"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { Mock } from "vitest"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useTypingGame } from "."

// ═══════════════════════════════════════════════════════════════════════════
// S5 — use-typing-game-wasm.ts:67-99 holds the workspace's canonical
// `const aliveRef = { current: true }` mount-guard: an async `loadWasm()`
// that resolves *after* unmount must not construct a `TypedTypingGame`
// instance or touch a freed one, and `gameRef.current?.free()` must run
// exactly once on cleanup. These tests pin that behavior (and plain
// mount/remount stability) *before* the react-hooks/refs + immutability +
// no-floating-promises fixes land, per #554.
//
// The leetype-wasm crate itself is mocked (module aliased to the stub in
// vitest.config.ts, overridden here) so `loadWasm()`'s real caching/guard
// logic in leetype-wasm-loader.ts runs unmodified against a controllable
// fake TypingGame. `resetWasm()` (exported "useful for testing") clears
// the loader's module-level singleton between tests.
// ═══════════════════════════════════════════════════════════════════════════

type FakeTypingGameInstance = {
  targetCode: string
  maxConsecutiveErrors: number | undefined
  freed: boolean
  free: Mock
}

let instances: Array<FakeTypingGameInstance>

vi.mock("@some-ui/leetype-wasm", () => {
  class TypingGame {
    targetCode: string
    maxConsecutiveErrors: number | undefined
    freed = false
    free: Mock

    constructor(targetCode: string, maxConsecutiveErrors?: number) {
      this.targetCode = targetCode
      this.maxConsecutiveErrors = maxConsecutiveErrors
      this.free = vi.fn(() => {
        this.freed = true
      })
      registerInstance(this)
    }

    start(): void {}
    reset(): void {}
    handle_input(): unknown {
      return {
        total_errors: 0,
        consecutive_errors: 0,
        show_error_alert: false,
        accepted: true,
      }
    }
    get_stats(): unknown {
      return {
        progress: 0,
        accuracy: 100,
        wpm: 0,
        elapsed_time: 0,
        total_errors: 0,
        consecutive_errors: 0,
        show_error_alert: false,
        cursor: 0,
        is_complete: false,
      }
    }
    get_user_input(): string {
      return ""
    }
    get_target_units(): unknown {
      return []
    }
    get_user_units(): unknown {
      return []
    }
    get_cursor(): unknown {
      return []
    }
    complete_chunk(): unknown {
      return { chars_typed: 0, errors: 0, elapsed_time: 0 }
    }
    start_next_chunk(): void {}
    reset_game(): void {}
    get_cumulative_stats(): unknown {
      return [0, 0]
    }
    target_length(): number {
      return 0
    }
  }

  function registerInstance(instance: FakeTypingGameInstance): void {
    instances.push(instance)
  }

  return {
    default: vi.fn(() => Promise.resolve()),
    TypingGame,
    canonicalize_text: vi.fn(() => []),
    build_display_map_from_code: vi.fn(() => new Uint32Array()),
  }
})

function baseProps(overrides: { gameState?: GameState } = {}): {
  targetCode: string
  gameState: GameState
  onComplete: Mock
} {
  return {
    targetCode: "const x = 1",
    gameState: "playing",
    onComplete: vi.fn(),
    ...overrides,
  }
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
    .mockImplementation(() => Promise.resolve())
})

describe("lazy init", () => {
  it("loads wasm and constructs exactly one game instance once loadWasm resolves", async () => {
    const { result } = renderHook(() => useTypingGame(baseProps()))

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(instances).toHaveLength(1)
    expect(instances[0]?.targetCode).toBe("const x = 1")
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
    const gate = deferred<void>()
    vi.mocked(wasmStub.default).mockImplementation(() => gate.promise)

    const { unmount } = renderHook(() => useTypingGame(baseProps()))

    // Unmount while `loadWasm()` is still in flight — cleanup runs
    // synchronously and flips `aliveRef.current = false` before the promise
    // ever settles.
    unmount()
    expect(instances).toHaveLength(0)

    await act(async () => {
      gate.resolve()
      await gate.promise
    })

    // The `if (!aliveRef.current) return` guard must have short-circuited
    // before `new TypedTypingGame(...)` — no instance, nothing to free.
    expect(instances).toHaveLength(0)
  })

  it("does not surface an error state if loadWasm rejects after unmount", async () => {
    const wasmStub = await import("@some-ui/leetype-wasm")
    const gate = deferred<void>()
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
