import { HexGrid } from "@honeycomb/components/hex-grid"
import type { HexGridGeometry } from "@honeycomb/hooks/use-hexgrid-wasm"
import { render } from "@testing-library/react"
import { toast } from "sonner"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), warning: vi.fn(), dismiss: vi.fn() },
}))

vi.mock("@some-ui/react-hooks", () => ({
  useResizeObserver: (): { width: number; height: number } => ({
    width: 400,
    height: 400,
  }),
}))

function grid(overrides: Partial<HexGridGeometry> = {}): HexGridGeometry {
  return {
    radius: 1,
    hexSize: 40,
    isLoading: false,
    error: null,
    hexCells: [],
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(toast.info).mockReset()
})

describe("HexGrid load status", () => {
  it("renders the grid's load error in its place", () => {
    const { container } = render(
      <HexGrid grid={grid({ error: "WASM init failed" })} />
    )
    expect(container.textContent).toContain("WASM init failed")
  })
})

describe("HexGrid fit notices", () => {
  // The mocked box is 400x400; a radius-1 grid at hexSize 200 needs ~1039x1000
  // at natural size, so it has to shrink to fit.
  it("toasts a shrunk fit by default", () => {
    render(<HexGrid grid={grid({ hexSize: 200 })} />)
    expect(toast.info).toHaveBeenCalledTimes(1)
  })

  it("stays quiet with notifyFit={false}", () => {
    render(<HexGrid grid={grid({ hexSize: 200 })} notifyFit={false} />)
    expect(toast.info).not.toHaveBeenCalled()
  })
})

describe("HexGrid loading fallback", () => {
  it("renders the default loading line", () => {
    const { container } = render(<HexGrid grid={grid({ isLoading: true })} />)
    expect(container.textContent).toContain("Loading hexagon grid")
  })

  it("renders nothing but its box with fallback={null}", () => {
    const { container } = render(
      <HexGrid grid={grid({ isLoading: true })} fallback={null} />
    )
    expect(container.textContent).toBe("")
  })
})

describe("HexGrid cell theme", () => {
  it("puts theme.className on the cell path", () => {
    const { container } = render(
      <HexGrid
        grid={grid({
          radius: 0,
          hexSize: 10,
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
        })}
        cellContent={[
          { id: "hex_0_0_0", content: { data: {}, theme: { className: "x" } } },
        ]}
      />
    )
    expect(container.querySelectorAll("path.x")).toHaveLength(1)
  })
})
