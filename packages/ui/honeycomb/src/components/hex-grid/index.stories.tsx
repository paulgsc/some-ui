import { useHexgridWasm } from "@honeycomb/hooks/use-hexgrid-wasm"
import type { HexCellData } from "@honeycomb/types/hex-grid"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { HexGrid } from "."

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

    // Fixed: map to the correct structure { id, content: { data, theme } }
    const cellContent = hexCells.slice(0, colors.length).map((cell, i) => ({
      id: cell.id,
      content: {
        data: {}, // Fixed: Property 'data' is required in HexCellData
        theme: {
          fill: colors[i],
          stroke: "#111",
          strokeWidth: 1,
          opacity: 0.9,
          filter: "url(#glow)",
        },
      } as HexCellData<Record<string, never>>,
    }))

    return (
      <div className="h-[500px] w-[500px]">
        <HexGrid
          cellCount={37}
          hexSize={25}
          viewBoxFactor={0.5}
          cellContent={cellContent} // Fixed: Property 'cells' does not exist
        />
      </div>
    )
  },
}

export const WithCustomRender: Story = {
  render: () => {
    // Defining a local type for the custom data
    type CustomData = { label: string }

    const { hexCells } = useHexgridWasm({ cellCount: 19, hexSize: 30 })

    const labels = ["A", "B", "C"]
    const colors = ["#06D6A0", "#FFD166", "#EF476F"]

    const cellContent = hexCells.slice(0, labels.length).map((cell, i) => ({
      id: cell.id,
      content: {
        data: { label: labels[i] ?? "" },
        theme: { fill: colors[i], stroke: "#222", strokeWidth: 1 },
      } as HexCellData<CustomData>,
    }))

    return (
      <div className="h-[500px] w-[500px]">
        <HexGrid<CustomData>
          cellCount={19}
          hexSize={30}
          cellContent={cellContent} // Fixed: Property 'cells' does not exist
          renderCell={(cell, cx, cy) => (
            <text
              key={`label-${cell.id}`}
              x={cx}
              y={cy + 4}
              fontSize="12"
              textAnchor="middle"
              fill="white"
              style={{ pointerEvents: "none", fontFamily: "monospace" }}
            >
              {/* Fixed: Data exists on cell.content.data */}
              {cell.content?.data.label}
            </text>
          )}
        />
      </div>
    )
  },
}

export const LoadingState: Story = {
  render: () => (
    <div className="flex h-48 w-48 items-center justify-center bg-neutral-900 text-gray-300">
      Loading hexagon grid...
    </div>
  ),
}

export const ErrorState: Story = {
  render: () => (
    <div className="flex h-48 w-48 items-center justify-center bg-neutral-900 text-red-400">
      Error: Failed to load hexgrid WASM
    </div>
  ),
}
