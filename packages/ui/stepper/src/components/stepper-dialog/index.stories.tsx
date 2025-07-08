import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { StepperDialog } from "."

type Story = StoryObj<typeof StepperDialog>
type Meta = MetaObj<typeof StepperDialog>

export const Default: Story = {
  args: {},
}

export default {
  title: "UI/Stepper/Components/StepperDialog",
  component: StepperDialog,
} as Meta
