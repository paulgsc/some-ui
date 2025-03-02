import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { TradeHeader } from "."

type Story = StoryObj<typeof TradeHeader>
type Meta = MetaObj<typeof TradeHeader>

export const Default: Story = {}

export default {
  title: "UI/PortfolioChart/Components/TradeHeader",
  component: TradeHeader,
} as Meta
