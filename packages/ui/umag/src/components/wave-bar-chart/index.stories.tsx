import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { WaveBarChart } from "."

type Story = StoryObj<typeof WaveBarChart>
type Meta = MetaObj<typeof WaveBarChart>

export const Default: Story = {
  args: {
    width: 600,
    height: 300,
    bars: 50,
    amplitude: 100,
    frequency: 2,
    speed: 5,
  },
}

export default {
  title: "UI/Umag/Components/WaveBarChart",
  component: WaveBarChart,
} as Meta
