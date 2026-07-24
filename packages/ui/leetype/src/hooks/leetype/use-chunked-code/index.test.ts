import type { CodeChunk, TextModel } from "@leetype/lib/leetype/load-code-file"
import { loadTextModel } from "@leetype/lib/leetype/load-code-file"
import { act, renderHook, waitFor } from "@testing-library/react"
import fc from "fast-check"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useChunkedCode } from "."

vi.mock("@leetype/lib/leetype/load-code-file", () => ({
  loadTextModel: vi.fn(),
}))

function chunk(overrides: Partial<CodeChunk> = {}): CodeChunk {
  return {
    content: "code",
    startLine: 0,
    endLine: 5,
    hasMore: false,
    ...overrides,
  }
}

function makeModel(
  chunksByStartLine: Record<number, CodeChunk>,
  totalLines: number
): TextModel {
  const fake = {
    getTotalLines: (): number => totalLines,
    getChunk: vi.fn((startLine: number) => {
      const c = chunksByStartLine[startLine]
      if (!c) throw new RangeError(`no fixture chunk at line ${startLine}`)
      return c
    }),
  }
  return fake as unknown as TextModel
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.mocked(loadTextModel).mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

// ═══════════════════════════════════════════════════════════════════════════
// 1. Essential Behavioral Tests (Happy path & Key state shifts)
// ═══════════════════════════════════════════════════════════════════════════
describe("Core Functionality", () => {
  it("initial load goes IDLE -> LOADING -> SUCCESS and stores initial chunk", async () => {
    const model = makeModel(
      { 0: chunk({ startLine: 0, endLine: 5, hasMore: true, content: "abc" }) },
      20
    )
    vi.mocked(loadTextModel).mockResolvedValue(model)

    const { result } = renderHook(() =>
      useChunkedCode("file.ts", { prettierParser: "typescript" })
    )

    expect(result.current.status).toBe("LOADING")
    await waitFor(() => expect(result.current.status).toBe("SUCCESS"))
    expect(result.current.currentChunk?.content).toBe("abc")
    expect(result.current.totalLines).toBe(20)
    expect(result.current.currentLine).toBe(5)
    expect(result.current.hasMore).toBe(true)
  })

  it("advances currentLine and replaces chunk on loadNextChunk", async () => {
    const model = makeModel(
      {
        0: chunk({ startLine: 0, endLine: 5, hasMore: true, content: "first" }),
        5: chunk({
          startLine: 5,
          endLine: 10,
          hasMore: false,
          content: "second",
        }),
      },
      10
    )
    vi.mocked(loadTextModel).mockResolvedValue(model)

    const { result } = renderHook(() =>
      useChunkedCode("file.ts", { prettierParser: "typescript" })
    )

    await waitFor(() => expect(result.current.status).toBe("SUCCESS"))
    act(() => {
      result.current.loadNextChunk()
    })

    expect(result.current.currentChunk?.content).toBe("second")
    expect(result.current.currentLine).toBe(10)
    expect(result.current.hasMore).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 2. Targeted Regression Tests (Specific Bug Fixes)
// ═══════════════════════════════════════════════════════════════════════════
describe("Bug Regressions", () => {
  it("REGRESSION: loadNextChunk failure transitions status to ERROR", async () => {
    const model = makeModel(
      {
        0: chunk({ startLine: 0, endLine: 5, hasMore: true }),
      },
      10
    )
    // Next chunk call will throw
    vi.spyOn(model, "getChunk").mockImplementation((line) => {
      if (line === 0) return chunk({ startLine: 0, endLine: 5, hasMore: true })
      throw new Error("Disk read error")
    })

    vi.mocked(loadTextModel).mockResolvedValue(model)

    const { result } = renderHook(() =>
      useChunkedCode("file.ts", { prettierParser: "typescript" })
    )
    await waitFor(() => expect(result.current.status).toBe("SUCCESS"))

    act(() => {
      result.current.loadNextChunk()
    })

    expect(result.current.status).toBe("ERROR")
    expect(result.current.error?.message).toBe("Disk read error")
  })

  it("REGRESSION: failed initial load resets loaderRef so loadNextChunk is a no-op", async () => {
    const modelA = makeModel(
      { 0: chunk({ startLine: 0, endLine: 5, hasMore: true }) },
      10
    )
    const getChunkSpy = vi.spyOn(modelA, "getChunk")

    vi.mocked(loadTextModel)
      .mockResolvedValueOnce(modelA)
      .mockRejectedValueOnce(new Error("Network failed"))

    const { result, rerender } = renderHook(
      ({ path }) => useChunkedCode(path, { prettierParser: "typescript" }),
      { initialProps: { path: "a.ts" } }
    )

    await waitFor(() => expect(result.current.status).toBe("SUCCESS"))
    expect(getChunkSpy).toHaveBeenCalledTimes(1) // initial getChunk(0)

    // Switch path to B, which fails
    rerender({ path: "b.ts" })
    await waitFor(() => expect(result.current.status).toBe("ERROR"))

    act(() => {
      result.current.loadNextChunk()
    })

    // getChunk count should remain 1 (no extra calls made after error)
    expect(getChunkSpy).toHaveBeenCalledTimes(1)
  })

  it("REGRESSION: late resolve after timeout remains in ERROR state", async () => {
    vi.useFakeTimers()
    const gate = deferred<TextModel>()
    vi.mocked(loadTextModel).mockImplementation(() => gate.promise)

    const { result } = renderHook(() =>
      useChunkedCode("file.ts", { prettierParser: "typescript" })
    )

    // Trigger timeout
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(result.current.status).toBe("ERROR")

    // Loader resolves late
    const model = makeModel({ 0: chunk() }, 5)
    await act(async () => {
      gate.resolve(model)
      await gate.promise
    })

    expect(result.current.status).toBe("ERROR")
    expect(result.current.currentChunk).toBeUndefined()
  })

  it("REGRESSION: late resolve after rejection remains in ERROR state", async () => {
    const gate = deferred<TextModel>()
    vi.mocked(loadTextModel).mockImplementation(() => gate.promise)

    const { result } = renderHook(() =>
      useChunkedCode("file.ts", { prettierParser: "typescript" })
    )

    await act(async () => {
      gate.reject(new Error("First error"))
    })
    expect(result.current.status).toBe("ERROR")

    // Late resolve attempt (e.g., duplicate event/retry wrap)
    const model = makeModel({ 0: chunk() }, 5)
    await act(async () => {
      try {
        gate.resolve(model)
      } catch {
        /* ignore */
      }
    })

    expect(result.current.status).toBe("ERROR")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 3. Property-Based Testing (Invariants & Event Sequences)
// ═══════════════════════════════════════════════════════════════════════════
describe("Property Tests (fast-check)", () => {
  it("INVARIANT: calling loadNextChunk is safe and maintains state rules in any state", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("IDLE", "LOADING", "SUCCESS", "ERROR"),
        async (targetStatus) => {
          // Setup state mock according to targetStatus
          const gate = deferred<TextModel>()

          if (targetStatus === "IDLE") {
            const { result } = renderHook(() =>
              useChunkedCode("", { prettierParser: "typescript" })
            )
            act(() => result.current.loadNextChunk())
            expect(result.current.status).toBe("IDLE")
          } else if (targetStatus === "LOADING") {
            vi.mocked(loadTextModel).mockImplementation(() => gate.promise)
            const { result } = renderHook(() =>
              useChunkedCode("a.ts", { prettierParser: "typescript" })
            )
            act(() => result.current.loadNextChunk())
            expect(result.current.status).toBe("LOADING")
          } else if (targetStatus === "ERROR") {
            vi.mocked(loadTextModel).mockRejectedValue(new Error("Failed"))
            const { result } = renderHook(() =>
              useChunkedCode("a.ts", { prettierParser: "typescript" })
            )
            await waitFor(() => expect(result.current.status).toBe("ERROR"))
            act(() => result.current.loadNextChunk())
            expect(result.current.status).toBe("ERROR")
          }
        }
      )
    )
  })

  it("PROPERTY: Sequential chunk exhaustion yields all chunks in order to totalLines", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 1 to 5 contiguous chunks
        fc.array(fc.integer({ min: 1, max: 20 }), {
          minLength: 1,
          maxLength: 5,
        }),
        async (chunkLengths) => {
          let currentLine = 0
          const chunksByLine: Record<number, CodeChunk> = {}

          chunkLengths.forEach((len, idx) => {
            const start = currentLine
            const end = currentLine + len
            const isLast = idx === chunkLengths.length - 1
            chunksByLine[start] = chunk({
              startLine: start,
              endLine: end,
              hasMore: !isLast,
              content: `chunk-${idx}`,
            })
            currentLine = end
          })

          const totalLines = currentLine
          const model = makeModel(chunksByLine, totalLines)
          vi.mocked(loadTextModel).mockResolvedValue(model)

          const { result } = renderHook(() =>
            useChunkedCode("file.ts", { prettierParser: "typescript" })
          )

          await waitFor(() => expect(result.current.status).toBe("SUCCESS"))

          let steps = 0
          while (result.current.hasMore && steps < 10) {
            act(() => {
              result.current.loadNextChunk()
            })
            steps++
          }

          expect(result.current.currentLine).toBe(totalLines)
          expect(result.current.hasMore).toBe(false)
          expect(result.current.status).toBe("SUCCESS")
        }
      ),
      { numRuns: 20 }
    )
  })

  it("PROPERTY: Rapid path changes with out-of-order resolution always land on the last requested path", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1 }), { minLength: 2, maxLength: 6 }),
        async (paths) => {
          const deferreds = paths.map(() => deferred<TextModel>())

          vi.mocked(loadTextModel).mockImplementation((path) => {
            const idx = paths.indexOf(path)
            return deferreds[idx].promise
          })

          const { result, rerender } = renderHook(
            ({ path }) =>
              useChunkedCode(path, { prettierParser: "typescript" }),
            { initialProps: { path: paths[0] } }
          )

          // Step through rapid path changes
          for (let i = 1; i < paths.length; i++) {
            rerender({ path: paths[i] })
          }

          // Shuffle resolution order
          const resolutionOrder = paths
            .map((_, i) => i)
            .sort(() => Math.random() - 0.5)

          for (const idx of resolutionOrder) {
            const pathName = paths[idx]
            const model = makeModel(
              { 0: chunk({ content: `content-${pathName}` }) },
              10
            )
            await act(async () => {
              deferreds[idx].resolve(model)
              await deferreds[idx].promise
            })
          }

          const lastPath = paths[paths.length - 1]
          await waitFor(() => expect(result.current.status).toBe("SUCCESS"))
          expect(result.current.currentChunk?.content).toBe(
            `content-${lastPath}`
          )
        }
      )
    )
  })
})
