import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { ChartControls } from "."

type Story = StoryObj<typeof ChartControls>
type Meta = MetaObj<typeof ChartControls>

export const Default: Story = {}

export default {
  title: "UI/PortfolioChart/Components/ChartControls",
  component: ChartControls,
} as Meta
