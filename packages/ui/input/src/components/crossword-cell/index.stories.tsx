import { createCrossword } from "@input/lib/crossword-grid"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { CrosswordCellSvg } from "."

type Story = StoryObj<typeof CrosswordCellSvg>
type Meta = MetaObj<typeof CrosswordCellSvg>

const words = [
  "JAVASCRIPT",
  "TYPESCRIPT",
  "REACT",
  "ANGULAR",
  "VUE",
  "NODE",
  "EXPRESS",
  "MONGODB",
  "HTML",
  "CSS",
  "REDUX",
  "WEBPACK",
  "BABEL",
  "PROGRAMMING",
  "ALGORITHM",
  "CODING",
  "FUNCTION",
  "VARIABLE",
  "OBJECT",
  "ARRAY",
]

const result = createCrossword(words, 10)

export const Default: Story = {
  args: {
    // Falls back gracefully if the grid array happens to be empty
    cell: result.grid[0],
    // Read cleanly across both union variants safely
    cellSize:
      "crosswordGrid" in result ? result.crosswordGrid.size : result.size,
  },
  render: (args) => (
    <svg viewBox="0 0 60 60" className="size-48 border border-red-500">
      <CrosswordCellSvg {...args} />
    </svg>
  ),
}

const meta: Meta = {
  title: "UI/Input/Components/CrosswordCellSvg",
  component: CrosswordCellSvg,
}

export default meta
