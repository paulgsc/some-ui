import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { ExtensionsComb } from "@honeycomb/components/extensions-comb"
import {
  EXTENSIONS,
  PRIVACY_LINE,
  STAGE_LINE,
} from "@honeycomb/components/extensions-comb/extensions.data"
import { useHexgridWasm } from "@honeycomb/hooks/use-hexgrid-wasm"
import type { HexRenderData } from "@honeycomb/types/hex-grid"
import { fireEvent, render, screen } from "@testing-library/react"
import type * as SomeUiUtils from "some-ui-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@honeycomb/hooks/use-hexgrid-wasm", () => ({
  useHexgridWasm: vi.fn(),
}))

vi.mock(
  "some-ui-utils",
  async (importOriginal): Promise<typeof SomeUiUtils> => ({
    ...(await importOriginal<typeof SomeUiUtils>()),
    useResizeObserver: (): { width: number; height: number } => ({
      width: 800,
      height: 800,
    }),
  })
)

/** A radius-1 pointy-top grid, laid out the way the WASM crate lays it out. */
function combCells(size: number): Array<HexRenderData> {
  const cubes: ReadonlyArray<readonly [number, number]> = [
    [0, 0],
    [1, -1],
    [1, 0],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [0, -1],
  ]
  return cubes.map(([q, r]) => {
    const cx = size * Math.sqrt(3) * (q + r / 2)
    const cy = size * 1.5 * r
    return {
      id: `hex_${q}_${r}_${-q - r}`,
      points: [0, 1, 2, 3, 4, 5].map((i) => {
        const a = ((60 * i - 30) * Math.PI) / 180
        return { x: cx + size * Math.cos(a), y: cy + size * Math.sin(a) }
      }),
    }
  })
}

beforeEach(() => {
  vi.mocked(useHexgridWasm).mockReturnValue({
    isLoading: false,
    error: null,
    validationWarning: null,
    hexCells: combCells(140),
    regenerate: vi.fn(),
    hexGridRef: { current: null },
    setHexCells: vi.fn(),
    getRadius: () => 1,
  })
})

function caption(): string {
  return document.querySelector("[aria-live]")?.textContent ?? ""
}

describe("ExtensionsComb", () => {
  it("paints the seven cells through HexGrid, with no sentence at rest", () => {
    const { container } = render(<ExtensionsComb />)
    expect(container.querySelectorAll("path.xcomb-wax")).toHaveLength(7)
    expect(caption()).toBe("")
    for (const ext of EXTENSIONS) {
      expect(screen.getByRole("button", { name: ext.name })).toBeTruthy()
    }
  })

  it("re-roles the comb as the picked extension, and says its sentence", () => {
    const ext = EXTENSIONS[1]
    if (!ext) throw new Error("fixture")
    render(<ExtensionsComb />)

    fireEvent.click(screen.getByRole("button", { name: ext.name }))
    expect(caption()).toBe(ext.line)
    expect(screen.queryByRole("button", { name: ext.name })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: /how far along/i }))
    expect(caption()).toBe(STAGE_LINE[ext.stage])

    fireEvent.click(screen.getByRole("button", { name: "Back" }))
    expect(caption()).toBe(ext.line)

    fireEvent.click(screen.getByRole("button", { name: "Back to all six" }))
    expect(caption()).toBe("")
  })

  it("activates a cell from the keyboard", () => {
    const ext = EXTENSIONS[0]
    if (!ext) throw new Error("fixture")
    render(<ExtensionsComb />)

    fireEvent.keyDown(screen.getByRole("button", { name: ext.name }), {
      key: "Enter",
    })
    fireEvent.keyDown(screen.getByRole("button", { name: "What it sends" }), {
      key: " ",
    })
    expect(caption()).toBe(PRIVACY_LINE)
  })

  it("keeps all seven cells at every depth", () => {
    const { container } = render(<ExtensionsComb />)
    const cells = (): number => container.querySelectorAll(".xcomb-cell").length
    expect(cells()).toBe(7)
    fireEvent.click(screen.getByRole("button", { name: EXTENSIONS[2]?.name }))
    expect(cells()).toBe(7)
    fireEvent.click(screen.getByRole("button", { name: "What it sends" }))
    expect(cells()).toBe(7)
  })
})

describe("ExtensionsComb paint", () => {
  // Every colour comes from the `.comb` skin in @some-ui/styles. The lint
  // rule that polices palette classes cannot see inline styles or .css
  // files, so this is the guard for them.
  it.each(["index.tsx", "index.css"])("%s names no colour literal", (file) => {
    const source = readFileSync(
      fileURLToPath(new URL(file, import.meta.url)),
      "utf8"
    )
    const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")
    expect(code).not.toMatch(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch)\(/i)
  })
})
