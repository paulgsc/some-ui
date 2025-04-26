import { accordionData } from "@stepper/data/accordion-stepper"
import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { GeminiStepper } from "."

type Story = StoryObj<typeof GeminiStepper>
type Meta = MetaObj<typeof GeminiStepper>

export const Default: Story = {
  args: {
    steps: accordionData,
    autoplay: true,
    duration: 3 * 1000,
  },
  render: (args) => (
    <main className="h-96 border border-red-500">
      <GeminiStepper {...args} />
    </main>
  ),
}

export default {
  title: "UI/Stepper/Components/GeminiStepper",
  component: GeminiStepper,
} as Meta
