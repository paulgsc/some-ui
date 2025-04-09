import { createCrossword } from "@input/lib/crossword-grid"
import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { CrosswordPuzzle } from "."

type Story = StoryObj<typeof CrosswordPuzzle>
type Meta = MetaObj<typeof CrosswordPuzzle>

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
const {size, grid}  = createCrossword(wordList, 10)

export const Default: Story = {
  args: {
    grid,
    size,
  },
}

export default {
  title: "UI/Input/Components/CrosswordPuzzle",
  component: CrosswordPuzzle,
} as Meta
