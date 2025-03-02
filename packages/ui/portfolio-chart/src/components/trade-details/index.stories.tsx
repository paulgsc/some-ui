import type { Meta as MetaObj, StoryObj } from "@storybook/react"

import { TradeDetails } from "."

type Story = StoryObj<typeof TradeDetails>
type Meta = MetaObj<typeof TradeDetails>

export const Default: Story = {}

export default {
  title: "UI/PortfolioChart/Components/TradeDetails",
  component: TradeDetails,
} as Meta
