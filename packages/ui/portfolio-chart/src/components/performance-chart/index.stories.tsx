import { mockTradeData } from "@portfolio-chart/data/trade-data"
import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { PerformanceChart } from "."

type Story = StoryObj<typeof PerformanceChart>
type Meta = MetaObj<typeof PerformanceChart>

export const Default: Story = {
  args: {
    tradeData: mockTradeData,
    currentIndex: 1,
  },
  render: (args) => (
    <div className="h-[400px] md:h-[500px]">
      <PerformanceChart {...args} />
    </div>
  ),
}

export default {
  title: "UI/PortfolioChart/Components/PerformanceChart",
  component: PerformanceChart,
} as Meta
