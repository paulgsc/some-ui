import { createCrossword } from "@input/lib/crossword-grid"
import type { Meta as MetaObj, StoryObj } from "@storybook/react"

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

const { grid, size } = createCrossword(words, 10)

export const Default: Story = {
  args: {
    cell: grid[0],
    cellSize: size,
  },
  render: (args) => (
    <svg viewBox="0 0 60 60" className="size-48 border border-red-500">
      <CrosswordCellSvg {...args} />
    </svg>
  ),
}

export default {
  title: "UI/Input/Components/CrosswordCellSvg",
  component: CrosswordCellSvg,
} as Meta
