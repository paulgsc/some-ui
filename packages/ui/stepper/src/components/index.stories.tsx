import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import type Step from "."
import Stepper from "."

type Meta = MetaObj<typeof Stepper>
type Story = StoryObj<typeof Stepper>

export default {
  title: "Stepper",
  component: Stepper,
} as Meta

const steps: Array<Step> = [
  { id: 1, label: "Step 1", status: "complete" },
  { id: 2, label: "Step 2", status: "complete" },
  { id: 3, label: "Step 3", status: "complete" },
  { id: 4, label: "Step 4", status: "current" },
]

export const Complete: Story = {
  args: {
    steps: steps,
  },
}
