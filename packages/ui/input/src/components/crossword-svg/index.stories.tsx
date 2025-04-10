import type { CrosswordClues } from "@input/types/crossword"
import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { CrosswordGridSvg } from "."

type Story = StoryObj<typeof CrosswordGridSvg>
type Meta = MetaObj<typeof CrosswordGridSvg>

const words = [
  "JAVASCRIPT",
  "TYPESCRIPT",
  "REACT",
  "ANGULAR",
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
]

const clues: CrosswordClues = {
  across: [
    { id: 1, clue: "Capital of France", answer: "Paris" },
    { id: 2, clue: "Largest planet in the solar system", answer: "Jupiter" },
    { id: 3, clue: "Fastest land animal", answer: "Cheetah" },
  ],
  down: [
    { id: 4, clue: "Biggest ocean", answer: "Pacific" },
    { id: 5, clue: "First man on the moon", answer: "Armstrong" },
    { id: 6, clue: "Smallest planet", answer: "Mercury" },
  ],
}

export const Default: Story = {
  args: {
    words,
    clues,
    className: "absolute inset-0 border border-red-600",
  },
}

export default {
  title: "UI/Input/Components/CrosswordGridSvg",
  component: CrosswordGridSvg,
} as Meta
