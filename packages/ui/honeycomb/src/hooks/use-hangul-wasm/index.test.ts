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
 * `WasmGameBridge` has private fields; these tests assert only identity, so
 * an `{ id }` stand-in is cast to it here, once.
 */
function asWasmGameBridge(bridge: { id: string }): WasmGameBridge {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see comment above
  return bridge as unknown as WasmGameBridge
}

beforeEach(() => {
  vi.mocked(loadHangulWasm).mockReset()
  vi.mocked(getLastError).mockReset()
})

describe("initial load", () => {
  it("initializes on mount", async () => {
    const bridge = { id: "bridge-1" }
    vi.mocked(loadHangulWasm).mockResolvedValue(asWasmGameBridge(bridge))

    const { result } = renderHook(() =>
      useHangulGameWasm({ mode: "completion" })
    )

    await waitFor(() => expect(result.current.isInitialized).toBe(true))

    expect(loadHangulWasm).toHaveBeenCalledWith(
      undefined,
      "completion",
      HANGUL_WORD_POOL,
      undefined
    )
    expect(result.current.gameBridge).toBe(bridge)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it("initializes under StrictMode's mount, unmount and remount", async () => {
    const bridge = { id: "strict-bridge" }
    vi.mocked(loadHangulWasm).mockResolvedValue(asWasmGameBridge(bridge))

    const { result } = renderHook(
      () => useHangulGameWasm({ mode: "completion" }),
      { reactStrictMode: true }
    )

    await waitFor(() => expect(result.current.isInitialized).toBe(true))
    expect(result.current.gameBridge).toBe(bridge)
    expect(result.current.isLoading).toBe(false)
  })
})

describe("mode switching", () => {
  it.each<[string, UseHangulGameWasmOptions, UseHangulGameWasmOptions]>([
    [
      "re-initializes when mode changes on an already-initialized instance",
      { mode: "completion" },
      { mode: "vocabulary" },
    ],
    [
      "re-initializes when sessionKey changes even though mode stays the same",
      { mode: "completion", sessionKey: "session-a" },
      { mode: "completion", sessionKey: "session-b" },
    ],
  ])("%s", async (_, initialProps, nextProps) => {
    const firstBridge = { id: "first-bridge" }
    const secondBridge = { id: "second-bridge" }
    vi.mocked(loadHangulWasm).mockResolvedValueOnce(
      asWasmGameBridge(firstBridge)
    )

    const { result, rerender } = renderHook(
      (props: UseHangulGameWasmOptions) => useHangulGameWasm(props),
      { initialProps }
    )

    await waitFor(() => expect(result.current.isInitialized).toBe(true))
    expect(result.current.gameBridge).toBe(firstBridge)

    vi.mocked(loadHangulWasm).mockResolvedValueOnce(
      asWasmGameBridge(secondBridge)
    )
    rerender(nextProps)

    await waitFor(() => expect(result.current.gameBridge).toBe(secondBridge))
    expect(loadHangulWasm).toHaveBeenCalledTimes(2)
    expect(loadHangulWasm).toHaveBeenLastCalledWith(
      undefined,
      nextProps.mode,
      HANGUL_WORD_POOL,
      nextProps.sessionKey
    )
  })

  it("keeps the newer mode's bridge when the older load finishes last", async () => {
    const firstBridge = { id: "first-bridge" }
    const secondBridge = { id: "second-bridge" }
    let finishFirst = (): void => {}
    vi.mocked(loadHangulWasm)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishFirst = (): void => resolve(asWasmGameBridge(firstBridge))
          })
      )
      .mockResolvedValueOnce(asWasmGameBridge(secondBridge))

    const { result, rerender } = renderHook(
      (props: UseHangulGameWasmOptions) => useHangulGameWasm(props),
      { initialProps: { mode: "completion" } }
    )
    rerender({ mode: "vocabulary" })
    await waitFor(() => expect(result.current.gameBridge).toBe(secondBridge))

    await act(async () => {
      finishFirst()
      await Promise.resolve()
    })

    expect(result.current.gameBridge).toBe(secondBridge)
  })

  it("forwards a given sessionKey on initial mount", async () => {
    const bridge = { id: "session-a-bridge" }
    vi.mocked(loadHangulWasm).mockResolvedValue(asWasmGameBridge(bridge))

    const { result } = renderHook(() =>
      useHangulGameWasm({ mode: "completion", sessionKey: "session-a" })
    )

    await waitFor(() => expect(result.current.isInitialized).toBe(true))

    expect(loadHangulWasm).toHaveBeenCalledWith(
      undefined,
      "completion",
      HANGUL_WORD_POOL,
      "session-a"
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

  it.each<[string, unknown, string]>([
    ["captures a thrown Error's message", new Error("boom"), "boom"],
    [
      "stringifies a thrown non-Error value",
      "some string failure",
      "some string failure",
    ],
  ])("%s", async (_, thrown, message) => {
    vi.mocked(loadHangulWasm).mockRejectedValue(thrown)

    const { result } = renderHook(() =>
      useHangulGameWasm({ mode: "completion" })
    )

    await waitFor(() => expect(result.current.error).toBe(message))
  })
})
