import { CLUES } from "@input/data/crossword"
import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { Clues } from "."

type Story = StoryObj<typeof Clues>
type Meta = MetaObj<typeof Clues>

export const Default: Story = {
  args: {
    clues: CLUES.across,
    direction: "across",
  },
}

export default {
  title: "UI/Input/Components/Clues",
  component: Clues,
} as Meta
