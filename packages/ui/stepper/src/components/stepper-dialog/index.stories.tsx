import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { StepperDialog } from "."

type Story = StoryObj<typeof StepperDialog>
type Meta = MetaObj<typeof StepperDialog>

export const Default: Story = {
  args: {},
}

const meta = {
  title: "UI/Stepper/Components/StepperDialog",
  component: StepperDialog,
} satisfies Meta

export default meta
