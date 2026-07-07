import { CLUES } from "@input/data/crossword"
import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { Clues } from "."

type Story = StoryObj<typeof Clues>
type Meta = MetaObj<typeof Clues>

export const Default: Story = {
  args: {
    clues: CLUES.across,
    direction: "across",
  },
}

const meta = {
  title: "UI/Input/Components/Clues",
  component: Clues,
} satisfies Meta

export default meta
