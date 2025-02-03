import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { AnimatedWaveBarChart } from "."

type Story = StoryObj<typeof AnimatedWaveBarChart>
type Meta = MetaObj<typeof AnimatedWaveBarChart>

export const Default: Story = {}

export default {
  title: "UI/Umag/Components/AnimatedWaveBarChart",
  component: AnimatedWaveBarChart,
} as Meta
