import { createCrossword } from "@input/lib/crossword-grid"
import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { CrosswordGridSvg } from "."

type Story = StoryObj<typeof CrosswordGridSvg>
type Meta = MetaObj<typeof CrosswordGridSvg>

const wordList = [
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

const { grid, size: gridSize}  = createCrossword(wordList, 10)

export const Default: Story = {
  args: {
    grid,
    gridSize,
    className: "absolute inset-0 border border-red-600",
  },
}

export default {
  title: "UI/Input/Components/CrosswordGridSvg",
  component: CrosswordGridSvg,
} as Meta
