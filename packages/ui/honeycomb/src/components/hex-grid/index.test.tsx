import { HexGrid } from "@honeycomb/components/hex-grid"
import { useHexgridWasm } from "@honeycomb/hooks/use-hexgrid-wasm"
import { render } from "@testing-library/react"
import { toast } from "sonner"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@honeycomb/hooks/use-hexgrid-wasm", () => ({
  useHexgridWasm: vi.fn(),
}))

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), warning: vi.fn(), dismiss: vi.fn() },
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
  vi.mocked(toast.info).mockReset()
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

describe("HexGrid fit notices", () => {
  // The mocked box is 400x400; a radius-1 grid at hexSize 200 needs ~1039x1000
  // at natural size, so it has to shrink to fit.
  it("toasts a shrunk fit by default", () => {
    mockUseHexgridWasm()
    render(<HexGrid cellCount={7} hexSize={200} />)
    expect(toast.info).toHaveBeenCalledTimes(1)
  })

  it("stays quiet with notifyFit={false}, but still reports the fit", () => {
    mockUseHexgridWasm()
    const onFitChange = vi.fn()
    render(
      <HexGrid
        cellCount={7}
        hexSize={200}
        notifyFit={false}
        onFitChange={onFitChange}
      />
    )
    expect(toast.info).not.toHaveBeenCalled()
    expect(onFitChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: "shrunk" })
    )
  })
})

describe("HexGrid loading fallback", () => {
  it("renders the default loading line", () => {
    mockUseHexgridWasm({ isLoading: true })
    const { container } = render(<HexGrid cellCount={7} hexSize={40} />)
    expect(container.textContent).toContain("Loading hexagon grid")
  })

  it("renders nothing but its box with fallback={null}", () => {
    mockUseHexgridWasm({ isLoading: true })
    const { container } = render(
      <HexGrid cellCount={7} hexSize={40} fallback={null} />
    )
    expect(container.textContent).toBe("")
  })
})

describe("HexGrid cell theme", () => {
  it("puts theme.className on the cell path", () => {
    mockUseHexgridWasm({
      hexCells: [
        {
          id: "hex_0_0_0",
          points: [
            { x: 0, y: -10 },
            { x: 8.66, y: -5 },
            { x: 8.66, y: 5 },
            { x: 0, y: 10 },
            { x: -8.66, y: 5 },
            { x: -8.66, y: -5 },
          ],
        },
      ],
    })
    const { container } = render(
      <HexGrid
        cellCount={1}
        hexSize={10}
        cellContent={[
          { id: "hex_0_0_0", content: { data: {}, theme: { className: "x" } } },
        ]}
      />
    )
    expect(container.querySelectorAll("path.x")).toHaveLength(1)
  })
})
