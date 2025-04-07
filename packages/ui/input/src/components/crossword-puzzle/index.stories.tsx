import {
  generateCrosswordGrid,
  generateRandomWords,
} from "@input/lib/crossword-grid"
import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { CrosswordPuzzle } from "."

type Story = StoryObj<typeof CrosswordPuzzle>
type Meta = MetaObj<typeof CrosswordPuzzle>

const wordLengths = [13, 3, 6, 7, 4, 12, 4, 5, 9, 4, 15, 5, 8, 8, 5]
const crossword = generateRandomWords(wordLengths)
const grid = generateCrosswordGrid({ words: crossword })

export const Default: Story = {
  args: {
    grid,
  },
}

export default {
  title: "UI/Input/Components/CrosswordPuzzle",
  component: CrosswordPuzzle,
} as Meta
