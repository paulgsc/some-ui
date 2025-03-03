import { mockTradeData } from "@portfolio-chart/data/trade-data"
import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { TradeHeader } from "."

type Story = StoryObj<typeof TradeHeader>
type Meta = MetaObj<typeof TradeHeader>

export const Default: Story = {
  args: {
    date: mockTradeData[2].date,
    symbol: mockTradeData[2].symbol,
    value: mockTradeData[2].value,
  },
  render: (args) => (
    <main className="size-96">
      <TradeHeader {...args} />
    </main>
  ),
}

export default {
  title: "UI/PortfolioChart/Components/TradeHeader",
  component: TradeHeader,
} as Meta
