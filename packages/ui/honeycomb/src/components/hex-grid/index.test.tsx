import { HexGrid } from "@honeycomb/components/hex-grid"
import { useHexgridWasm } from "@honeycomb/hooks/use-hexgrid-wasm"
import { render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@honeycomb/hooks/use-hexgrid-wasm", () => ({
  useHexgridWasm: vi.fn(),
}))

vi.mock("some-ui-utils", () => ({
  useResizeObserver: (): { width: number; height: number } => ({
    width: 400,
    height: 400,
  }),
}))

function mockUseHexgridWasm(
  overrides: Partial<ReturnType<typeof useHexgridWasm>> = {}
): void {
  vi.mocked(useHexgridWasm).mockReturnValue({
    isLoading: false,
    error: null,
    validationWarning: null,
    hexCells: [],
    regenerate: vi.fn(),
    hexGridRef: { current: null },
    setHexCells: vi.fn(),
    getRadius: () => 1,
    ...overrides,
  })
}

beforeEach(() => {
  vi.mocked(useHexgridWasm).mockReset()
})

describe("HexGrid onStatusChange", () => {
  // Regression coverage: HexGrid's own hex-geometry WASM failure previously
  // had no way to reach anything outside it - a parent orchestrating a game
  // loop, audio, or timers around the grid had no signal to stop on a fatal
  // load failure. onStatusChange is that signal.
  it("reports the underlying wasm hook's loading/error status", () => {
    mockUseHexgridWasm({ isLoading: true, error: null })
    const onStatusChange = vi.fn()

    render(
      <HexGrid cellCount={7} hexSize={40} onStatusChange={onStatusChange} />
    )

    expect(onStatusChange).toHaveBeenCalledWith({
      isLoading: true,
      error: null,
    })
  })

  it("reports a fatal error", () => {
    mockUseHexgridWasm({ isLoading: false, error: "WASM init failed" })
    const onStatusChange = vi.fn()

    render(
      <HexGrid cellCount={7} hexSize={40} onStatusChange={onStatusChange} />
    )

    expect(onStatusChange).toHaveBeenLastCalledWith({
      isLoading: false,
      error: "WASM init failed",
    })
  })

  it("reports recovery back to a healthy status", () => {
    mockUseHexgridWasm({ isLoading: false, error: "WASM init failed" })
    const onStatusChange = vi.fn()

    const { rerender } = render(
      <HexGrid cellCount={7} hexSize={40} onStatusChange={onStatusChange} />
    )
    expect(onStatusChange).toHaveBeenLastCalledWith({
      isLoading: false,
      error: "WASM init failed",
    })

    mockUseHexgridWasm({ isLoading: false, error: null })
    rerender(
      <HexGrid cellCount={7} hexSize={40} onStatusChange={onStatusChange} />
    )

    expect(onStatusChange).toHaveBeenLastCalledWith({
      isLoading: false,
      error: null,
    })
  })

  it("does not throw when onStatusChange is omitted", () => {
    mockUseHexgridWasm({ isLoading: false, error: "WASM init failed" })

    expect(() => render(<HexGrid cellCount={7} hexSize={40} />)).not.toThrow()
  })
})
