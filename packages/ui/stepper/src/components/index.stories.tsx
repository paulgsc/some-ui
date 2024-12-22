import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import Stepper from "."

type Meta = MetaObj<typeof Stepper>
type Story = StoryObj<typeof Stepper>

export default {
  title: "Stepper",
  component: Stepper,
} as Meta

export const Complete: Story = {}
