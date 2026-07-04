import { act, renderHook, waitFor } from "@testing-library/react"
import init, { WasmHexGrid } from "some-hexagon"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useHexgridWasm } from "./use-hexgrid-wasm"

vi.mock("some-hexagon", () => ({
  default: vi.fn().mockResolvedValue(undefined),
  WasmHexGrid: vi.fn(),
}))

const validCell = {
  id: "hex_0_0_0",
  points: [{ x: 0, y: 0 }],
}

beforeEach(() => {
  vi.mocked(init).mockReset().mockResolvedValue(undefined)
  vi.mocked(WasmHexGrid).mockReset()
  vi.mocked(WasmHexGrid).mockImplementation(
    () =>
      ({
        get_all_cells_render_data: () => [validCell],
      }) as any
  )
})

describe("happy path", () => {
  it("generates hex cells on mount", async () => {
    const { result } = renderHook(() =>
      useHexgridWasm({ cellCount: 7, hexSize: 10 })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.hexCells).toEqual([validCell])
    expect(result.current.error).toBeNull()
    expect(init).toHaveBeenCalled()
  })

  it("getRadius derives the radius from cellCount", async () => {
    const { result } = renderHook(() =>
      useHexgridWasm({ cellCount: 19, hexSize: 10 })
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.getRadius()).toBe(2)
  })

  it("regenerate() re-runs the wasm generation", async () => {
    const { result } = renderHook(() =>
      useHexgridWasm({ cellCount: 7, hexSize: 10 })
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(WasmHexGrid).toHaveBeenCalledTimes(1)

    await act(async () => {
      await result.current.regenerate()
    })

    expect(WasmHexGrid).toHaveBeenCalledTimes(2)
  })
})

describe("input validation", () => {
  it("fails validation when cellCount is omitted (radius resolves to 0)", async () => {
    const { result } = renderHook(() => useHexgridWasm({ hexSize: 10 }))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).not.toBeNull()
    expect(result.current.hexCells).toEqual([])
    expect(WasmHexGrid).not.toHaveBeenCalled()
  })

  it("fails validation when cellCount is zero (radius resolves to 0)", async () => {
    const { result } = renderHook(() =>
      useHexgridWasm({ cellCount: 0, hexSize: 10 })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).not.toBeNull()
    expect(WasmHexGrid).not.toHaveBeenCalled()
  })

  it("fails validation when hexSize is not a positive integer", async () => {
    const { result } = renderHook(() =>
      useHexgridWasm({ cellCount: 7, hexSize: 1.5 })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).not.toBeNull()
    expect(WasmHexGrid).not.toHaveBeenCalled()
  })
})

describe("error handling", () => {
  it("surfaces a thrown Error from the wasm constructor", async () => {
    vi.mocked(WasmHexGrid).mockImplementation(() => {
      throw new Error("grid init failed")
    })

    const { result } = renderHook(() =>
      useHexgridWasm({ cellCount: 7, hexSize: 10 })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBe("grid init failed")
    expect(result.current.hexGridRef.current).toBeNull()
  })

  it("falls back to a generic message for a non-Error throw", async () => {
    vi.mocked(WasmHexGrid).mockImplementation(() => {
      throw "boom"
    })

    const { result } = renderHook(() =>
      useHexgridWasm({ cellCount: 7, hexSize: 10 })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBe("Unknown error")
  })

  it("surfaces an init() rejection", async () => {
    vi.mocked(init).mockRejectedValue(new Error("wasm load failed"))

    const { result } = renderHook(() =>
      useHexgridWasm({ cellCount: 7, hexSize: 10 })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBe("wasm load failed")
  })
})
