import type { CodeChunk, TextModel } from "@input/lib/leetype/load-code-file"
import { loadTextModel } from "@input/lib/leetype/load-code-file"
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useChunkedCode } from "./use-chunked-code"

// ═══════════════════════════════════════════════════════════════════════════
// S6 — use-chunked-code.ts's load effect (:60-136) races a 5s timeout
// against `loadTextModel`, tracks a `cancelled` flag across path changes,
// and resets `currentLine` to 0 on every new path. These are exactly the
// "does the effect re-fire the right number of times, and does a stale
// resolve get ignored" invariants #555 flags as the highest-risk class in
// this paydown — pinned here before any set-state-in-effect/
// exhaustive-deps fix touches the hook.
//
// `loadTextModel` is mocked directly (it owns a module-level path cache
// with no reset hook, and calls real `fetch` — mocking at this boundary,
// like the wasm-bridge tests mock their crate, keeps timing fully
// controllable per test).
// ═══════════════════════════════════════════════════════════════════════════

vi.mock("@input/lib/leetype/load-code-file", () => ({
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
  // `TextModel`'s real fields are private, so a fake exposing only the two
  // methods `useChunkedCode` calls can never satisfy it structurally.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see comment above
  return fake as unknown as TextModel
}

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

beforeEach(() => {
  vi.mocked(loadTextModel).mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("initial load", () => {
  it("goes IDLE -> LOADING -> SUCCESS and stores the first chunk", async () => {
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
    expect(loadTextModel).toHaveBeenCalledTimes(1)
  })

  it("resets to IDLE without calling the loader when path is empty", () => {
    const { result } = renderHook(() =>
      useChunkedCode("", { prettierParser: "typescript" })
    )

    expect(result.current.status).toBe("IDLE")
    expect(loadTextModel).not.toHaveBeenCalled()
  })
})

describe("path change cancellation", () => {
  it("ignores a stale resolve from the previous path once a new path has started loading", async () => {
    const gateA = deferred<TextModel>()
    const gateB = deferred<TextModel>()
    vi.mocked(loadTextModel)
      .mockImplementationOnce(() => gateA.promise)
      .mockImplementationOnce(() => gateB.promise)

    const { result, rerender } = renderHook(
      (props: { path: string }) =>
        useChunkedCode(props.path, { prettierParser: "typescript" }),
      { initialProps: { path: "a.ts" } }
    )
    expect(result.current.status).toBe("LOADING")

    rerender({ path: "b.ts" })
    expect(result.current.status).toBe("LOADING")
    expect(result.current.currentLine).toBe(0)

    const modelB = makeModel(
      { 0: chunk({ startLine: 0, endLine: 8, hasMore: false, content: "B" }) },
      8
    )
    await act(async () => {
      gateB.resolve(modelB)
      await gateB.promise
    })
    await waitFor(() => expect(result.current.status).toBe("SUCCESS"))
    expect(result.current.currentChunk?.content).toBe("B")

    // A's effect cleanup already set `cancelled = true` for that run when
    // the path changed — resolving it now must not clobber B's state.
    const modelA = makeModel(
      { 0: chunk({ startLine: 0, endLine: 3, hasMore: true, content: "A" }) },
      3
    )
    await act(async () => {
      gateA.resolve(modelA)
      await gateA.promise
    })

    expect(result.current.currentChunk?.content).toBe("B")
    expect(result.current.status).toBe("SUCCESS")
  })
})

describe("loadNextChunk", () => {
  it("no-ops while status is not SUCCESS", () => {
    const gate = deferred<TextModel>()
    vi.mocked(loadTextModel).mockImplementation(() => gate.promise)

    const { result } = renderHook(() =>
      useChunkedCode("file.ts", { prettierParser: "typescript" })
    )
    expect(result.current.status).toBe("LOADING")

    act(() => {
      result.current.loadNextChunk()
    })

    expect(result.current.currentChunk).toBeUndefined()
  })

  it("no-ops once hasMore is false", async () => {
    const model = makeModel(
      { 0: chunk({ startLine: 0, endLine: 5, hasMore: false }) },
      5
    )
    vi.mocked(loadTextModel).mockResolvedValue(model)

    const { result } = renderHook(() =>
      useChunkedCode("file.ts", { prettierParser: "typescript" })
    )
    await waitFor(() => expect(result.current.status).toBe("SUCCESS"))

    act(() => {
      result.current.loadNextChunk()
    })

    expect(model.getChunk).toHaveBeenCalledTimes(1) // only the initial getChunk(0)
  })

  it("advances currentLine and replaces currentChunk when hasMore is true", async () => {
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
    expect(result.current.currentChunk?.content).toBe("first")

    act(() => {
      result.current.loadNextChunk()
    })

    expect(result.current.currentChunk?.content).toBe("second")
    expect(result.current.currentLine).toBe(10)
    expect(result.current.hasMore).toBe(false)
  })
})

describe("timeout", () => {
  it("moves to ERROR after TIMEOUT_MS if the loader never settles", async () => {
    vi.useFakeTimers()
    vi.mocked(loadTextModel).mockImplementation(() => new Promise(() => {}))

    const { result } = renderHook(() =>
      useChunkedCode("file.ts", { prettierParser: "typescript" })
    )
    expect(result.current.status).toBe("LOADING")

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(result.current.status).toBe("ERROR")
    expect(result.current.error?.message).toMatch(/Timeout after 5000ms/)
  })
})
