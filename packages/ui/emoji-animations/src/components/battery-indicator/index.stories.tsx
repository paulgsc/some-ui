import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import BatteryIndicator from "."

type Meta = MetaObj<typeof BatteryIndicator>
type Story = StoryObj<typeof BatteryIndicator>

export default {
  title: "NFL Standings",
  component: BatteryIndicator,
} as Meta

export const Complete: Story = {}
