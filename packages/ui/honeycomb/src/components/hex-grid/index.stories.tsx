import { useHexgridWasm } from "@honeycomb/hooks/use-hexgrid-wasm"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { HexGrid } from "."
import type { HexCellData } from "."

type Story = StoryObj<typeof HexGrid>
type Meta = MetaObj<typeof HexGrid>

export default {
  title: "UI/Honeycomb/Components/HexGrid",
  component: HexGrid,
  parameters: {
    layout: "centered",
  },
} as Meta

export const ThemedCells: Story = {
  render: () => {
    // Dynamically access the WASM grid to get the real cell IDs
    const { hexCells } = useHexgridWasm({ cellCount: 37, hexSize: 25 })

    const colors = [
      "#FFB703",
      "#FB8500",
      "#219EBC",
      "#8ECAE6",
      "#FF006E",
      "#8338EC",
    ]

    const themedCells: HexCellData[] = hexCells
      .slice(0, colors.length)
      .map((cell, i) => ({
        id: cell.id,
        theme: {
          fill: colors[i],
          stroke: "#111",
          strokeWidth: 1,
          opacity: 0.9,
          filter: "url(#glow)",
        },
      }))

    return (
      <HexGrid
        cellCount={37}
        hexSize={25}
        viewBoxFactor={0.5}
        cells={themedCells}
      />
    )
  },
}

export const WithCustomRender: Story = {
  render: () => {
    const { hexCells } = useHexgridWasm({ cellCount: 19, hexSize: 30 })

    const labels = ["A", "B", "C"]
    const colors = ["#06D6A0", "#FFD166", "#EF476F"]

    const cells = hexCells.slice(0, labels.length).map((cell, i) => ({
      id: cell.id,
      data: { label: labels[i] },
      theme: { fill: colors[i], stroke: "#222", strokeWidth: 1 },
    }))

    return (
      <HexGrid
        cellCount={19}
        hexSize={30}
        cells={cells}
        renderCell={(cell, cx, cy) => (
          <text
            x={cx}
            y={cy + 4}
            fontSize="12"
            textAnchor="middle"
            fill="white"
            style={{ pointerEvents: "none", fontFamily: "monospace" }}
          >
            {cell.data?.label}
          </text>
        )}
      />
    )
  },
}

// 4️⃣ LoadingState – simulate when WASM is still initializing
export const LoadingState: Story = {
  render: () => (
    <div className="flex h-48 w-48 items-center justify-center bg-neutral-900 text-gray-300">
      Loading hexagon grid...
    </div>
  ),
}

// 5️⃣ ErrorState – mock error visualization
export const ErrorState: Story = {
  render: () => (
    <div className="flex h-48 w-48 items-center justify-center bg-neutral-900 text-red-400">
      Error: Failed to load hexgrid WASM
    </div>
  ),
}
