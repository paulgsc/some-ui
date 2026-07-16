import type { TextModel } from "@leetype/lib/leetype/load-code-file"
import { loadTextModel } from "@leetype/lib/leetype/load-code-file"
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useFormattedCode } from "."

// ═══════════════════════════════════════════════════════════════════════════
// S6 — use-formatted-code.ts mirrors use-chunked-code.ts's race/cancellation
// shape (5s timeout vs. `loadTextModel`, a `cancelled` flag across path/
// parser changes) but formats the result through prettier. The
// "rust"/"cpp" parser branch is a pure pass-through (`formatCode` just
// returns `raw`), so the timing/cancellation tests below use it to stay
// focused on the effect-timing risk #555 calls out, without needing to
// exercise prettier's own (already-a-real-dependency) formatting logic.
// One end-to-end test exercises the real "typescript" prettier path to
// confirm the two are wired together correctly.
// ═══════════════════════════════════════════════════════════════════════════

vi.mock("@leetype/lib/leetype/load-code-file", () => ({
  loadTextModel: vi.fn(),
}))

function makeModel(chunk: { content: string; hasMore: boolean }): TextModel {
  const fake = {
    getChunk: vi.fn(() => ({
      content: chunk.content,
      startLine: 0,
      endLine: 5,
      hasMore: chunk.hasMore,
    })),
    getTotalLines: vi.fn(() => 5),
  }
  // `TextModel`'s real fields are private, so a fake exposing only the two
  // methods `useFormattedCode` calls can never satisfy it structurally.
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
  vi.unstubAllGlobals()
})

describe("pass-through parsers (rust/cpp) — load/error/timeout timing", () => {
  it("goes IDLE -> LOADING -> SUCCESS with the raw content unchanged", async () => {
    vi.mocked(loadTextModel).mockResolvedValue(
      makeModel({ content: "fn main() {}", hasMore: false })
    )

    const { result } = renderHook(() =>
      useFormattedCode("main.rs", { prettierParser: "rust" })
    )
    expect(result.current.status).toBe("LOADING")

    await waitFor(() => expect(result.current.status).toBe("SUCCESS"))
    expect(result.current.code).toBe("fn main() {}")
  })

  it("resets to IDLE without calling the loader when path is empty", () => {
    const { result } = renderHook(() =>
      useFormattedCode("", { prettierParser: "rust" })
    )

    expect(result.current.status).toBe("IDLE")
    expect(loadTextModel).not.toHaveBeenCalled()
  })

  it("fetches the rest of the file via fetch() when the first chunk hasMore", async () => {
    vi.mocked(loadTextModel).mockResolvedValue(
      makeModel({ content: "partial", hasMore: true })
    )
    const fetchMock = vi.fn(() =>
      Promise.resolve({ text: () => Promise.resolve("full file contents") })
    )
    vi.stubGlobal("fetch", fetchMock)

    const { result } = renderHook(() =>
      useFormattedCode("big.cpp", { prettierParser: "cpp" })
    )

    await waitFor(() => expect(result.current.status).toBe("SUCCESS"))
    expect(fetchMock).toHaveBeenCalledWith(
      "big.cpp",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    expect(result.current.code).toBe("full file contents")
  })

  it("ignores a stale resolve from a superseded path", async () => {
    const gateA = deferred<TextModel>()
    const gateB = deferred<TextModel>()
    vi.mocked(loadTextModel)
      .mockImplementationOnce(() => gateA.promise)
      .mockImplementationOnce(() => gateB.promise)

    const { result, rerender } = renderHook(
      (props: { path: string }) =>
        useFormattedCode(props.path, { prettierParser: "rust" }),
      { initialProps: { path: "a.rs" } }
    )

    rerender({ path: "b.rs" })

    await act(async () => {
      gateB.resolve(makeModel({ content: "B", hasMore: false }))
      await gateB.promise
    })
    await waitFor(() => expect(result.current.status).toBe("SUCCESS"))
    expect(result.current.code).toBe("B")

    await act(async () => {
      gateA.resolve(makeModel({ content: "A", hasMore: false }))
      await gateA.promise
    })

    expect(result.current.code).toBe("B")
  })

  it("surfaces a rejected load as ERROR with the error message", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.mocked(loadTextModel).mockRejectedValue(new Error("file not found"))

    const { result } = renderHook(() =>
      useFormattedCode("missing.rs", { prettierParser: "rust" })
    )

    await waitFor(() => expect(result.current.status).toBe("ERROR"))
    expect(result.current.error?.message).toBe("file not found")
    expect(result.current.code).toBeUndefined()

    errorSpy.mockRestore()
  })

  it("moves to ERROR after TIMEOUT_MS if the loader never settles", async () => {
    vi.useFakeTimers()
    vi.mocked(loadTextModel).mockImplementation(() => new Promise(() => {}))

    const { result } = renderHook(() =>
      useFormattedCode("slow.rs", { prettierParser: "rust" })
    )
    expect(result.current.status).toBe("LOADING")

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(result.current.status).toBe("ERROR")
    expect(result.current.error?.message).toMatch(/Timeout after 5000ms/)
  })
})

describe("typescript/babel parser — real prettier integration", () => {
  it("formats raw source through the real prettier pipeline", async () => {
    vi.mocked(loadTextModel).mockResolvedValue(
      makeModel({ content: "const x=1", hasMore: false })
    )

    const { result } = renderHook(() =>
      useFormattedCode("main.ts", { prettierParser: "typescript" })
    )

    await waitFor(() => expect(result.current.status).toBe("SUCCESS"), {
      timeout: 10_000,
    })

    expect(result.current.code).toBe("const x = 1;\n")
  }, 15_000)
})
