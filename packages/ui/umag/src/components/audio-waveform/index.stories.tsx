import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { WaveBarChart } from "."

type Story = StoryObj<typeof WaveBarChart>
type Meta = MetaObj<typeof WaveBarChart>

export const Default: Story = {
  args: {
    width: 600,
    height: 300,
    bars: 50,
  },
}

const meta = {
  title: "UI/Umag/Components/AudioWaveBarChart",
  component: WaveBarChart,
} satisfies Meta

export default meta
