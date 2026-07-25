import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import BoredAnimation from "."

type Meta = MetaObj<typeof BoredAnimation>
type Story = StoryObj<typeof BoredAnimation>

const meta = {
  title: "Animations/Components/Bored",
  component: BoredAnimation,
} satisfies Meta

export default meta

export const Complete: Story = {}

export const GridLayout: Story = {
  args: {
    className: "",
  },
}
