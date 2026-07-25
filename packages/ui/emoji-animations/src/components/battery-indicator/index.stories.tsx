import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import BatteryIndicator from "."

type Meta = MetaObj<typeof BatteryIndicator>
type Story = StoryObj<typeof BatteryIndicator>

const meta = {
  title: "Animations/Components/Battery",
  component: BatteryIndicator,
} satisfies Meta

export default meta

export const Complete: Story = {}
