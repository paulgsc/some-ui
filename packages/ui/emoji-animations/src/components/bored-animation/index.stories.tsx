import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import BoredAnimation from "."

type Meta = MetaObj<typeof BoredAnimation>
type Story = StoryObj<typeof BoredAnimation>

export default {
  title: "Animations/Components/Bored",
  component: BoredAnimation,
} as Meta

export const Complete: Story = {}

export const GridLayout: Story = {
  args: {
    className: "",
  },
}
