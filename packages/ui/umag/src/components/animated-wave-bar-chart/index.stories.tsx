import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { AnimatedWaveBarChart } from "."

type Story = StoryObj<typeof AnimatedWaveBarChart>
type Meta = MetaObj<typeof AnimatedWaveBarChart>

export const Default: Story = {}

const meta = {
  title: "UI/Umag/Components/AnimatedWaveBarChart",
  component: AnimatedWaveBarChart,
} satisfies Meta

export default meta
