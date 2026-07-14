import { act, renderHook, waitFor } from "@testing-library/react"
import type { Mock } from "vitest"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useCreateCrosswordWasm } from "."

// ═══════════════════════════════════════════════════════════════════════════
// S5/S6 — use-crossword-wasm.ts (`useCreateCrosswordWasm`) is a wasm-bridge
// init hook: it loads `some-crossword` and picks a random clue list exactly
// once on mount (#554), and guards its setState calls with an `aliveRef`
// against a `generate()` that resolves after unmount (#555). These tests
// pin both behaviors.
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
 * The real `CrosswordGenerator` (a wasm-bindgen class) carries internal
 * bookkeeping fields (`__wbg_ptr`, `__destroy_into_raw`) that aren't part of
 * its public `.d.ts`, so a `FakeGenerator` exposing only `generate()` can
 * never satisfy it structurally. Widening through the return type (rather
 * than an `as` cast, which this project's lint config forbids outright) is
 * the documented escape hatch — `generatorCtor` is typed as the untyped
 * `Mock` above specifically so `.mockImplementation` here accepts it.
 */
function asCrosswordGenerator(generator: FakeGenerator): unknown {
  return generator
}

vi.mock("@some-ui/some-crossword", () => {
  return {
    default: vi.fn(),
    CrosswordGenerator: vi.fn(),
  }
})

beforeEach(async () => {
  generatorInstances = []
  const mod = await import("@some-ui/some-crossword")
  initMock = vi
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the wasm init's InitOutput return is unused; the mock only needs to resolve
    .mocked(mod.default as unknown as () => Promise<void>)
    .mockReset()
    .mockImplementation(() => Promise.resolve())
  // vitest 4 types a mocked class constructor as Mock<typeof CrosswordGenerator>,
  // which requires satisfying both a call and a construct signature - something
  // no plain function value (the mockImplementation below) can ever provide.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above
  generatorCtor = vi
    .mocked(mod.CrosswordGenerator)
    .mockReset() as unknown as Mock
  generatorCtor.mockImplementation((wordList: Array<string>) => {
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

  it("does not apply a resolved generate() result after unmount (aliveRef guard)", async () => {
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

    const { result, unmount } = renderHook(() => useCreateCrosswordWasm())
    await waitFor(() => expect(generatorInstances).toHaveLength(1))

    unmount()

    await act(async () => {
      gate.resolve(validResult())
      await Promise.resolve()
    })

    // The `aliveRef` guard short-circuits before `setCrossword` runs — the
    // crossword frozen at its last pre-unmount render (`null`) stays null.
    expect(result.current.crossword).toBeNull()
  })
})
