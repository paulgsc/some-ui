import { accordionData } from "@stepper/data/accordion-stepper"
import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { GeminiStepper } from "."

type Story = StoryObj<typeof GeminiStepper>
type Meta = MetaObj<typeof GeminiStepper>

export const Default: Story = {
  args: {
    steps: accordionData,
    autoplay: true,
  },
}

export default {
  title: "UI/Stepper/Components/GeminiStepper",
  component: GeminiStepper,
} as Meta
