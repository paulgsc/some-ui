import { act, renderHook, waitFor } from "@testing-library/react"
import type { Mock } from "vitest"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useCreateCrosswordWasm } from "./use-crossword-wasm"

// ═══════════════════════════════════════════════════════════════════════════
// S5/S6 — use-crossword-wasm.ts (`useCreateCrosswordWasm`) is both a
// wasm-bridge init hook (#554: does it load `some-crossword` exactly once,
// what happens if it resolves after unmount) and a `set-state-in-effect`
// chain (#555: `selectWordList` -> `generateCrossword`, two effects that
// depend on each other's output). Unlike use-typing-game-wasm, this hook
// has **no** aliveRef/cancellation guard today — that absence is itself the
// behavior worth pinning before any no-floating-promises fix touches it.
// ═══════════════════════════════════════════════════════════════════════════

type FakeGenerator = {
  generate: Mock<() => Promise<unknown>>
}

let generatorInstances: Array<{
  wordList: Array<string>
  generator: FakeGenerator
}>
let initMock: Mock<() => Promise<void>>
let generatorCtor: Mock

function validResult(): unknown {
  return { grid: ["A"], width: 1, height: 1, wordPlacements: [] }
}

/**
 * The real `CrosswordGenerator` (a wasm-bindgen class) has private fields,
 * so a `FakeGenerator` exposing only `generate()` can never satisfy it
 * structurally. This is the single, documented cast that lets it stand in
 * as the constructor mock's return value.
 */
function asCrosswordGenerator(generator: FakeGenerator): unknown {
  return generator
}

vi.mock("some-crossword", () => {
  return {
    default: vi.fn(),
    CrosswordGenerator: vi.fn(),
  }
})

beforeEach(async () => {
  generatorInstances = []
  const mod = await import("some-crossword")
  initMock = vi
    .mocked(mod.default)
    .mockReset()
    .mockImplementation(() => Promise.resolve())
  generatorCtor = vi
    .mocked(mod.CrosswordGenerator)
    .mockReset()
    .mockImplementation((wordList: Array<string>) => {
      const generator: FakeGenerator = {
        generate: vi.fn(() => Promise.resolve(validResult())),
      }
      generatorInstances.push({ wordList, generator })
      return asCrosswordGenerator(generator)
    })
})

describe("wasm-bridge lazy init (S5)", () => {
  it("loads the wasm module and builds a crossword exactly once on mount", async () => {
    const { result } = renderHook(() => useCreateCrosswordWasm())

    await waitFor(() => expect(result.current.crossword).not.toBeNull())

    expect(initMock).toHaveBeenCalledTimes(1)
    expect(generatorCtor).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBeNull()
  })

  it("selects a fixed-size random clue list once and reuses it for the generator's word list", async () => {
    const { result } = renderHook(() => useCreateCrosswordWasm())

    await waitFor(() => expect(result.current.crossword).not.toBeNull())

    expect(result.current.randomClues).toHaveLength(6)
    expect(generatorInstances).toHaveLength(1)
    expect(generatorInstances[0]?.wordList).toEqual(
      result.current.randomClues.map((c) => c.word)
    )
  })

  it("does not reselect words or regenerate on an unrelated re-render", async () => {
    const { result, rerender } = renderHook(() => useCreateCrosswordWasm())
    await waitFor(() => expect(result.current.crossword).not.toBeNull())

    rerender()
    rerender()

    expect(initMock).toHaveBeenCalledTimes(1)
    expect(generatorCtor).toHaveBeenCalledTimes(1)
  })

  it("regenerate() re-invokes the wasm init and constructs a fresh generator", async () => {
    const { result } = renderHook(() => useCreateCrosswordWasm())
    await waitFor(() => expect(result.current.crossword).not.toBeNull())

    await act(async () => {
      await result.current.regenerate()
    })

    expect(initMock).toHaveBeenCalledTimes(2)
    expect(generatorCtor).toHaveBeenCalledTimes(2)
  })

  it("surfaces a rejected generate() as an error and clears the crossword", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    generatorCtor.mockImplementation((wordList: Array<string>) => {
      const generator: FakeGenerator = {
        generate: vi.fn(() => Promise.reject(new Error("generation failed"))),
      }
      generatorInstances.push({ wordList, generator })
      return asCrosswordGenerator(generator)
    })

    const { result } = renderHook(() => useCreateCrosswordWasm())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBe("generation failed")
    expect(result.current.crossword).toBeNull()

    errorSpy.mockRestore()
  })

  it("still applies a resolved generate() result after unmount (no cancellation guard exists today)", async () => {
    const gate: { resolve: (value: unknown) => void } = { resolve: () => {} }
    generatorCtor.mockImplementation((wordList: Array<string>) => {
      const generator: FakeGenerator = {
        generate: vi.fn(
          () =>
            new Promise((resolve) => {
              gate.resolve = resolve
            })
        ),
      }
      generatorInstances.push({ wordList, generator })
      return asCrosswordGenerator(generator)
    })

    const { unmount } = renderHook(() => useCreateCrosswordWasm())
    await waitFor(() => expect(generatorInstances).toHaveLength(1))

    unmount()

    // Documents the current gap `no-floating-promises` flags: there is no
    // `cancelled`/aliveRef check before `setCrossword`/`setIsLoading` run,
    // so resolving after unmount does not throw — React just no-ops the
    // update on the unmounted fiber instead of the effect guarding it.
    await expect(
      act(async () => {
        gate.resolve(validResult())
        await Promise.resolve()
      })
    ).resolves.not.toThrow()
  })
})
