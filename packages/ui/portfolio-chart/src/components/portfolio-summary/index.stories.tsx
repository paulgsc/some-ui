import { mockTradeData } from "@portfolio-chart/data/trade-data"
import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { PortfolioSummary } from "."

type Story = StoryObj<typeof PortfolioSummary>
type Meta = MetaObj<typeof PortfolioSummary>

export const Default: Story = {
  args: {
    totalTrades: mockTradeData.length,
    totalGain: mockTradeData[1].value,
    winRate: 2,
  },
  render: (args) => (
    <div className="h-[400px] md:h-[500px]">
      <PortfolioSummary {...args} />
    </div>
  ),
}

export default {
  title: "UI/PortfolioChart/Components/PortfolioSummary",
  component: PortfolioSummary,
} as Meta
