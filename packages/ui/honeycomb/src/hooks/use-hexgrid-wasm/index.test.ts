import { buildHexgrid, useHexgridWasm } from "@honeycomb/hooks/use-hexgrid-wasm"
import { getHexagonalGridRadiusForCellCount } from "@honeycomb/utils/hexagon-math"
import { initializeWasm } from "@honeycomb/utils/wasm-init"
import { WasmHexGrid } from "@some-ui/some-hexagon"
import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@some-ui/some-hexagon", () => {
  return {
    default: vi.fn().mockResolvedValue({}),
    WasmHexGrid: vi.fn(),
  }
})

vi.mock("@honeycomb/utils/hexagon-math", () => ({
  getHexagonalGridRadiusForCellCount: vi.fn(),
}))

vi.mock("@honeycomb/utils/wasm-init", () => ({
  initializeWasm: vi.fn(),
}))

const validCells = [
  {
    id: "hex_0_0_0",
    points: [{ x: 0, y: 0 }],
  },
]

/**
 * `WasmHexGrid` is a wasm-bindgen class; a plain mock can only ever
 * implement the one method (`get_all_cells_render_data`) these tests call,
 * never its full generated surface. This is the single, documented cast
 * that lets such a mock stand in for it.
 */
function createMockHexGrid(cells: unknown): WasmHexGrid {
  const mock = { get_all_cells_render_data: (): unknown => cells }
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see comment above
  return mock as WasmHexGrid
}

beforeEach(() => {
  vi.resetAllMocks()

  vi.mocked(initializeWasm).mockResolvedValue(undefined)
  vi.mocked(getHexagonalGridRadiusForCellCount).mockReturnValue(2)

  // Use a standard function so JavaScript can invoke it with `new`
  vi.mocked(WasmHexGrid).mockImplementation(() => {
    return createMockHexGrid(validCells)
  })
})

// ============================================================================
// 1. PURE COMPUTATION & VALIDATION (buildHexgrid)
// ============================================================================
describe("buildHexgrid", () => {
  it("initializes the wasm module", async () => {
    await buildHexgrid(2, 10)

    expect(initializeWasm).toHaveBeenCalledTimes(1)
  })

  it("constructs the wasm grid with the supplied radius and hex size", async () => {
    await buildHexgrid(5, 24)

    expect(WasmHexGrid).toHaveBeenCalledWith(5, 24)
  })

  it("returns validated cells", async () => {
    const result = await buildHexgrid(2, 10)

    expect(result.cells).toEqual(validCells)
    expect(result.hexGrid).toBeDefined()
  })

  it("propagates wasm initialization failures", async () => {
    vi.mocked(initializeWasm).mockRejectedValue(new Error("load failed"))

    await expect(buildHexgrid(2, 10)).rejects.toThrow("load failed")
  })

  it("rejects invalid wasm output mapping to schema", async () => {
    vi.mocked(WasmHexGrid).mockImplementation(() => {
      return createMockHexGrid([{ foo: "bar" }])
    })

    await expect(buildHexgrid(2, 10)).rejects.toThrow()
  })
})

// ============================================================================
// 2. HOOK ORCHESTRATION & STATE LIFECYCLE (useHexgridWasm)
// ============================================================================
describe("useHexgridWasm", () => {
  it("loads cells on mount and reflects loading state updates", async () => {
    const { result } = renderHook(() =>
      useHexgridWasm({
        cellCount: 7,
        hexSize: 10,
      })
    )

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBeNull()
    expect(result.current.hexCells).toEqual(validCells)
  })

  it("calculates radius from the supplied cell count via public contract", () => {
    const { result } = renderHook(() =>
      useHexgridWasm({
        cellCount: 42,
        hexSize: 10,
      })
    )

    expect(result.current.getRadius()).toBe(2)
    expect(getHexagonalGridRadiusForCellCount).toHaveBeenCalledWith(42)
  })

  it("rejects invalid input before creating the wasm grid", async () => {
    const { result } = renderHook(() =>
      useHexgridWasm({
        cellCount: 7,
        hexSize: 1.5, // Float violates the positive integer schema requirement
      })
    )

    await waitFor(() => expect(result.current.error).not.toBeNull())

    expect(WasmHexGrid).not.toHaveBeenCalled()
  })

  it("accepts radius 0, the minimum a fitting engine can negotiate down to", async () => {
    vi.mocked(getHexagonalGridRadiusForCellCount).mockReturnValue(0)

    const { result } = renderHook(() =>
      useHexgridWasm({
        cellCount: 1,
        hexSize: 10,
      })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBeNull()
    expect(WasmHexGrid).toHaveBeenCalledWith(0, 10)
  })

  it("regenerates the grid cleanly on explicit execution calls", async () => {
    const { result } = renderHook(() =>
      useHexgridWasm({
        cellCount: 7,
        hexSize: 10,
      })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(WasmHexGrid).toHaveBeenCalledTimes(1)

    await act(async () => {
      await result.current.regenerate()
    })

    expect(WasmHexGrid).toHaveBeenCalledTimes(2)
  })

  it("surfaces invalid wasm output structures gracefully", async () => {
    vi.mocked(WasmHexGrid).mockImplementation(() => {
      return createMockHexGrid([{ foo: "bar" }])
    })

    const { result } = renderHook(() =>
      useHexgridWasm({
        cellCount: 7,
        hexSize: 10,
      })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).not.toBeNull()
    expect(result.current.hexCells).toEqual([])
  })

  it("surfaces asynchronous wasm initialization failures", async () => {
    vi.mocked(initializeWasm).mockRejectedValue(new Error("wasm failed"))

    const { result } = renderHook(() =>
      useHexgridWasm({
        cellCount: 7,
        hexSize: 10,
      })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBe("wasm failed")
  })

  it("clears the mutable grid reference container on component unmount", async () => {
    const { result, unmount } = renderHook(() =>
      useHexgridWasm({
        cellCount: 7,
        hexSize: 10,
      })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.hexGridRef.current).not.toBeNull()

    unmount()

    expect(result.current.hexGridRef.current).toBeNull()
  })
})
