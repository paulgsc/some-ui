import { useHangulGameWasm } from "@honeycomb/hooks/use-hangul-wasm"
import {
  getLastError,
  loadHangulWasm,
} from "@honeycomb/lib/hangul/hangul-wasm-runtime"
import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@honeycomb/lib/hangul/hangul-wasm-runtime", () => ({
  loadHangulWasm: vi.fn(),
  getLastError: vi.fn(),
  getCoreInstance: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(loadHangulWasm).mockReset()
  vi.mocked(getLastError).mockReset()
})

describe("autoStart", () => {
  it("initializes automatically on mount when autoStart is true (default)", async () => {
    const bridge = { id: "bridge-1" }
    vi.mocked(loadHangulWasm).mockResolvedValue(bridge as any)

    const { result } = renderHook(() =>
      useHangulGameWasm({ mode: "completion" })
    )

    await waitFor(() => expect(result.current.isInitialized).toBe(true))

    expect(loadHangulWasm).toHaveBeenCalledWith(undefined, "completion")
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
    vi.mocked(loadHangulWasm).mockResolvedValue(bridge as any)

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
    vi.mocked(loadHangulWasm).mockResolvedValue(bridge as any)

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
