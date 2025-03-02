import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { ChartContainer } from "."

type Story = StoryObj<typeof ChartContainer>
type Meta = MetaObj<typeof ChartContainer>

export const Default: Story = {}

export default {
  title: "UI/PortfolioChart/Components/ChartContainer",
  component: ChartContainer,
} as Meta
