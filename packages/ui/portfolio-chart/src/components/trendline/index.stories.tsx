import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { TrendLine } from "."

type Story = StoryObj<typeof TrendLine>
type Meta = MetaObj<typeof TrendLine>

export const Default: Story = {}

export default {
  title: "UI/PortfolioChart/Components/TrendLine",
  component: TrendLine,
} as Meta
