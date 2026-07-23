import { HANGUL_WORD_POOL } from "@honeycomb/data"
import type { UseHangulGameWasmOptions } from "@honeycomb/hooks/use-hangul-wasm"
import { useHangulGameWasm } from "@honeycomb/hooks/use-hangul-wasm"
import {
  getLastError,
  loadHangulWasm,
} from "@honeycomb/lib/hangul/hangul-wasm-runtime"
import type { WasmGameBridge } from "@honeycomb/lib/hangul/wasm-game-bridge"
import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@honeycomb/lib/hangul/hangul-wasm-runtime", () => ({
  loadHangulWasm: vi.fn(),
  getLastError: vi.fn(),
  getCoreInstance: vi.fn(),
}))

/**
 * `WasmGameBridge` has private fields, so a plain mock with only an `id`
 * (enough for these tests, which only assert referential identity) can
 * never satisfy it structurally. This is the single, documented cast that
 * lets such a stand-in pass as one.
 */
function asWasmGameBridge(bridge: { id: string }): WasmGameBridge {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see comment above
  return bridge as unknown as WasmGameBridge
}

beforeEach(() => {
  vi.mocked(loadHangulWasm).mockReset()
  vi.mocked(getLastError).mockReset()
})

describe("autoStart", () => {
  it("initializes automatically on mount when autoStart is true (default)", async () => {
    const bridge = { id: "bridge-1" }
    vi.mocked(loadHangulWasm).mockResolvedValue(asWasmGameBridge(bridge))

    const { result } = renderHook(() =>
      useHangulGameWasm({ mode: "completion" })
    )

    await waitFor(() => expect(result.current.isInitialized).toBe(true))

    expect(loadHangulWasm).toHaveBeenCalledWith(
      undefined,
      "completion",
      HANGUL_WORD_POOL
    )
    expect(result.current.gameBridge).toBe(bridge)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it("does not initialize automatically when autoStart is false", async () => {
    const { result } = renderHook(() =>
      useHangulGameWasm({ mode: "completion", autoStart: false })
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(loadHangulWasm).not.toHaveBeenCalled()
    expect(result.current.isInitialized).toBe(false)
  })
})

describe("manual initialize", () => {
  it("initializes when called manually", async () => {
    const bridge = { id: "bridge-2" }
    vi.mocked(loadHangulWasm).mockResolvedValue(asWasmGameBridge(bridge))

    const { result } = renderHook(() =>
      useHangulGameWasm({ mode: "endless", autoStart: false })
    )

    await act(async () => {
      await result.current.initialize()
    })

    expect(result.current.isInitialized).toBe(true)
    expect(result.current.gameBridge).toBe(bridge)
  })

  it("does not re-initialize once already initialized", async () => {
    const bridge = { id: "bridge-3" }
    vi.mocked(loadHangulWasm).mockResolvedValue(asWasmGameBridge(bridge))

    const { result } = renderHook(() =>
      useHangulGameWasm({ mode: "endless", autoStart: false })
    )

    await act(async () => {
      await result.current.initialize()
      await result.current.initialize()
    })

    expect(loadHangulWasm).toHaveBeenCalledTimes(1)
  })
})

describe("mode switching", () => {
  // Regression coverage: initializedRef's guard used to stay true forever
  // after the first successful load, so a mode prop change on an
  // already-initialized instance (no remount) silently kept the stale
  // mode's bridge instead of loading a new one.
  it("re-initializes when mode changes on an already-initialized instance", async () => {
    const completionBridge = { id: "completion-bridge" }
    const vocabularyBridge = { id: "vocabulary-bridge" }
    vi.mocked(loadHangulWasm).mockResolvedValueOnce(
      asWasmGameBridge(completionBridge)
    )

    const { result, rerender } = renderHook(
      (props: UseHangulGameWasmOptions) => useHangulGameWasm(props),
      { initialProps: { mode: "completion" } }
    )

    await waitFor(() => expect(result.current.isInitialized).toBe(true))
    expect(result.current.gameBridge).toBe(completionBridge)

    vi.mocked(loadHangulWasm).mockResolvedValueOnce(
      asWasmGameBridge(vocabularyBridge)
    )
    rerender({ mode: "vocabulary" })

    await waitFor(() =>
      expect(result.current.gameBridge).toBe(vocabularyBridge)
    )
    expect(loadHangulWasm).toHaveBeenCalledTimes(2)
    expect(loadHangulWasm).toHaveBeenLastCalledWith(
      undefined,
      "vocabulary",
      HANGUL_WORD_POOL
    )
  })

  it("does not re-initialize on a re-render with the same mode", async () => {
    const bridge = { id: "bridge-stable" }
    vi.mocked(loadHangulWasm).mockResolvedValue(asWasmGameBridge(bridge))

    const { result, rerender } = renderHook(
      (props: UseHangulGameWasmOptions) => useHangulGameWasm(props),
      { initialProps: { mode: "completion" } }
    )

    await waitFor(() => expect(result.current.isInitialized).toBe(true))

    rerender({ mode: "completion" })
    await act(async () => {
      await Promise.resolve()
    })

    expect(loadHangulWasm).toHaveBeenCalledTimes(1)
  })
})

describe("error handling", () => {
  it("surfaces the runtime's last error when loadHangulWasm resolves null", async () => {
    vi.mocked(loadHangulWasm).mockResolvedValue(null)
    vi.mocked(getLastError).mockReturnValue(new Error("wasm init failed"))

    const { result } = renderHook(() =>
      useHangulGameWasm({ mode: "completion" })
    )

    await waitFor(() => expect(result.current.error).toBe("wasm init failed"))
    expect(result.current.isInitialized).toBe(false)
    expect(result.current.isLoading).toBe(false)
  })

  it("falls back to a generic message when there is no last error", async () => {
    vi.mocked(loadHangulWasm).mockResolvedValue(null)
    vi.mocked(getLastError).mockReturnValue(null)

    const { result } = renderHook(() =>
      useHangulGameWasm({ mode: "completion" })
    )

    await waitFor(() =>
      expect(result.current.error).toBe("Unknown error loading Hangul WASM")
    )
  })

  it("captures a thrown Error's message", async () => {
    vi.mocked(loadHangulWasm).mockRejectedValue(new Error("boom"))

    const { result } = renderHook(() =>
      useHangulGameWasm({ mode: "completion" })
    )

    await waitFor(() => expect(result.current.error).toBe("boom"))
  })

  it("stringifies a thrown non-Error value", async () => {
    vi.mocked(loadHangulWasm).mockRejectedValue("some string failure")

    const { result } = renderHook(() =>
      useHangulGameWasm({ mode: "completion" })
    )

    await waitFor(() =>
      expect(result.current.error).toBe("some string failure")
    )
  })
})
