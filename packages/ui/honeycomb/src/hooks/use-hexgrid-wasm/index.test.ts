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

/** `WasmHexGrid` is a wasm-bindgen class; a partial mock needs this one cast. */
function createMockHexGrid(cells: unknown): WasmHexGrid {
  const mock = { get_all_cells_render_data: (): unknown => cells }
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see comment above
  return mock as WasmHexGrid
}

beforeEach(() => {
  vi.resetAllMocks()

  vi.mocked(initializeWasm).mockResolvedValue(undefined)
  vi.mocked(getHexagonalGridRadiusForCellCount).mockReturnValue(2)

  // A `function`, not an arrow: it is called with `new`, and an arrow has no
  // [[Construct]].
  // eslint-disable-next-line prefer-arrow-callback -- see comment above
  vi.mocked(WasmHexGrid).mockImplementation(function () {
    return createMockHexGrid(validCells)
  })
})

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
    expect(await buildHexgrid(2, 10)).toEqual(validCells)
  })

  it("propagates wasm initialization failures", async () => {
    vi.mocked(initializeWasm).mockRejectedValue(new Error("load failed"))

    await expect(buildHexgrid(2, 10)).rejects.toThrow("load failed")
  })

  it("rejects invalid wasm output mapping to schema", async () => {
    // eslint-disable-next-line prefer-arrow-callback -- must be `new`-able, see beforeEach above
    vi.mocked(WasmHexGrid).mockImplementation(function () {
      return createMockHexGrid([{ foo: "bar" }])
    })

    await expect(buildHexgrid(2, 10)).rejects.toThrow()
  })
})

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

  it("builds at the radius for the supplied cell count", async () => {
    const { result } = renderHook(() =>
      useHexgridWasm({
        cellCount: 42,
        hexSize: 10,
      })
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(getHexagonalGridRadiusForCellCount).toHaveBeenCalledWith(42)
    expect(WasmHexGrid).toHaveBeenCalledWith(2, 10)
    expect(result.current).toMatchObject({ radius: 2, hexSize: 10 })
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

  it("surfaces invalid wasm output structures gracefully", async () => {
    // eslint-disable-next-line prefer-arrow-callback -- must be `new`-able, see beforeEach above
    vi.mocked(WasmHexGrid).mockImplementation(function () {
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

  it("ignores a load that finishes after its size was superseded", async () => {
    let finishFirst = (): void => {}
    vi.mocked(initializeWasm)
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishFirst = resolve
          })
      )
      .mockResolvedValue(undefined)
    // eslint-disable-next-line prefer-arrow-callback -- must be `new`-able, see beforeEach above
    vi.mocked(WasmHexGrid).mockImplementation(function (_radius, size) {
      return createMockHexGrid([{ id: `hex_${size}`, points: [] }])
    })

    const { result, rerender } = renderHook(
      ({ hexSize }: { hexSize: number }) =>
        useHexgridWasm({ cellCount: 7, hexSize }),
      { initialProps: { hexSize: 10 } }
    )
    rerender({ hexSize: 20 })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      finishFirst()
      await Promise.resolve()
    })

    expect(result.current.hexCells).toEqual([{ id: "hex_20", points: [] }])
  })
})
