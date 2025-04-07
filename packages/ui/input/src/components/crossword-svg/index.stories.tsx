import {
  generateCrosswordGrid,
  generateRandomWords,
} from "@input/lib/crossword-grid"
import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { CrosswordGridSvg } from "."

type Story = StoryObj<typeof CrosswordGridSvg>
type Meta = MetaObj<typeof CrosswordGridSvg>

const wordLengths = [3, 3, 6, 5, 4, 4, 4, 5, 4, 4]
const crossword = generateRandomWords(wordLengths)
const chatgpt = generateCrosswordGrid({ words: crossword })

export const Default: Story = {
  args: {
    grid: chatgpt,
  },
}

export default {
  title: "UI/Input/Components/CrosswordGridSvg",
  component: CrosswordGridSvg,
} as Meta
