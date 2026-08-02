import type { Meta, StoryObj } from "@storybook/react-vite"

import { StepRail } from "."

const meta: Meta<typeof StepRail> = {
  title: "UI/Input/Components/Typing/StepRail",
  component: StepRail,
}

export default meta
type Story = StoryObj<typeof StepRail>

export const Start: Story = {
  args: { total: 10, current: 0, attempt: 0 },
}

export const MidExercise: Story = {
  args: { total: 10, current: 5, attempt: 0 },
}

/** The gate held. This is the only place the miss is ever shown. */
export const AfterAMissedGate: Story = {
  args: { total: 10, current: 5, attempt: 2 },
}

/** A long exercise, where the dots have to stay glanceable. */
export const Long: Story = {
  args: { total: 24, current: 17, attempt: 0 },
}
