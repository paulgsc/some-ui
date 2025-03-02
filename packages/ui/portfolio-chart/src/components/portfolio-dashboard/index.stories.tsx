import { mockTradeData } from "@portfolio-chart/data/trade-data"
import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { PortfolioDashboard } from "."

type Story = StoryObj<typeof PortfolioDashboard>
type Meta = MetaObj<typeof PortfolioDashboard>

export const Default: Story = {
  args: {
    data: mockTradeData,
  },
  render: (args) => (
    <main className="flex min-h-screen flex-col items-center justify-between p-4 md:p-8 lg:p-12">
      <div className="w-full max-w-7xl">
        <h1 className="mb-8 text-3xl font-bold">Portfolio Performance</h1>
        <PortfolioDashboard {...args} />
      </div>
    </main>
  ),
}

export default {
  title: "UI/PortfolioChart/Components/PortfolioDashboard",
  component: PortfolioDashboard,
} as Meta
