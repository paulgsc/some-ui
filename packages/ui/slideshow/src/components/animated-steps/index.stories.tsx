import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { AnimatedSteps, Step } from "."

type Story = StoryObj<typeof AnimatedSteps>
type Meta = MetaObj<typeof AnimatedSteps>

const steps: Step[] = [
  { text: "First, analyze the requirements carefully", number: 1 },
  { text: "Then, break down into smaller tasks", number: 2 },
  { text: "Finally, implement the solution", number: 3 },
]

export const Default: Story = {
  args: {
    steps,
  },
}

export default {
  title: "UI/Slideshow/Components/AnimatedSteps",
  component: AnimatedSteps,
} as Meta
