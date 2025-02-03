import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import BarChartDemo from "."

type Meta = MetaObj<typeof BarChartDemo>
type Story = StoryObj<typeof BarChartDemo>

// Define the Default story
export const Default: Story = {}

// Exporting the meta information
export default {
  title: "BarChartDemo",
  component: BarChartDemo,
} as Meta
