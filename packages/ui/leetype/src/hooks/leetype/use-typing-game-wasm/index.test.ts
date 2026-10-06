import { resetWasm } from "@leetype/lib/leetype/leetype-wasm-loader"
import type { GameState } from "@leetype/types/leetype"
import type { default as wasmInit } from "@some-ui/leetype-wasm"
import type { RenderHookResult } from "@testing-library/react"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { Mock } from "vitest"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useTypingGame } from "."

/** What `__wbg_init` resolves to; the loader awaits it but never reads it. */
type InitOutput = Awaited<ReturnType<typeof wasmInit>>

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- a stand-in for the wasm exports table, which the loader awaits but never reads
const INIT_OUTPUT = {} as InitOutput

// Pins (1) the `aliveRef` mount guard: a `loadWasm()` settling after unmount
// constructs nothing, and `free()` runs exactly once; and (2) the keystroke
// contract: one `press`/`backspace` per keystroke, only while playing, with
// the engine's own snapshot republished. The crate is mocked so the loader's
// real caching runs; `resetWasm()` clears its singleton between tests.

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
  manualRevealActive: false,
  manualRevealFraction: 0,
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

/** Merged onto `SNAPSHOT`; `{}` except in "the assistance seam". */
let snapshotOverride: Partial<typeof SNAPSHOT> = {}

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
      return {
        accepted: true,
        rejection: undefined,
        snapshot: { ...SNAPSHOT, ...snapshotOverride },
      }
    }

    layout(): unknown {
      return { displayLen: 3, slotCount: 3, sections: [], displaySource: "abc" }
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
      return { ...SNAPSHOT, ...snapshotOverride }
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
    toggle_reveal(now: number): unknown {
      return this.record("toggle_reveal", now)
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

/** Deferred promise controller: lets a test decide exactly when `init()` settles. */
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

/** Renders the hook and waits for the engine to load. */
async function renderLoaded(
  props: Parameters<typeof useTypingGame>[0] = baseProps()
): Promise<RenderHookResult<ReturnType<typeof useTypingGame>, unknown>> {
  const rendered = renderHook(() => useTypingGame(props))
  await waitFor(() => expect(rendered.result.current.isLoading).toBe(false))
  return rendered
}

/** Runs `body` under fake timers, restoring real ones after. */
async function withFakeTimers(body: () => Promise<void>): Promise<void> {
  vi.useFakeTimers()
  try {
    await body()
  } finally {
    vi.useRealTimers()
  }
}

beforeEach(async () => {
  instances = []
  snapshotOverride = {}
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
    const { result } = await renderLoaded()

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
    const { result } = await renderLoaded()

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
    const { result } = await renderLoaded(baseProps({ gameState: "idle" }))

    act(() => {
      result.current.press("c")
      result.current.backspace()
    })

    expect(methodsOf(instances[0])).not.toContain("press")
    expect(methodsOf(instances[0])).not.toContain("backspace")
  })

  it("dismisses the error alert even when not playing", async () => {
    const { result } = await renderLoaded(baseProps({ gameState: "idle" }))

    act(() => {
      result.current.onDismiss()
    })

    expect(methodsOf(instances[0])).toContain("dismiss_alert")
  })

  it("forwards the reveal toggle to the engine while playing", async () => {
    const { result } = await renderLoaded()

    act(() => {
      result.current.toggleReveal()
    })

    expect(methodsOf(instances[0])).toContain("toggle_reveal")
  })

  it("ignores the reveal toggle while the game is not playing", async () => {
    const { result } = await renderLoaded(baseProps({ gameState: "idle" }))

    act(() => {
      result.current.toggleReveal()
    })

    expect(methodsOf(instances[0])).not.toContain("toggle_reveal")
  })
})

describe("the reveal loop's clock", () => {
  it("ticks the engine while a step is in flight", async () => {
    // Keystrokes alone cannot show a player who has *stopped* typing.
    await withFakeTimers(async () => {
      const { result } = renderHook(() => useTypingGame(baseProps()))
      await vi.waitFor(() => expect(result.current.isLoading).toBe(false))

      expect(methodsOf(instances[0])).not.toContain("tick")
      act(() => {
        vi.advanceTimersByTime(1_000)
      })
      expect(methodsOf(instances[0])).toContain("tick")
    })
  })

  it("does not tick a step nobody is playing", async () => {
    await withFakeTimers(async () => {
      const { result } = renderHook(() =>
        useTypingGame(baseProps({ gameState: "idle" }))
      )
      await vi.waitFor(() => expect(result.current.isLoading).toBe(false))

      act(() => {
        vi.advanceTimersByTime(2_000)
      })
      expect(methodsOf(instances[0])).not.toContain("tick")
    })
  })
})

describe("calibration", () => {
  it("hands the engine the player's own baseline at construction", async () => {
    await renderLoaded({
      ...baseProps(),
      initialBaseline: { wpm: 88, dispersion: 7, samples: 3, updatedAt: 0 },
    })

    expect(instances[0]?.baselineWpm).toBe(88)
    expect(instances[0]?.dispersionWpm).toBe(7)
  })

  it("applies a fresh sample as a command rather than a remount", async () => {
    // A remount would reset the session clock and totals.
    const { result } = await renderLoaded()
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
    const { unmount } = await renderLoaded()
    const instance = instances[0]
    expect(instance).toBeDefined()

    unmount()

    expect(instance?.free).toHaveBeenCalledTimes(1)
  })

  it("reinitializes independently on remount after a prior unmount", async () => {
    const first = await renderLoaded()
    first.unmount()

    const firstInstance = instances[0]
    expect(firstInstance?.free).toHaveBeenCalledTimes(1)

    const second = await renderLoaded()

    expect(instances).toHaveLength(2)
    expect(instances[1]).not.toBe(firstInstance)
    // The guard is per-mount, not global.
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

    // Unmount while `loadWasm()` is in flight.
    unmount()
    expect(instances).toHaveLength(0)

    await act(async () => {
      gate.resolve(INIT_OUTPUT)
      await gate.promise
    })

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

    // The guard returned instead of setting state on the unmounted fiber.
    expect(result.current.error).toBeNull()
    expect(instances).toHaveLength(0)
  })
})

describe("the assistance seam (LTY-SEAM S2)", () => {
  it("republishes assisted and attempt from the engine untouched", async () => {
    // Nonzero, since 0 cannot be told apart from a stripped field.
    snapshotOverride = { assisted: 2, attempt: 1 }
    const { result } = await renderLoaded()

    act(() => {
      result.current.press("c")
    })

    expect(result.current.snapshot.assisted).toBe(2)
    expect(result.current.snapshot.attempt).toBe(1)
  })
})
